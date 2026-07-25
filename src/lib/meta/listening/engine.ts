// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · SOCIAL LISTENING ENGINE (PURE). Phase 5.
// ----------------------------------------------------------------------------
// The durable listening brain over injected ports. REUSES the Batch-6.8 lease/
// fencing + bounded backoff (one durable-job model). Flow: due source / verified
// webhook → enqueue → claim → fence → resolve trusted credential → capability +
// token-health + kill-switch check → sealed READ-ONLY gateway pull (BOUNDED pages/
// records) → normalize → dedup → persist canonical mentions → deterministic match →
// project actionable items to the Phase-3 inbox → enqueue Phase-4 scoring on the
// EXISTING path → advance cursor ATOMICALLY WITH successful persistence → schedule
// bounded follow-up → deduped notifications → finalize. A failed read NEVER persists
// fabricated empty results and NEVER advances the cursor. Nothing writes to Meta.
// ============================================================================
import type { ListeningPorts, ListeningJobRow, ListeningJobStatus, ListeningJobKind, ListeningSourceRow } from "./ports";
import { DEFAULT_LISTENING_MAX_ATTEMPTS } from "./ports";
import { heartbeatLease, canFinalize, isLeaseStale, DEFAULT_LEASE_MS, type LeaseState } from "../schedule/lease";
import { computeBackoffMs, DEFAULT_RETRY_POLICY } from "../schedule/retry";
import { normalizeMention, contentFingerprint, type CanonicalMention } from "./normalize";
import { decideMatch, isActionable } from "./match";
import { canPullMore, nextPollDelayMs, LISTENING_PAGE_LIMIT } from "./poll";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent } from "../notify/types";
import type { EvidenceKind } from "./domain";

const TERMINAL = new Set<ListeningJobStatus>(["succeeded", "failed", "dead_letter"]);
const leaseState = (j: ListeningJobRow): LeaseState => ({ status: j.status, leaseOwner: j.leaseOwner, leaseToken: j.leaseToken, leaseExpiresAtMs: j.leaseExpiresAtIso ? Date.parse(j.leaseExpiresAtIso) : null });
const surfaceFor = (s: ListeningSourceRow) => s.sourceKind;

// ── Scheduling ────────────────────────────────────────────────────────────────
export async function scheduleJob(ports: ListeningPorts, input: { orgId: string; sourceId: string; jobKind: ListeningJobKind; availableAtMs?: number; priority?: number; cursorRef?: string | null; correlationId: string; idempotencyKey: string }): Promise<{ job: ListeningJobRow; resumed: boolean }> {
  const existing = await ports.store.findJobByIdem(input.orgId, input.idempotencyKey);
  if (existing) return { job: existing, resumed: true };
  const active = await ports.store.findActiveJob(input.orgId, input.sourceId, input.jobKind);
  if (active) return { job: active, resumed: true };
  const job = newJob(ports, input);
  await ports.store.insertJob(job);
  await ports.audit.log({ action: "meta.listening.job_scheduled", entityId: job.id, summary: "listening job scheduled", metadata: { jobKind: input.jobKind } });
  return { job, resumed: false };
}
function newJob(ports: ListeningPorts, input: { orgId: string; sourceId: string; jobKind: ListeningJobKind; availableAtMs?: number; priority?: number; cursorRef?: string | null; correlationId: string; idempotencyKey: string }): ListeningJobRow {
  return { id: ports.ids.uuid(), orgId: input.orgId, listeningSourceId: input.sourceId, jobKind: input.jobKind, status: "scheduled", priority: input.priority ?? 100, availableAtIso: new Date(input.availableAtMs ?? ports.clock.nowMs()).toISOString(), cursorRef: input.cursorRef ?? null, pageBudget: 3, recordBudget: 200, attemptCount: 0, maxAttempts: DEFAULT_LISTENING_MAX_ATTEMPTS, retryBudgetRemaining: DEFAULT_LISTENING_MAX_ATTEMPTS, requeueCount: 0, retryAfterMs: null, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey };
}

/** Enqueue polls for due, ENABLED sources (kill-switch aware). */
export async function enqueueDuePolls(ports: ListeningPorts, opts: { limit?: number; correlationId: string }): Promise<{ scanned: number; enqueued: number }> {
  const due = await ports.store.listDueSources(ports.clock.nowMs(), opts.limit ?? 50);
  let enqueued = 0;
  for (const s of due) {
    if (!s.enabled) continue;
    if (await ports.capability.killSwitchEngaged(s.orgId)) continue;   // kill switch stops dispatch
    const idem = `${s.id}|listening_poll|${s.nextPollAtIso ?? ""}`;
    const r = await scheduleJob(ports, { orgId: s.orgId, sourceId: s.id, jobKind: "listening_poll", cursorRef: s.cursorRef, correlationId: opts.correlationId, idempotencyKey: idem });
    if (!r.resumed) enqueued++;
  }
  return { scanned: due.length, enqueued };
}

// ── Dispatch / heartbeat ──────────────────────────────────────────────────────
export async function dispatchDue(ports: ListeningPorts, opts: { leaseOwner: string; limit?: number; perOrgMax?: number; leaseSeconds?: number }): Promise<readonly ListeningJobRow[]> {
  const inFlight = await ports.store.countInFlight();
  const limit = Math.max(0, Math.min(opts.limit ?? 8, Math.max(0, 16 - inFlight.global)));
  if (limit === 0) return [];
  const claimed = await ports.store.claimDueJobs({ nowMs: ports.clock.nowMs(), limit, perOrgMax: opts.perOrgMax ?? 3, leaseOwner: opts.leaseOwner, leaseSeconds: Math.round((opts.leaseSeconds ?? DEFAULT_LEASE_MS / 1000)) });
  for (const j of claimed) await ports.audit.log({ action: "meta.listening.job_claimed", entityId: j.id, summary: "listening job claimed", metadata: { jobKind: j.jobKind } });
  return claimed;
}
export async function heartbeat(ports: ListeningPorts, orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason: string | null }> {
  const job = await ports.store.getJob(orgId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const hb = heartbeatLease(leaseState(job), owner, token, ports.clock.nowMs());
  if (!hb.ok) return { ok: false, reason: hb.reason };
  await ports.store.updateJob({ ...job, leaseExpiresAtIso: new Date(hb.leaseExpiresAtMs!).toISOString(), heartbeatAtIso: new Date(hb.heartbeatAtMs!).toISOString() });
  return { ok: true, reason: null };
}

// ── Work one claimed listening job ────────────────────────────────────────────────
export interface WorkResult { job: ListeningJobRow; outcome: string; events: readonly MetaNotificationEvent[]; ingested?: number; deduped?: number; matched?: number; projected?: number }
export async function workJob(ports: ListeningPorts, job0: ListeningJobRow): Promise<WorkResult> {
  const current = await ports.store.getJob(job0.orgId, job0.id);
  if (!current) return { job: job0, outcome: "fence_not_found", events: [] };
  if (TERMINAL.has(current.status)) return { job: current, outcome: "already_terminal", events: [] };
  const fence = canFinalize(leaseState(current), job0.leaseOwner ?? "", job0.leaseToken ?? "");
  if (!fence.ok) return { job: current, outcome: `fence_${fence.reason}`, events: [] };
  const job: ListeningJobRow = { ...current, status: "executing", startedAtIso: ports.clock.nowIso(), heartbeatAtIso: ports.clock.nowIso() };
  await ports.store.updateJob(job);

  const source = await ports.store.getSource(job.orgId, job.listeningSourceId);
  if (!source) return finalize(ports, job, "failed", "source_missing", []);
  if (!source.enabled) return finalize(ports, job, "blocked", "source_disabled", []);
  if (await ports.capability.killSwitchEngaged(job.orgId)) return finalize(ports, job, "blocked", "kill_switch", []);

  // Capability + token-health BEFORE any provider call (never fabricate support).
  const cap = await ports.capability.listeningAllowed(job.orgId, source.assetId, source.platform, source.sourceKind);
  if (!cap.allowed) { await ports.store.updateSource(job.orgId, source.id, { capabilityState: cap.state, safeBlockReason: cap.reason, lastSyncStatus: "blocked" }); await ports.audit.log({ action: "meta.listening.capability_blocked", entityId: source.id, summary: "listening blocked", metadata: { state: cap.state } }); return finalize(ports, job, "blocked", cap.state, []); }

  const cred = await ports.credential.resolve(job.orgId, source.assetId);
  if (!cred) return finalize(ports, job, "blocked", "credential_unavailable", []);

  // BOUNDED read loop (pages + records capped), atomic cursor advance on persist.
  const evidence: EvidenceKind = job.jobKind === "listening_backfill" ? "provider_backfill" : "provider_poll";
  let cursor = job.cursorRef; let pagesPulled = 0, recordsPulled = 0, ingested = 0, deduped = 0, matched = 0, projected = 0;
  const events: MetaNotificationEvent[] = [];
  let hadActivity = false;
  while (canPullMore({ pagesPulled, recordsPulled, pageBudget: job.pageBudget, recordBudget: job.recordBudget })) {
    const res = await ports.gateway.fetchMentions({ platform: source.platform, surface: surfaceFor(source), assetExternalId: cred.externalId, tokenPlain: cred.tokenPlain, cursorRef: cursor, pageLimit: LISTENING_PAGE_LIMIT, correlationId: job.correlationId });
    if (!res.ok) {
      // A failed read must NEVER persist fabricated results NOR advance the cursor.
      if (res.ambiguous) return retryOrFail(ports, job, "provider_transient", res.error?.kind ?? "transient", res.error?.retryAfterMs ?? null);
      // Permanent permission/policy error — do not loop.
      await ports.store.updateSource(job.orgId, source.id, { lastSyncStatus: "error", safeBlockReason: res.error?.kind ?? "provider_error" });
      return finalize(ports, job, "failed", res.error?.kind ?? "provider_permanent", []);
    }
    pagesPulled++;
    for (const cm of res.mentions as readonly CanonicalMention[]) {
      recordsPulled++;
      const rec = normalizeMention(source.platform, cm, evidence);
      if (!rec.externalMentionId) continue;
      const fp = contentFingerprint(rec);
      const up = await ports.store.upsertMention(job.orgId, source.id, rec, fp);   // dedup by (org,platform,external id)
      if (up.created) ingested++; else deduped++;
      if (!up.changed && !up.created) continue;                                    // unchanged edit → skip downstream
      hadActivity = hadActivity || up.created;
      // Deterministic match (trusted asset always; provider-object when evidence exists).
      const cand = await ports.store.matchCandidates(job.orgId, source.assetId, rec.sourceObjectRef);
      const m = decideMatch(cand);
      await ports.store.setMentionMatch(job.orgId, up.id, m);
      if (m.matchState !== "unmatched") matched++;
      // Project actionable mentions into the Phase-3 inbox + enqueue Phase-4 scoring.
      if (isActionable(m)) {
        const proj = await ports.inbox.projectMention(job.orgId, { platform: source.platform, subjectRef: rec.externalMentionId, providerObjectId: m.matchedProviderObjectId, participantDisplay: rec.authorDisplaySafe, preview: rec.messageText, lastActivityAt: rec.providerCreatedAt });
        await ports.store.setMentionProjection(job.orgId, up.id, proj.conversationId);
        if (proj.created) projected++;
        await ports.intelligence.enqueueForConversation(job.orgId, proj.conversationId);   // Phase-4 path (no new model)
      }
      if (up.created) events.push(mentionEvent(ports, job, source, rec.externalMentionId));
      if (recordsPulled >= Math.min(job.recordBudget, 200)) break;
    }
    // Cursor advances ONLY after the page persisted successfully (atomic-with-persist).
    cursor = res.nextCursorRef;
    await ports.store.updateSource(job.orgId, source.id, { cursorRef: cursor });
    if (!cursor) break;                        // end of feed
  }

  // Bounded follow-up: schedule the next poll on a decaying cadence (never forever-frequent).
  const delay = nextPollDelayMs({ consecutiveEmptyPolls: hadActivity ? 0 : 1, hadActivity });
  await ports.store.updateSource(job.orgId, source.id, { lastPolledAtIso: ports.clock.nowIso(), nextPollAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), lastSyncStatus: "ok", capabilityState: "allowed", safeBlockReason: null });
  await ports.audit.log({ action: "meta.listening.page_ingested", entityId: source.id, summary: "listening page ingested", metadata: { ingested, deduped, matched, projected } });
  const done = await finalize(ports, job, "succeeded", null, events);
  return { ...done, ingested, deduped, matched, projected };
}

function mentionEvent(ports: ListeningPorts, job: ListeningJobRow, source: ListeningSourceRow, externalId: string): MetaNotificationEvent {
  return buildMetaNotificationEvent({ event: "meta.listening.new_mention", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: source.assetExternalId, correlationId: job.correlationId, data: { platform: source.platform, sourceKind: source.sourceKind, ref: externalId.slice(0, 8) } });
}
async function retryOrFail(ports: ListeningPorts, job: ListeningJobRow, errorKind: string, reason: string, retryAfterMs: number | null): Promise<WorkResult> {
  if (job.retryBudgetRemaining > 0 && job.attemptCount + 1 < job.maxAttempts) {
    const backoff = computeBackoffMs(job.attemptCount + 1, DEFAULT_RETRY_POLICY, ports.random.fraction(), null);
    const delay = retryAfterMs && retryAfterMs > 0 ? Math.max(retryAfterMs, backoff) : backoff;   // honor Retry-After
    const next: ListeningJobRow = { ...job, status: "retry_wait", attemptCount: job.attemptCount + 1, retryBudgetRemaining: job.retryBudgetRemaining - 1, availableAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), retryAfterMs, lastErrorKind: errorKind, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
    await ports.store.updateJob(next);
    return { job: next, outcome: "retry_scheduled", events: [] };
  }
  return finalize(ports, job, "failed", reason, []);
}
async function finalize(ports: ListeningPorts, job: ListeningJobRow, status: ListeningJobStatus, error: string | null, events: readonly MetaNotificationEvent[]): Promise<WorkResult> {
  const done: ListeningJobRow = { ...job, status, completedAtIso: ports.clock.nowIso(), lastErrorKind: error, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
  await ports.store.updateJob(done);
  if (status === "failed" || status === "blocked") events = [...events];
  await ports.audit.log({ action: "meta.listening.job_completed", entityId: job.id, summary: `listening job ${status}`, metadata: { status, error } });
  return { job: done, outcome: status, events };
}

// ── Recovery (read-only jobs safely requeue; exhausted → dead-letter, no replay) ─
export async function recoverAbandoned(ports: ListeningPorts, opts?: { limit?: number }): Promise<{ recovered: number; requeued: number; deadLettered: number }> {
  const nowMs = ports.clock.nowMs();
  const stale = await ports.store.findStaleJobs(nowMs, opts?.limit ?? 16);
  let requeued = 0, deadLettered = 0;
  for (const job of stale) {
    if (!isLeaseStale(leaseState(job), nowMs)) continue;
    if (job.attemptCount >= job.maxAttempts) { await ports.store.updateJob({ ...job, status: "dead_letter", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); deadLettered++; }
    else { await ports.store.updateJob({ ...job, status: "available", requeueCount: job.requeueCount + 1, availableAtIso: new Date(nowMs).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); requeued++; }
    await ports.audit.log({ action: "meta.listening.job_recovered", entityId: job.id, summary: "abandoned listening job recovered", metadata: { requeued: job.attemptCount < job.maxAttempts } });
  }
  return { recovered: stale.length, requeued, deadLettered };
}
