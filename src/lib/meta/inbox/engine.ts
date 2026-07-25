// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INBOX SYNC ENGINE (PURE). Phase 3.
// ----------------------------------------------------------------------------
// The durable, incremental unified-inbox brain, over injected ports. It REUSES the
// Batch-6.8 lease/fencing model (schedule/lease) and bounded backoff (schedule/
// retry) — one durable-job model, not a new one. Sync is a LOCAL projection: it
// reads comment threads updated since a per-(org,platform) CURSOR, folds each into
// a canonical conversation (aggregating Facebook + Instagram into one inbox), and
// advances the cursor — a bounded batch, an indexed query, no full scan, and NO
// Graph call. Local state actions (read/archive/assign/label/snooze) never touch
// Meta. Abandoned syncs safely requeue (reads have no provider side effect).
// ============================================================================
import type { InboxPorts, InboxSyncJobRow, InboxJobStatus } from "./ports";
import { DEFAULT_INBOX_MAX_ATTEMPTS, DEFAULT_INBOX_SYNC_BATCH } from "./ports";
import { heartbeatLease, canFinalize, isLeaseStale, DEFAULT_LEASE_MS, type LeaseState } from "../schedule/lease";
import { computeBackoffMs, DEFAULT_RETRY_POLICY } from "../schedule/retry";
import { aggregateThread } from "./aggregate";
import { canApplyAction, isUnread, type InboxAction } from "./state";
import type { MetaPlatform } from "../types";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent } from "../notify/types";

/** Bounded idle cadence: after catching up, re-check for new activity later. */
export const INBOX_IDLE_CADENCE_MS = 10 * 60_000;
const TERMINAL = new Set<InboxJobStatus>(["succeeded", "failed", "dead_letter"]);
const leaseState = (j: InboxSyncJobRow): LeaseState => ({ status: j.status, leaseOwner: j.leaseOwner, leaseToken: j.leaseToken, leaseExpiresAtMs: j.leaseExpiresAtIso ? Date.parse(j.leaseExpiresAtIso) : null });

// ── Scheduling sync ──────────────────────────────────────────────────────────
export async function scheduleSync(ports: InboxPorts, input: { orgId: string; platform: MetaPlatform; availableAtMs?: number; priority?: number; correlationId: string; idempotencyKey: string }): Promise<{ job: InboxSyncJobRow; resumed: boolean }> {
  const existing = await ports.store.findJobByIdem(input.orgId, input.idempotencyKey);
  if (existing) return { job: existing, resumed: true };
  const active = await ports.store.findActiveJob(input.orgId, input.platform);
  if (active) return { job: active, resumed: true };
  const job = newJob(ports, input.orgId, input.platform, input.availableAtMs ?? ports.clock.nowMs(), input.priority ?? 100, input.correlationId, input.idempotencyKey);
  await ports.store.insertJob(job);
  await ports.audit.log({ action: "meta.inbox.sync_scheduled", entityId: job.id, summary: "inbox sync scheduled", metadata: { platform: input.platform } });
  return { job, resumed: false };
}
function newJob(ports: InboxPorts, orgId: string, platform: MetaPlatform, availableAtMs: number, priority: number, correlationId: string, idempotencyKey: string): InboxSyncJobRow {
  return { id: ports.ids.uuid(), orgId, platform, status: "scheduled", priority, availableAtIso: new Date(availableAtMs).toISOString(), cursor: null, attemptCount: 0, maxAttempts: DEFAULT_INBOX_MAX_ATTEMPTS, retryBudgetRemaining: DEFAULT_INBOX_MAX_ATTEMPTS, requeueCount: 0, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId, idempotencyKey };
}

// ── Dispatch / heartbeat ──────────────────────────────────────────────────────
export async function dispatchDue(ports: InboxPorts, opts: { leaseOwner: string; limit?: number; perOrgMax?: number; leaseSeconds?: number }): Promise<readonly InboxSyncJobRow[]> {
  const inFlight = await ports.store.countInFlight();
  const limit = Math.max(0, Math.min(opts.limit ?? 8, Math.max(0, 16 - inFlight.global)));
  if (limit === 0) return [];
  const claimed = await ports.store.claimDueJobs({ nowMs: ports.clock.nowMs(), limit, perOrgMax: opts.perOrgMax ?? 3, leaseOwner: opts.leaseOwner, leaseSeconds: Math.round((opts.leaseSeconds ?? DEFAULT_LEASE_MS / 1000)) });
  for (const j of claimed) await ports.audit.log({ action: "meta.inbox.job_claimed", entityId: j.id, summary: "inbox sync claimed", metadata: { platform: j.platform } });
  return claimed;
}
export async function heartbeat(ports: InboxPorts, orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason: string | null }> {
  const job = await ports.store.getJob(orgId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const hb = heartbeatLease(leaseState(job), owner, token, ports.clock.nowMs());
  if (!hb.ok) return { ok: false, reason: hb.reason };
  await ports.store.updateJob({ ...job, leaseExpiresAtIso: new Date(hb.leaseExpiresAtMs!).toISOString(), heartbeatAtIso: new Date(hb.heartbeatAtMs!).toISOString() });
  return { ok: true, reason: null };
}

// ── Work one claimed sync job ────────────────────────────────────────────────────
export interface WorkResult { job: InboxSyncJobRow; outcome: string; events: readonly MetaNotificationEvent[]; projected?: number; created?: number }
export async function workJob(ports: InboxPorts, job0: InboxSyncJobRow): Promise<WorkResult> {
  const current = await ports.store.getJob(job0.orgId, job0.id);
  if (!current) return { job: job0, outcome: "fence_not_found", events: [] };
  if (TERMINAL.has(current.status)) return { job: current, outcome: "already_terminal", events: [] };
  const fence = canFinalize(leaseState(current), job0.leaseOwner ?? "", job0.leaseToken ?? "");
  if (!fence.ok) return { job: current, outcome: `fence_${fence.reason}`, events: [] };
  const job: InboxSyncJobRow = { ...current, status: "executing", startedAtIso: ports.clock.nowIso(), heartbeatAtIso: ports.clock.nowIso() };
  await ports.store.updateJob(job);

  if (!(await ports.capability.inboxReadAllowed(job.orgId, job.platform))) return finalize(ports, job, "blocked", "capability_denied", []);

  const state = await ports.store.getSyncState(job.orgId, job.platform);
  const since = state?.cursorUpdatedAtIso ?? null;
  let threads;
  try { threads = await ports.store.listUpdatedThreads(job.orgId, job.platform, since, DEFAULT_INBOX_SYNC_BATCH); }
  catch { return retryOrFail(ports, job, "internal", "list_failed"); }

  const events: MetaNotificationEvent[] = [];
  let projected = 0, created = 0, maxCursor = since ?? "";
  for (const t of threads) {
    const rec = aggregateThread(t);
    const up = await ports.store.upsertConversation(job.orgId, rec);
    projected++;
    if (up.created) { created++; events.push(buildMetaNotificationEvent({ event: "meta.inbox.new_conversation", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: rec.providerObjectId, correlationId: job.correlationId, data: { platform: rec.platform, sourceRef: rec.sourceRef } })); }
    if (t.updatedAtIso > maxCursor) maxCursor = t.updatedAtIso;
  }
  await ports.store.upsertSyncState(job.orgId, { platform: job.platform, cursorUpdatedAtIso: maxCursor || since, lastSyncedAtIso: ports.clock.nowIso(), syncedCount: (state?.syncedCount ?? 0) + projected });

  // Drain more immediately if the batch was full; otherwise re-check after idle.
  const nextDelay = threads.length >= DEFAULT_INBOX_SYNC_BATCH ? 0 : INBOX_IDLE_CADENCE_MS;
  const nextIdem = `${job.orgId}|inbox_sync|${job.platform}|${(state?.syncedCount ?? 0) + projected}`;
  if (!(await ports.store.findJobByIdem(job.orgId, nextIdem))) await ports.store.insertJob(newJob(ports, job.orgId, job.platform, ports.clock.nowMs() + nextDelay, 100, job.correlationId, nextIdem));

  const done = await finalize(ports, job, "succeeded", null, events);
  return { ...done, projected, created };
}

async function retryOrFail(ports: InboxPorts, job: InboxSyncJobRow, errorKind: string, reason: string): Promise<WorkResult> {
  if (job.retryBudgetRemaining > 0 && job.attemptCount + 1 < job.maxAttempts) {
    const delay = computeBackoffMs(job.attemptCount + 1, DEFAULT_RETRY_POLICY, ports.random.fraction(), null);
    const next: InboxSyncJobRow = { ...job, status: "retry_wait", attemptCount: job.attemptCount + 1, retryBudgetRemaining: job.retryBudgetRemaining - 1, availableAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), lastErrorKind: errorKind, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
    await ports.store.updateJob(next);
    return { job: next, outcome: "retry_scheduled", events: [] };
  }
  return finalize(ports, job, "failed", reason, []);
}
async function finalize(ports: InboxPorts, job: InboxSyncJobRow, status: InboxJobStatus, error: string | null, events: readonly MetaNotificationEvent[]): Promise<WorkResult> {
  const done: InboxSyncJobRow = { ...job, status, completedAtIso: ports.clock.nowIso(), lastErrorKind: error, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
  await ports.store.updateJob(done);
  await ports.audit.log({ action: "meta.inbox.job_completed", entityId: job.id, summary: `inbox sync ${status}`, metadata: { platform: job.platform, status, error } });
  return { job: done, outcome: status, events };
}

export async function recoverAbandoned(ports: InboxPorts, opts?: { limit?: number }): Promise<{ recovered: number; requeued: number }> {
  const nowMs = ports.clock.nowMs();
  const stale = await ports.store.findStaleJobs(nowMs, opts?.limit ?? 16);
  let requeued = 0;
  for (const job of stale) {
    if (!isLeaseStale(leaseState(job), nowMs)) continue;
    if (job.attemptCount >= job.maxAttempts) await ports.store.updateJob({ ...job, status: "failed", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null });
    else { await ports.store.updateJob({ ...job, status: "available", requeueCount: job.requeueCount + 1, availableAtIso: new Date(nowMs).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); requeued++; }
    await ports.audit.log({ action: "meta.inbox.job_recovered", entityId: job.id, summary: "abandoned inbox sync recovered (read-only, safe requeue)", metadata: { platform: job.platform } });
  }
  return { recovered: stale.length, requeued };
}

// ── Local conversation actions (never touch Meta) ────────────────────────────────
export interface ActionResult { ok: boolean; error: string | null; events: readonly MetaNotificationEvent[] }
export async function applyConversationAction(ports: InboxPorts, orgId: string, actorId: string | null, conversationId: string, action: InboxAction, payload?: { assigneeUserId?: string | null; labelId?: string; snoozedUntil?: string; priority?: number }): Promise<ActionResult> {
  const conv = await ports.store.getConversation(orgId, conversationId);
  if (!conv) return { ok: false, error: "not_found", events: [] };
  const guard = canApplyAction(action, conv.status);
  if (!guard.ok) return { ok: false, error: guard.reason, events: [] };
  const nowIso = ports.clock.nowIso();
  const events: MetaNotificationEvent[] = [];
  switch (action) {
    case "mark_read": await ports.store.updateConversationState(orgId, conversationId, { lastReadAt: nowIso, unread: false }); break;
    case "mark_unread": await ports.store.updateConversationState(orgId, conversationId, { lastReadAt: null, unread: true }); break;
    case "archive": await ports.store.updateConversationState(orgId, conversationId, { status: "archived" }); break;
    case "unarchive": await ports.store.updateConversationState(orgId, conversationId, { status: "open" }); break;
    case "resolve": await ports.store.updateConversationState(orgId, conversationId, { status: "resolved" }); break;
    case "reopen": await ports.store.updateConversationState(orgId, conversationId, { status: "open" }); break;
    case "snooze": await ports.store.updateConversationState(orgId, conversationId, { status: "snoozed", snoozedUntil: payload?.snoozedUntil ?? null }); break;
    case "assign": await ports.store.updateConversationState(orgId, conversationId, { assigneeUserId: payload?.assigneeUserId ?? null }); await ports.store.recordAssignment(orgId, conversationId, payload?.assigneeUserId ?? null, actorId); events.push(buildMetaNotificationEvent({ event: "meta.inbox.assigned", orgId, occurredAt: nowIso, assetRef: conversationId, correlationId: conversationId, data: { assignee: payload?.assigneeUserId ?? null } })); break;
    case "unassign": await ports.store.updateConversationState(orgId, conversationId, { assigneeUserId: null }); await ports.store.recordAssignment(orgId, conversationId, null, actorId); break;
    case "add_label": if (payload?.labelId) await ports.store.addLabel(orgId, conversationId, payload.labelId); break;
    case "remove_label": if (payload?.labelId) await ports.store.removeLabel(orgId, conversationId, payload.labelId); break;
  }
  await ports.audit.log({ action: `meta.inbox.${action}`, entityId: conversationId, summary: `inbox ${action}`, metadata: { by: actorId } });
  return { ok: true, error: null, events };
}

/** Re-derive unread from a conversation's activity vs read cursor (pure helper). */
export function deriveUnread(conv: { lastActivityAt: string | null; lastReadAt: string | null }): boolean {
  return isUnread(conv.lastActivityAt, conv.lastReadAt);
}
