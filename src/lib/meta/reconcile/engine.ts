// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION QUEUE ENGINE (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// The durable verification brain, over injected ports. It REUSES the Phase-3B
// lease/fencing model (schedule/lease) and budget/fairness (schedule/budget) — one
// generic durable-job model, not a second one. The worker drives the sealed
// READ-ONLY inspection gateway, appends an immutable attempt + object-state
// observation, runs the pure decision engine, and applies ONLY safe local repairs
// / discrepancy updates. It NEVER publishes, edits or deletes provider content;
// abandoned inspections have no provider side effect, so recovery simply requeues
// (there is no ambiguous-write to fear). Dead-lettered reconciliation never
// auto-replays. Deterministic: same inputs → same decisions.
// ============================================================================
import type { ReconcilePorts, ReconcileJobRow, ReconcileAttemptRow, ObjectStateRow, DiscrepancyRow, ReconcileJobStatus } from "./ports";
import { DEFAULT_RECONCILE_MAX_ATTEMPTS } from "./ports";
import { heartbeatLease, canFinalize, isLeaseStale, DEFAULT_LEASE_MS, type LeaseState } from "../schedule/lease";
import { decideReconciliation, type ReconcileJobKind, type ReconcileDecision } from "./decision";
import { deriveObjectState, type StateObservation } from "./object-state";
import type { ProviderInspectRequest, ProviderObjectState } from "./provider-types";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent, MetaNotificationEventName } from "../notify/types";

const RECON_TERMINAL = new Set<ReconcileJobStatus>(["verified", "unresolved", "cancelled", "dead_letter"]);
const leaseState = (j: ReconcileJobRow): LeaseState => ({ status: j.status, leaseOwner: j.leaseOwner, leaseToken: j.leaseToken, leaseExpiresAtMs: j.leaseExpiresAtIso ? Date.parse(j.leaseExpiresAtIso) : null });
const ev = (ports: ReconcilePorts, name: MetaNotificationEventName, orgId: string, assetRef: string | null, correlationId: string, data: Record<string, unknown>): MetaNotificationEvent =>
  buildMetaNotificationEvent({ event: name, orgId, occurredAt: ports.clock.nowIso(), assetRef, correlationId, data });

// ── Scheduling a verification job ──────────────────────────────────────────────
export interface ScheduleVerifyInput {
  orgId: string; jobKind: ReconcileJobKind; operationId: string | null; targetId: string | null; providerObjectId: string | null; deadLetterId?: string | null; webhookEventId?: string | null;
  availableAtMs: number; priority?: number; maxAttempts?: number; correlationId: string; idempotencyKey: string; reason?: string;
}
export interface ScheduleVerifyResult { job: ReconcileJobRow; resumed: boolean; events: readonly MetaNotificationEvent[] }

/** Create (or resume) a single active verification job for an anchor + reason. */
export async function scheduleVerification(ports: ReconcilePorts, input: ScheduleVerifyInput): Promise<ScheduleVerifyResult> {
  const existing = await ports.store.findJobByIdem(input.orgId, input.idempotencyKey);
  if (existing) return { job: existing, resumed: true, events: [] };
  const anchor = input.providerObjectId ?? input.targetId ?? input.operationId ?? "";
  const active = anchor ? await ports.store.findActiveJob(input.orgId, input.jobKind, anchor) : null;
  if (active) return { job: active, resumed: true, events: [] };
  const job: ReconcileJobRow = {
    id: ports.ids.uuid(), orgId: input.orgId, jobKind: input.jobKind,
    publishOperationId: input.operationId, publishTargetId: input.targetId, providerObjectId: input.providerObjectId, deadLetterId: input.deadLetterId ?? null, webhookEventId: input.webhookEventId ?? null,
    status: "scheduled", reason: input.reason ?? null, priority: input.priority ?? 100,
    availableAtIso: new Date(input.availableAtMs).toISOString(), attemptCount: 0, maxAttempts: input.maxAttempts ?? DEFAULT_RECONCILE_MAX_ATTEMPTS, confirmationCount: 0,
    leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null,
    startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, safeErrorKind: null,
    correlationId: input.correlationId, idempotencyKey: input.idempotencyKey,
  };
  await ports.store.insertJob(job);
  await ports.audit.log({ action: "meta.reconcile.job_created", entityId: job.id, summary: `reconciliation job created (${input.jobKind})`, metadata: { jobKind: input.jobKind, reason: input.reason ?? null } });
  return { job, resumed: false, events: [] };
}

// ── Dispatch ───────────────────────────────────────────────────────────────────
export interface DispatchOptions { leaseOwner: string; limit?: number; perOrgMax?: number; leaseSeconds?: number }
export async function dispatchDue(ports: ReconcilePorts, opts: DispatchOptions): Promise<readonly ReconcileJobRow[]> {
  const inFlight = await ports.store.countInFlight();
  const globalRoom = Math.max(0, 16 - inFlight.global);
  const limit = Math.max(0, Math.min(opts.limit ?? 8, globalRoom));
  if (limit === 0) return [];
  const claimed = await ports.store.claimDueJobs({ nowMs: ports.clock.nowMs(), limit, perOrgMax: opts.perOrgMax ?? 3, leaseOwner: opts.leaseOwner, leaseSeconds: Math.round((opts.leaseSeconds ?? DEFAULT_LEASE_MS / 1000)) });
  for (const j of claimed) await ports.audit.log({ action: "meta.reconcile.job_claimed", entityId: j.id, summary: "reconciliation job claimed", metadata: { jobKind: j.jobKind } });
  return claimed;
}

export async function heartbeat(ports: ReconcilePorts, orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason: string | null }> {
  const job = await ports.store.getJob(orgId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const hb = heartbeatLease(leaseState(job), owner, token, ports.clock.nowMs());
  if (!hb.ok) return { ok: false, reason: hb.reason };
  await ports.store.updateJob({ ...job, leaseExpiresAtIso: new Date(hb.leaseExpiresAtMs!).toISOString(), heartbeatAtIso: new Date(hb.heartbeatAtMs!).toISOString() });
  return { ok: true, reason: null };
}

// ── Work one claimed verification job ───────────────────────────────────────────
export interface WorkResult { job: ReconcileJobRow; decision: ReconcileDecision | null; outcome: string; events: readonly MetaNotificationEvent[] }

const DELETED_EVENT: Partial<Record<ProviderObjectState, MetaNotificationEventName>> = { deleted: "meta.post.provider_deleted", hidden: "meta.post.provider_hidden" };

export async function workJob(ports: ReconcilePorts, job0: ReconcileJobRow): Promise<WorkResult> {
  const current = await ports.store.getJob(job0.orgId, job0.id);
  if (!current) return { job: job0, decision: null, outcome: "fence_not_found", events: [] };
  if (RECON_TERMINAL.has(current.status)) return { job: current, decision: null, outcome: "already_terminal", events: [] };
  const fence = canFinalize(leaseState(current), job0.leaseOwner ?? "", job0.leaseToken ?? "");
  if (!fence.ok) return { job: current, decision: null, outcome: `fence_${fence.reason}`, events: [] };

  const startedMs = ports.clock.nowMs();
  const job: ReconcileJobRow = { ...current, status: "executing", startedAtIso: ports.clock.nowIso(), heartbeatAtIso: ports.clock.nowIso() };
  await ports.store.updateJob(job);

  const targetId = job.publishTargetId;
  const snap = targetId ? await ports.store.getTargetSnapshot(job.orgId, targetId) : null;
  const events: MetaNotificationEvent[] = [];

  // Resolve credential + inspect (READ-ONLY).
  const cred = snap ? await ports.credential.resolve(job.orgId, snap.assetId) : null;
  const attemptNumber = (await ports.store.listAttempts(job.orgId, job.id)).length + 1;
  const attempt: ReconcileAttemptRow = { id: ports.ids.uuid(), orgId: job.orgId, reconciliationJobId: job.id, publishOperationId: job.publishOperationId, publishTargetId: targetId, providerObjectId: job.providerObjectId, attemptNumber, initiatedBy: null, initiationKind: job.jobKind === "manual_verification" ? "manual" : job.webhookEventId ? "webhook" : "automatic", startedAtIso: ports.clock.nowIso(), completedAtIso: null, result: null, observedProviderState: null, safeErrorKind: null, retryClass: null, providerRequestId: null, durationMs: null, correlationId: job.correlationId };

  if (!snap || !cred) {
    await ports.store.insertAttempt({ ...attempt, completedAtIso: ports.clock.nowIso(), result: "blocked", safeErrorKind: !snap ? "target_missing" : "credential_unavailable", durationMs: ports.clock.nowMs() - startedMs });
    const done = await finalize(ports, job, "unresolved", startedMs);
    return { job: done, decision: null, outcome: "blocked_no_credential", events };
  }

  const req: ProviderInspectRequest = { kind: snap.providerContainerId && !snap.providerObjectId ? "container" : "object", platform: snap.platform, assetExternalId: cred.externalId, tokenPlain: cred.tokenPlain, externalObjectId: snap.providerObjectId, externalContainerId: snap.providerContainerId, contentKind: snap.contentKind, correlationId: job.correlationId, timeoutMs: 15_000, lookupWindowMs: 0 };
  const inspect = await ports.inspect.inspect(req);

  // Append an immutable observation, then derive the thresholded state.
  const providerObjectId = job.providerObjectId;
  if (providerObjectId) {
    const obs: ObjectStateRow = { id: ports.ids.uuid(), orgId: job.orgId, providerObjectId, observedAtIso: ports.clock.nowIso(), state: inspect.state, visibilityState: inspect.visibility, providerCreatedTime: inspect.providerCreatedTime, providerUpdatedTime: inspect.providerUpdatedTime, permalink: inspect.permalink, externalParentId: inspect.externalParentId, evidenceKind: "provider_inspection", sourceEventId: job.webhookEventId, sourceReconciliationAttemptId: attempt.id, contentFingerprint: null, safeMetadata: { confidence: inspect.confidence } };
    await ports.store.appendObjectState(obs);
  }
  const history: StateObservation[] = providerObjectId ? (await ports.store.listObjectStates(job.orgId, providerObjectId)).map((o) => ({ state: o.state, evidenceKind: o.evidenceKind, observedAtMs: Date.parse(o.observedAtIso), ambiguous: o.state === "ambiguous" })) : [{ state: inspect.state, evidenceKind: "provider_inspection", observedAtMs: startedMs, ambiguous: inspect.ambiguous }];
  const derived = deriveObjectState(history);

  const decision = decideReconciliation({
    jobKind: job.jobKind as ReconcileJobKind, localTargetStatus: snap.status, hasMapping: !!snap.providerObjectId,
    expectedObjectId: snap.providerObjectId, expectedPermalink: snap.permalink, inspect, derivedState: derived.state, providerFound: inspect.found,
    confirmationCount: job.confirmationCount, attemptCount: job.attemptCount, objectAgeMs: snap.publishedAtMs ? startedMs - snap.publishedAtMs : 0, timeSincePublishedMs: snap.publishedAtMs ? startedMs - snap.publishedAtMs : Infinity,
    capabilityAllowed: true, connectionHealthy: true, verificationOverdue: false, duplicateMapping: targetId ? (await ports.store.countMappingsForTarget(job.orgId, targetId)) > 1 : false, impossibleAggregate: false,
    externallyTriggered: !!job.webhookEventId, jitterFraction: ports.random.fraction(),
  });

  await ports.store.insertAttempt({ ...attempt, completedAtIso: ports.clock.nowIso(), result: decision.kind, observedProviderState: derived.state, safeErrorKind: inspect.error?.kind ?? null, retryClass: inspect.retryClass, durationMs: ports.clock.nowMs() - startedMs });

  // Apply the decision (safe local effects only).
  const applied = await applyDecision(ports, job, snap, decision, derived.state);
  events.push(...applied.events);
  const done = applied.job;
  await ports.audit.log({ action: `meta.reconcile.${decision.kind}`, entityId: job.id, summary: `reconciliation ${decision.kind}`, metadata: { jobKind: job.jobKind, providerState: derived.state, reason: decision.reason } });
  const delEv = DELETED_EVENT[derived.state];
  if (delEv && decision.discrepancies.some((d) => d.type === "provider_deleted" || d.type === "provider_hidden")) events.push(ev(ports, delEv, job.orgId, targetId, job.correlationId, { operationId: job.publishOperationId, targetId, state: derived.state }));
  return { job: done, decision, outcome: decision.kind, events };
}

async function applyDecision(ports: ReconcilePorts, job: ReconcileJobRow, snap: NonNullable<Awaited<ReturnType<ReconcilePorts["store"]["getTargetSnapshot"]>>>, decision: ReconcileDecision, derivedState: ProviderObjectState): Promise<{ job: ReconcileJobRow; events: MetaNotificationEvent[] }> {
  const startMs = ports.clock.nowMs();
  const events: MetaNotificationEvent[] = [];
  const targetId = job.publishTargetId!;
  const nowIso = ports.clock.nowIso();

  // Safe repairs / mapping creation.
  if ((decision.kind === "provider_object_create" || decision.kind === "local_state_update") && decision.providerObjectId) {
    if (decision.createMapping) await ports.store.createProviderObjectMapping({ orgId: job.orgId, operationId: snap.operationId, targetId, platform: snap.platform, assetId: snap.assetId, providerObjectType: snap.contentKind, externalObjectId: decision.providerObjectId, externalContainerId: snap.providerContainerId, permalink: decision.permalink });
    await ports.store.markTargetPublished(job.orgId, targetId, decision.providerObjectId, decision.permalink);
    await ports.store.resolveOpenDiscrepancies(job.orgId, targetId, "auto_repaired");
    await ports.audit.log({ action: "meta.reconcile.auto_repair", entityId: targetId, summary: "safe auto-repair applied", metadata: { actions: decision.repair?.actions ?? [], reason: decision.reason } });
    events.push(ev(ports, "meta.post.verified", job.orgId, targetId, job.correlationId, { operationId: snap.operationId, targetId, providerObjectId: decision.providerObjectId }));
    if (decision.ambiguous) events.push(ev(ports, "meta.post.ambiguous_resolved", job.orgId, targetId, job.correlationId, { operationId: snap.operationId, targetId, resolution: "published" }));
    return { job: await finalize(ports, job, "verified", startMs), events };
  }
  if (decision.kind === "retry_publish_eligible") {
    await ports.store.setTargetManualRetryEligible(job.orgId, targetId);
    if (decision.ambiguous) events.push(ev(ports, "meta.post.ambiguous_resolved", job.orgId, targetId, job.correlationId, { operationId: snap.operationId, targetId, resolution: "not_published" }));
    return { job: await finalize(ports, job, "verified", startMs), events };
  }
  if (decision.kind === "discrepancy_open") {
    const d = decision.discrepancies[0];
    const row: DiscrepancyRow = { id: ports.ids.uuid(), orgId: job.orgId, publishOperationId: snap.operationId, publishTargetId: targetId, providerObjectId: job.providerObjectId, discrepancyType: d.type, severity: d.severity, status: "open", detectedAtIso: nowIso, lastConfirmedAtIso: nowIso, evidenceCount: 1, safeSummary: d.safeSummary, autoRepairable: d.autoRepairable, repairedAtIso: null, repairedBy: null, resolution: null, resolvedBy: null, resolutionReason: null };
    const saved = await ports.store.upsertDiscrepancy(row);
    // Emit discrepancy event only when it is newly detected (evidence_count == 1).
    if (saved.evidenceCount <= 1) events.push(ev(ports, "meta.post.discrepancy_detected", job.orgId, targetId, job.correlationId, { operationId: snap.operationId, targetId, discrepancyType: d.type, severity: d.severity }));
    return { job: await finalize(ports, job, "discrepancy_found", startMs), events };
  }
  if (decision.kind === "discrepancy_resolve") {
    await ports.store.resolveOpenDiscrepancies(job.orgId, targetId, "provider_consistent");
    await ports.store.setTargetVerified(job.orgId, targetId, derivedState);
    events.push(ev(ports, "meta.post.verified", job.orgId, targetId, job.correlationId, { operationId: snap.operationId, targetId, state: derivedState }));
    return { job: await finalize(ports, job, "verified", startMs), events };
  }
  if (decision.kind === "no_change") {
    await ports.store.setTargetVerified(job.orgId, targetId, derivedState);
    return { job: await finalize(ports, job, "verified", startMs), events };
  }
  if (decision.kind === "manual_review") return { job: await finalize(ports, job, "unresolved", startMs), events };
  if (decision.kind === "blocked") { events.push(ev(ports, "meta.post.verification_failed", job.orgId, targetId, job.correlationId, { operationId: snap.operationId, targetId, reason: decision.blockedReason })); return { job: await finalize(ports, job, "unresolved", startMs), events }; }

  // retry_verification / discrepancy_update → reschedule a bounded follow-up.
  if (job.attemptCount + 1 >= job.maxAttempts) {
    events.push(ev(ports, "meta.post.verification_failed", job.orgId, targetId, job.correlationId, { operationId: snap.operationId, targetId, reason: "attempts_exhausted" }));
    return { job: await finalize(ports, job, decision.followup.schedule ? "unresolved" : "unresolved", startMs), events };
  }
  const delay = decision.followup.schedule ? decision.followup.delayMs : 60_000;
  const next: ReconcileJobRow = { ...job, status: "retry_wait", attemptCount: job.attemptCount + 1, confirmationCount: decision.ambiguous?.nextConfirmationCount ?? job.confirmationCount, availableAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), nextAttemptAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
  await ports.store.updateJob(next);
  await ports.audit.log({ action: "meta.reconcile.retry_scheduled", entityId: job.id, summary: "verification retry scheduled", metadata: { delayMs: delay, attempt: next.attemptCount } });
  return { job: next, events };
}

async function finalize(ports: ReconcilePorts, job: ReconcileJobRow, status: ReconcileJobStatus, startMs: number): Promise<ReconcileJobRow> {
  const done: ReconcileJobRow = { ...job, status, completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
  await ports.store.updateJob(done);
  void startMs;
  return done;
}

// ── Recovery — inspection is READ-ONLY, so an abandoned job simply requeues ─────
export interface RecoverResult { recovered: number; requeued: number }
export async function recoverAbandoned(ports: ReconcilePorts, opts?: { limit?: number }): Promise<RecoverResult> {
  const nowMs = ports.clock.nowMs();
  const stale = await ports.store.findStaleJobs(nowMs, opts?.limit ?? 16);
  let requeued = 0;
  for (const job of stale) {
    if (!isLeaseStale(leaseState(job), nowMs)) continue;
    // Inspection performs no provider write (F68): safe to requeue unconditionally,
    // bounded by attempts. No ambiguous-write handling is required here.
    if (job.attemptCount >= job.maxAttempts) { await ports.store.updateJob({ ...job, status: "unresolved", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); }
    else { await ports.store.updateJob({ ...job, status: "available", availableAtIso: new Date(nowMs).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); requeued++; }
    await ports.audit.log({ action: "meta.reconcile.recovered", entityId: job.id, summary: "abandoned reconciliation job recovered (read-only, safe requeue)", metadata: { jobKind: job.jobKind } });
  }
  return { recovered: stale.length, requeued };
}
