// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT REFRESH ENGINE (PURE). Phase 2.
// ----------------------------------------------------------------------------
// The durable, bounded insight-refresh brain, over injected ports. It REUSES the
// Batch-6.8 lease/fencing model (schedule/lease) and bounded backoff (schedule/
// retry) — one durable-job model, not a new one. Each refresh reads the sealed
// READ-ONLY insights gateway, APPENDS snapshots to the time series (never mutates
// history), advances the per-subject refresh cursor, and schedules the NEXT
// bounded refresh (decaying cadence; quiesce for old objects). A transient failure
// retries on a bounded schedule; abandoned refreshes safely requeue (reads have no
// provider side effect). Deterministic: same inputs → same effects.
// ============================================================================
import type { InsightsPorts, InsightJobRow, InsightJobStatus, RefreshStateRow } from "./ports";
import { DEFAULT_INSIGHT_MAX_ATTEMPTS } from "./ports";
import { heartbeatLease, canFinalize, isLeaseStale, DEFAULT_LEASE_MS, type LeaseState } from "../schedule/lease";
import { computeBackoffMs, DEFAULT_RETRY_POLICY } from "../schedule/retry";
import { nextRefresh, type RefreshPolicy } from "./policy";
import { sanitizeSnapshots } from "./metrics";
import type { InsightSubjectKind } from "./domain";
import type { InsightFetchRequest } from "./provider-types";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent } from "../notify/types";

const TERMINAL = new Set<InsightJobStatus>(["succeeded", "failed", "dead_letter"]);
const leaseState = (j: InsightJobRow): LeaseState => ({ status: j.status, leaseOwner: j.leaseOwner, leaseToken: j.leaseToken, leaseExpiresAtMs: j.leaseExpiresAtIso ? Date.parse(j.leaseExpiresAtIso) : null });

// ── Scheduling a refresh ─────────────────────────────────────────────────────
export interface ScheduleRefreshInput { orgId: string; subjectKind: InsightSubjectKind; subjectRef: string; platform: InsightJobRow["platform"]; availableAtMs?: number; priority?: number; correlationId: string; idempotencyKey: string }
export async function scheduleRefresh(ports: InsightsPorts, input: ScheduleRefreshInput): Promise<{ job: InsightJobRow; resumed: boolean }> {
  const existing = await ports.store.findJobByIdem(input.orgId, input.idempotencyKey);
  if (existing) return { job: existing, resumed: true };
  const active = await ports.store.findActiveJob(input.orgId, input.subjectKind, input.subjectRef);
  if (active) return { job: active, resumed: true };
  // Establish/keep the per-subject cursor (first_observed anchors object aging).
  const state = await ports.store.getRefreshState(input.orgId, input.subjectKind, input.subjectRef);
  if (!state) await ports.store.upsertRefreshState(input.orgId, { subjectKind: input.subjectKind, subjectRef: input.subjectRef, platform: input.platform, firstObservedAtIso: ports.clock.nowIso(), lastRefreshedAtIso: null, nextRefreshAtIso: null, refreshCount: 0, quiesced: false });
  const job = newJob(ports, input, input.availableAtMs ?? ports.clock.nowMs());
  await ports.store.insertJob(job);
  await ports.audit.log({ action: "meta.insights.refresh_scheduled", entityId: job.id, summary: `insight refresh scheduled (${input.subjectKind})`, metadata: { subjectKind: input.subjectKind, platform: input.platform } });
  return { job, resumed: false };
}

function newJob(ports: InsightsPorts, input: ScheduleRefreshInput, availableAtMs: number): InsightJobRow {
  return {
    id: ports.ids.uuid(), orgId: input.orgId, jobKind: input.subjectKind === "object" ? "object_insight_refresh" : "account_insight_refresh", subjectKind: input.subjectKind, subjectRef: input.subjectRef, platform: input.platform,
    status: "scheduled", priority: input.priority ?? 100, availableAtIso: new Date(availableAtMs).toISOString(),
    attemptCount: 0, maxAttempts: DEFAULT_INSIGHT_MAX_ATTEMPTS, retryBudgetRemaining: DEFAULT_INSIGHT_MAX_ATTEMPTS, requeueCount: 0,
    leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null,
    startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null,
    correlationId: input.correlationId, idempotencyKey: input.idempotencyKey,
  };
}

// ── Dispatch / heartbeat ──────────────────────────────────────────────────────
export async function dispatchDue(ports: InsightsPorts, opts: { leaseOwner: string; limit?: number; perOrgMax?: number; leaseSeconds?: number }): Promise<readonly InsightJobRow[]> {
  const inFlight = await ports.store.countInFlight();
  const limit = Math.max(0, Math.min(opts.limit ?? 8, Math.max(0, 16 - inFlight.global)));
  if (limit === 0) return [];
  const claimed = await ports.store.claimDueJobs({ nowMs: ports.clock.nowMs(), limit, perOrgMax: opts.perOrgMax ?? 3, leaseOwner: opts.leaseOwner, leaseSeconds: Math.round((opts.leaseSeconds ?? DEFAULT_LEASE_MS / 1000)) });
  for (const j of claimed) await ports.audit.log({ action: "meta.insights.job_claimed", entityId: j.id, summary: "insight refresh claimed", metadata: { subjectKind: j.subjectKind } });
  return claimed;
}
export async function heartbeat(ports: InsightsPorts, orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason: string | null }> {
  const job = await ports.store.getJob(orgId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const hb = heartbeatLease(leaseState(job), owner, token, ports.clock.nowMs());
  if (!hb.ok) return { ok: false, reason: hb.reason };
  await ports.store.updateJob({ ...job, leaseExpiresAtIso: new Date(hb.leaseExpiresAtMs!).toISOString(), heartbeatAtIso: new Date(hb.heartbeatAtMs!).toISOString() });
  return { ok: true, reason: null };
}

// ── Work one claimed refresh job ────────────────────────────────────────────────
export interface WorkResult { job: InsightJobRow; outcome: string; events: readonly MetaNotificationEvent[]; appended?: number }
export async function workJob(ports: InsightsPorts, job0: InsightJobRow, ctx?: { policy?: RefreshPolicy }): Promise<WorkResult> {
  const current = await ports.store.getJob(job0.orgId, job0.id);
  if (!current) return { job: job0, outcome: "fence_not_found", events: [] };
  if (TERMINAL.has(current.status)) return { job: current, outcome: "already_terminal", events: [] };
  const fence = canFinalize(leaseState(current), job0.leaseOwner ?? "", job0.leaseToken ?? "");
  if (!fence.ok) return { job: current, outcome: `fence_${fence.reason}`, events: [] };
  const job: InsightJobRow = { ...current, status: "executing", startedAtIso: ports.clock.nowIso(), heartbeatAtIso: ports.clock.nowIso() };
  await ports.store.updateJob(job);

  const isObject = job.subjectKind === "object";
  const ref = isObject ? await ports.store.objectRef(job.orgId, job.subjectRef) : await ports.store.accountRef(job.orgId, job.subjectRef);
  if (!ref) return finalize(ports, job, "failed", "subject_ref_missing", []);
  const assetId = isObject ? (ref as { assetId: string }).assetId : job.subjectRef;
  if (!(await ports.capability.analyticsReadAllowed(job.orgId, assetId, job.platform))) return finalize(ports, job, "blocked", "capability_denied", []);
  const cred = await ports.credential.resolve(job.orgId, assetId);
  if (!cred) return finalize(ports, job, "blocked", "credential_unavailable", []);

  const req: InsightFetchRequest = { subjectKind: job.subjectKind, platform: job.platform, assetExternalId: cred.externalId, tokenPlain: cred.tokenPlain, objectExternalId: isObject ? (ref as { objectExternalId: string }).objectExternalId : null, correlationId: job.correlationId, timeoutMs: 15_000 };
  const res = await ports.gateway.fetchInsights(req);
  if (!res.ok) return retryOrFail(ports, job, res.ambiguous ? "timeout" : (res.error?.kind ?? "internal"), "fetch_failed");

  // Append snapshots (append-only; the engine stamps observedAt deterministically).
  const observedAt = ports.clock.nowIso();
  const snaps = sanitizeSnapshots(res.snapshots.map((s) => ({ ...s, observedAt })));
  const appended = isObject
    ? await ports.store.appendObjectSnapshots(job.orgId, job.subjectRef, job.platform, snaps, job.id)
    : await ports.store.appendAccountSnapshots(job.orgId, job.subjectRef, job.platform, snaps, job.id);

  // Advance the cursor + schedule the next bounded refresh.
  const state = await ports.store.getRefreshState(job.orgId, job.subjectKind, job.subjectRef);
  const firstObservedMs = state?.firstObservedAtIso ? Date.parse(state.firstObservedAtIso) : ports.clock.nowMs();
  const sched = nextRefresh({ subjectKind: job.subjectKind, objectAgeMs: ports.clock.nowMs() - firstObservedMs, refreshCount: state?.refreshCount ?? 0, policy: ctx?.policy, jitterFraction: ports.random.fraction() });
  const nextState: RefreshStateRow = { subjectKind: job.subjectKind, subjectRef: job.subjectRef, platform: job.platform, firstObservedAtIso: state?.firstObservedAtIso ?? observedAt, lastRefreshedAtIso: observedAt, nextRefreshAtIso: sched.schedule ? new Date(ports.clock.nowMs() + sched.delayMs).toISOString() : null, refreshCount: (state?.refreshCount ?? 0) + 1, quiesced: sched.quiesce };
  await ports.store.upsertRefreshState(job.orgId, nextState);
  if (sched.schedule && !sched.quiesce) {
    const nextIdem = `${job.orgId}|insight|${job.subjectKind}|${job.subjectRef}|${nextState.refreshCount}`;
    if (!(await ports.store.findJobByIdem(job.orgId, nextIdem))) await ports.store.insertJob(newJob(ports, { orgId: job.orgId, subjectKind: job.subjectKind, subjectRef: job.subjectRef, platform: job.platform, correlationId: job.correlationId, idempotencyKey: nextIdem }, ports.clock.nowMs() + sched.delayMs));
  }
  const events = [buildMetaNotificationEvent({ event: "meta.insights.refreshed", orgId: job.orgId, occurredAt: observedAt, assetRef: job.subjectRef, correlationId: job.correlationId, data: { subjectKind: job.subjectKind, metrics: appended } })];
  const done = await finalize(ports, job, "succeeded", null, events);
  return { ...done, appended };
}

async function retryOrFail(ports: InsightsPorts, job: InsightJobRow, errorKind: string, reason: string): Promise<WorkResult> {
  const transient = ["timeout", "network", "rate_limited", "transient_provider", "unavailable"].includes(errorKind);
  if (transient && job.retryBudgetRemaining > 0 && job.attemptCount + 1 < job.maxAttempts) {
    const delay = computeBackoffMs(job.attemptCount + 1, DEFAULT_RETRY_POLICY, ports.random.fraction(), null);
    const next: InsightJobRow = { ...job, status: "retry_wait", attemptCount: job.attemptCount + 1, retryBudgetRemaining: job.retryBudgetRemaining - 1, availableAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), lastErrorKind: errorKind, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
    await ports.store.updateJob(next);
    return { job: next, outcome: "retry_scheduled", events: [] };
  }
  const events = [buildMetaNotificationEvent({ event: "meta.insights.refresh_failed", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: job.subjectRef, correlationId: job.correlationId, data: { subjectKind: job.subjectKind, reason } })];
  return finalize(ports, job, transient ? "dead_letter" : "failed", reason, events);
}
async function finalize(ports: InsightsPorts, job: InsightJobRow, status: InsightJobStatus, error: string | null, events: readonly MetaNotificationEvent[]): Promise<WorkResult> {
  const done: InsightJobRow = { ...job, status, completedAtIso: ports.clock.nowIso(), lastErrorKind: error, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
  await ports.store.updateJob(done);
  await ports.audit.log({ action: "meta.insights.job_completed", entityId: job.id, summary: `insight refresh ${status}`, metadata: { subjectKind: job.subjectKind, status, error } });
  return { job: done, outcome: status, events };
}

// ── Recovery — insight reads are READ-ONLY, so abandoned jobs safely requeue ─────
export async function recoverAbandoned(ports: InsightsPorts, opts?: { limit?: number }): Promise<{ recovered: number; requeued: number }> {
  const nowMs = ports.clock.nowMs();
  const stale = await ports.store.findStaleJobs(nowMs, opts?.limit ?? 16);
  let requeued = 0;
  for (const job of stale) {
    if (!isLeaseStale(leaseState(job), nowMs)) continue;
    if (job.attemptCount >= job.maxAttempts) await ports.store.updateJob({ ...job, status: "failed", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null });
    else { await ports.store.updateJob({ ...job, status: "available", requeueCount: job.requeueCount + 1, availableAtIso: new Date(nowMs).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); requeued++; }
    await ports.audit.log({ action: "meta.insights.job_recovered", entityId: job.id, summary: "abandoned insight refresh recovered (read-only, safe requeue)", metadata: { subjectKind: job.subjectKind } });
  }
  return { recovered: stale.length, requeued };
}
