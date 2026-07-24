// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · COMMENT ENGINE (PURE). Phase 1.
// ----------------------------------------------------------------------------
// The durable comment ingestion + moderation brain, over injected ports. It
// REUSES the Batch-6.8 lease/fencing model (schedule/lease) and bounded backoff
// (schedule/retry) — one durable-job model, not a new one. Ingestion pulls the
// authoritative comment set from the sealed gateway (the webhook is only a
// signal), normalizes + dedups + threads. Moderation is APPROVAL-GATED: an action
// only enqueues after approval, executes a single provider write that is NEVER
// auto-retried, and an ambiguous outcome becomes manual_review_required (a confirm
// job verifies the real provider state). Abandoned ingestion safely requeues;
// an abandoned mid-execution moderation write is ambiguous → manual review, never
// blindly re-run. Deterministic: same inputs → same effects.
// ============================================================================
import type { EngagementPorts, CommentJobRow, ModerationActionRow, CommentJobStatus } from "./ports";
import { DEFAULT_COMMENT_MAX_ATTEMPTS, DEFAULT_COMMENT_PAGE_SIZE } from "./ports";
import { heartbeatLease, canFinalize, isLeaseStale, DEFAULT_LEASE_MS, type LeaseState } from "../schedule/lease";
import { computeBackoffMs, DEFAULT_RETRY_POLICY } from "../schedule/retry";
import { normalizeComment, commentChanged } from "./normalize";
import { rollupThreads } from "./threading";
import { moderationEligibility, classifyModerationOutcome, isExecutable } from "./moderation";
import type { CommentRecord, ModerationKind, ModerationApprovalState } from "./domain";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent, MetaNotificationEventName } from "../notify/types";
import type { CommentFetchRequest, ModerationRequest } from "./provider-types";

const TERMINAL = new Set<CommentJobStatus>(["succeeded", "failed", "dead_letter"]);
const leaseState = (j: CommentJobRow): LeaseState => ({ status: j.status, leaseOwner: j.leaseOwner, leaseToken: j.leaseToken, leaseExpiresAtMs: j.leaseExpiresAtIso ? Date.parse(j.leaseExpiresAtIso) : null });
const ev = (ports: EngagementPorts, name: MetaNotificationEventName, orgId: string, assetRef: string | null, correlationId: string, data: Record<string, unknown>): MetaNotificationEvent =>
  buildMetaNotificationEvent({ event: name, orgId, occurredAt: ports.clock.nowIso(), assetRef, correlationId, data });

// ── Scheduling ingestion ────────────────────────────────────────────────────
export interface ScheduleIngestInput { orgId: string; providerObjectId: string; kind: "comment_backfill" | "comment_sync"; webhookEventId?: string | null; availableAtMs?: number; priority?: number; correlationId: string; idempotencyKey: string }
export async function scheduleIngestion(ports: EngagementPorts, input: ScheduleIngestInput): Promise<{ job: CommentJobRow; resumed: boolean }> {
  const existing = await ports.store.findJobByIdem(input.orgId, input.idempotencyKey);
  if (existing) return { job: existing, resumed: true };
  const active = await ports.store.findActiveJob(input.orgId, input.kind, input.providerObjectId);
  if (active) return { job: active, resumed: true };
  const job = newJob(ports, input.orgId, input.kind, { providerObjectId: input.providerObjectId, webhookEventId: input.webhookEventId ?? null, availableAtMs: input.availableAtMs ?? ports.clock.nowMs(), priority: input.priority ?? 100, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey });
  await ports.store.insertJob(job);
  await ports.audit.log({ action: "meta.comment.ingest_scheduled", entityId: job.id, summary: `comment ingestion scheduled (${input.kind})`, metadata: { kind: input.kind, providerObjectId: input.providerObjectId } });
  return { job, resumed: false };
}

function newJob(ports: EngagementPorts, orgId: string, kind: CommentJobRow["jobKind"], over: Partial<CommentJobRow> & { availableAtMs: number; correlationId: string; idempotencyKey: string }): CommentJobRow {
  return {
    id: ports.ids.uuid(), orgId, jobKind: kind,
    providerObjectId: over.providerObjectId ?? null, targetCommentId: over.targetCommentId ?? null, engagementActionId: over.engagementActionId ?? null, webhookEventId: over.webhookEventId ?? null,
    status: "scheduled", priority: over.priority ?? 100, availableAtIso: new Date(over.availableAtMs).toISOString(), cursor: over.cursor ?? null,
    attemptCount: 0, maxAttempts: DEFAULT_COMMENT_MAX_ATTEMPTS, retryBudgetRemaining: DEFAULT_COMMENT_MAX_ATTEMPTS, requeueCount: 0,
    leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null,
    startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null,
    correlationId: over.correlationId, idempotencyKey: over.idempotencyKey,
  };
}

// ── Moderation: create (approval-gated) + approve (enqueue) ──────────────────
export interface CreateModerationInput { orgId: string; actorId: string | null; actionKind: ModerationKind; platform: CommentRecord["platform"]; targetCommentId: string; providerObjectId: string | null; replyText?: string | null; correlationId: string; idempotencyKey: string }
export async function createModerationAction(ports: EngagementPorts, input: CreateModerationInput): Promise<{ ok: boolean; error: string | null; action: ModerationActionRow | null }> {
  const dup = await ports.store.findActiveAction(input.orgId, input.targetCommentId, input.actionKind);
  if (dup) return { ok: true, error: null, action: dup }; // idempotent: one active action per (comment, kind)
  const action: ModerationActionRow = {
    id: ports.ids.uuid(), orgId: input.orgId, actionKind: input.actionKind, platform: input.platform,
    targetCommentId: input.targetCommentId, providerObjectId: input.providerObjectId, replyText: input.replyText ?? null,
    approvalState: "pending", status: "pending", requestedBy: input.actorId, approvedBy: null, providerResultId: null,
    safeErrorKind: null, safeErrorMessage: null, retryable: false, retryClass: null, attemptCount: 0,
    correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, executedAtIso: null,
  };
  await ports.store.insertAction(action);
  await ports.audit.log({ action: "meta.comment.moderation_requested", entityId: action.id, summary: `moderation requested (${input.actionKind})`, metadata: { actionKind: input.actionKind } });
  return { ok: true, error: null, action };
}

/** Approve an action and enqueue its execution. Approval is mandatory. */
export async function approveModerationAction(ports: EngagementPorts, orgId: string, approverId: string | null, actionId: string): Promise<{ ok: boolean; error: string | null; job: CommentJobRow | null }> {
  const action = await ports.store.getAction(orgId, actionId);
  if (!action) return { ok: false, error: "not_found", job: null };
  if (action.approvalState === "approved") { const existing = await ports.store.findActiveJob(orgId, "moderation_execute", action.id); if (existing) return { ok: true, error: null, job: existing }; }
  if (action.status !== "pending" && action.status !== "blocked") return { ok: false, error: `not_approvable:${action.status}`, job: null };
  const approved: ModerationActionRow = { ...action, approvalState: "approved", approvedBy: approverId, status: "ready" };
  await ports.store.updateAction(approved);
  const idem = `${action.idempotencyKey}:exec`;
  const active = await ports.store.findActiveJob(orgId, "moderation_execute", action.id);
  const job = active ?? newJob(ports, orgId, "moderation_execute", { engagementActionId: action.id, targetCommentId: action.targetCommentId, providerObjectId: action.providerObjectId, availableAtMs: ports.clock.nowMs(), priority: 50, correlationId: action.correlationId, idempotencyKey: idem });
  if (!active) await ports.store.insertJob(job);
  await ports.audit.log({ action: "meta.comment.moderation_approved", entityId: action.id, summary: "moderation approved + enqueued", metadata: { by: approverId } });
  return { ok: true, error: null, job };
}

export async function rejectModerationAction(ports: EngagementPorts, orgId: string, actorId: string | null, actionId: string): Promise<{ ok: boolean; error: string | null }> {
  const action = await ports.store.getAction(orgId, actionId);
  if (!action) return { ok: false, error: "not_found" };
  if (action.status !== "pending") return { ok: false, error: `not_rejectable:${action.status}` };
  await ports.store.updateAction({ ...action, approvalState: "rejected", status: "cancelled" });
  await ports.audit.log({ action: "meta.comment.moderation_rejected", entityId: action.id, summary: "moderation rejected", metadata: { by: actorId } });
  return { ok: true, error: null };
}

// ── Dispatch / heartbeat ──────────────────────────────────────────────────────
export async function dispatchDue(ports: EngagementPorts, opts: { leaseOwner: string; limit?: number; perOrgMax?: number; leaseSeconds?: number }): Promise<readonly CommentJobRow[]> {
  const inFlight = await ports.store.countInFlight();
  const limit = Math.max(0, Math.min(opts.limit ?? 8, Math.max(0, 16 - inFlight.global)));
  if (limit === 0) return [];
  const claimed = await ports.store.claimDueJobs({ nowMs: ports.clock.nowMs(), limit, perOrgMax: opts.perOrgMax ?? 3, leaseOwner: opts.leaseOwner, leaseSeconds: Math.round((opts.leaseSeconds ?? DEFAULT_LEASE_MS / 1000)) });
  for (const j of claimed) await ports.audit.log({ action: "meta.comment.job_claimed", entityId: j.id, summary: "comment job claimed", metadata: { jobKind: j.jobKind } });
  return claimed;
}
export async function heartbeat(ports: EngagementPorts, orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason: string | null }> {
  const job = await ports.store.getJob(orgId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const hb = heartbeatLease(leaseState(job), owner, token, ports.clock.nowMs());
  if (!hb.ok) return { ok: false, reason: hb.reason };
  await ports.store.updateJob({ ...job, leaseExpiresAtIso: new Date(hb.leaseExpiresAtMs!).toISOString(), heartbeatAtIso: new Date(hb.heartbeatAtMs!).toISOString() });
  return { ok: true, reason: null };
}

// ── Work one claimed job ───────────────────────────────────────────────────────
export interface WorkResult { job: CommentJobRow; outcome: string; events: readonly MetaNotificationEvent[]; ingested?: number }
export async function workJob(ports: EngagementPorts, job0: CommentJobRow): Promise<WorkResult> {
  const current = await ports.store.getJob(job0.orgId, job0.id);
  if (!current) return { job: job0, outcome: "fence_not_found", events: [] };
  if (TERMINAL.has(current.status)) return { job: current, outcome: "already_terminal", events: [] };
  const fence = canFinalize(leaseState(current), job0.leaseOwner ?? "", job0.leaseToken ?? "");
  if (!fence.ok) return { job: current, outcome: `fence_${fence.reason}`, events: [] };
  const job: CommentJobRow = { ...current, status: "executing", startedAtIso: ports.clock.nowIso(), heartbeatAtIso: ports.clock.nowIso() };
  await ports.store.updateJob(job);
  if (job.jobKind === "comment_backfill" || job.jobKind === "comment_sync") return ingestWork(ports, job);
  if (job.jobKind === "moderation_execute") return moderationWork(ports, job);
  return moderationConfirmWork(ports, job);
}

async function ingestWork(ports: EngagementPorts, job: CommentJobRow): Promise<WorkResult> {
  const ref = job.providerObjectId ? await ports.store.objectRef(job.orgId, job.providerObjectId) : null;
  if (!ref) return finalizeJob(ports, job, "failed", "object_ref_missing", []);
  if (!(await ports.capability.commentsReadAllowed(job.orgId, ref.assetId, ref.platform))) return finalizeJob(ports, job, "blocked", "capability_denied", []);
  const cred = await ports.credential.resolve(job.orgId, ref.assetId);
  if (!cred) return finalizeJob(ports, job, "blocked", "credential_unavailable", []);
  const req: CommentFetchRequest = { platform: ref.platform, assetExternalId: cred.externalId, tokenPlain: cred.tokenPlain, objectExternalId: ref.objectExternalId, cursor: job.cursor, limit: DEFAULT_COMMENT_PAGE_SIZE, correlationId: job.correlationId, timeoutMs: 15_000 };
  const res = await ports.gateway.fetchComments(req);
  if (!res.ok) return retryOrFail(ports, job, res.ambiguous ? "timeout" : (res.error?.kind ?? "internal"), "fetch_failed");

  let ingested = 0;
  const persisted: CommentRecord[] = [];
  for (const pc of res.comments) {
    const rec = normalizeComment(pc, ref.platform, new Set([cred.externalId]));
    const existing = await ports.store.getCommentByExternalId(job.orgId, ref.platform, rec.externalId);
    if (!existing || commentChanged(existing.contentFingerprint, rec)) { await ports.store.upsertComment(job.orgId, job.providerObjectId, rec); if (!existing) ingested++; }
    persisted.push(rec);
  }
  // Roll up threads over the freshly-seen set (idempotent).
  for (const roll of rollupThreads(persisted)) await ports.store.upsertThread(job.orgId, job.providerObjectId, ref.platform, roll);

  const events: MetaNotificationEvent[] = ingested > 0 ? [ev(ports, "meta.comment.received", job.orgId, job.providerObjectId, job.correlationId, { providerObjectId: job.providerObjectId, newComments: ingested })] : [];
  // Bounded paging: continue to the next page as a fresh available job page.
  if (res.nextCursor && job.attemptCount + 1 < job.maxAttempts) {
    const next: CommentJobRow = { ...job, status: "available", cursor: res.nextCursor, attemptCount: job.attemptCount + 1, availableAtIso: new Date(ports.clock.nowMs()).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
    await ports.store.updateJob(next);
    return { job: next, outcome: "page_continued", events, ingested };
  }
  const done = await finalizeJob(ports, job, "succeeded", null, events);
  return { ...done, ingested };
}

async function moderationWork(ports: EngagementPorts, job: CommentJobRow): Promise<WorkResult> {
  const ctx = job.engagementActionId ? await ports.store.moderationRef(job.orgId, job.engagementActionId) : null;
  if (!ctx) return finalizeJob(ports, job, "failed", "action_ref_missing", []);
  const { action, ref } = ctx;
  if (!isExecutable(action.approvalState as ModerationApprovalState, action.status)) return finalizeJob(ports, job, "failed", "not_executable", []);
  const cap = await ports.capability.commentsModerateAllowed(job.orgId, ref.assetId, ref.platform);
  const elig = moderationEligibility(action.actionKind, { actorCanModerate: true, capabilityAllowed: cap.allowed, assetActive: cap.assetActive, commentStatus: ref.status, replyText: action.replyText, approvalState: action.approvalState as ModerationApprovalState });
  if (!elig.eligible) { await ports.store.updateAction({ ...action, status: "blocked", safeErrorKind: elig.reason, safeErrorMessage: elig.reason }); return finalizeJob(ports, job, "blocked", elig.reason, []); }
  const cred = await ports.credential.resolve(job.orgId, ref.assetId);
  if (!cred) { await ports.store.updateAction({ ...action, status: "blocked", safeErrorKind: "credential_unavailable" }); return finalizeJob(ports, job, "blocked", "credential_unavailable", []); }

  await ports.store.updateAction({ ...action, status: "executing", attemptCount: action.attemptCount + 1 });
  const req: ModerationRequest = { platform: ref.platform, assetExternalId: cred.externalId, tokenPlain: cred.tokenPlain, actionKind: action.actionKind, targetCommentExternalId: ref.commentExternalId, replyText: action.replyText, idempotencyKey: action.idempotencyKey, correlationId: action.correlationId, timeoutMs: 15_000 };
  const result = await ports.gateway.moderate(req);
  const outcome = classifyModerationOutcome(result.ok, result.ambiguous, result.error?.kind ?? null);
  const updated: ModerationActionRow = { ...action, status: outcome.status, providerResultId: result.providerResultId, safeErrorKind: result.error?.kind ?? null, safeErrorMessage: result.error?.safeMessage ?? null, retryable: outcome.retryable, retryClass: outcome.retryClass, executedAtIso: ports.clock.nowIso() };
  await ports.store.updateAction(updated);

  const events: MetaNotificationEvent[] = [];
  if (outcome.status === "succeeded") {
    // Reflect the local comment state for hide/unhide/delete (reply appears on next sync).
    if (action.actionKind === "hide") await ports.store.setCommentStatus(job.orgId, action.targetCommentId, "hidden");
    else if (action.actionKind === "unhide") await ports.store.setCommentStatus(job.orgId, action.targetCommentId, "visible");
    else if (action.actionKind === "delete") await ports.store.setCommentStatus(job.orgId, action.targetCommentId, "deleted");
    events.push(ev(ports, action.actionKind === "reply" ? "meta.comment.reply_published" : "meta.comment.moderated", job.orgId, action.targetCommentId, job.correlationId, { actionKind: action.actionKind, providerResultId: result.providerResultId }));
    // Enqueue a bounded confirmation (provider read verifies the real state).
    const confirmIdem = `${action.idempotencyKey}:confirm`;
    if (!(await ports.store.findJobByIdem(job.orgId, confirmIdem))) await ports.store.insertJob(newJob(ports, job.orgId, "moderation_confirm", { engagementActionId: action.id, targetCommentId: action.targetCommentId, providerObjectId: action.providerObjectId, availableAtMs: ports.clock.nowMs() + 5_000, priority: 60, correlationId: action.correlationId, idempotencyKey: confirmIdem }));
    return finalizeJob(ports, { ...job }, "succeeded", null, events);
  }
  if (outcome.manualReview) { events.push(ev(ports, "meta.comment.moderation_failed", job.orgId, action.targetCommentId, job.correlationId, { actionKind: action.actionKind, reason: "ambiguous_manual_review" })); return finalizeJob(ports, job, "failed", "ambiguous_manual_review", events); }
  events.push(ev(ports, "meta.comment.moderation_failed", job.orgId, action.targetCommentId, job.correlationId, { actionKind: action.actionKind, reason: updated.safeErrorKind }));
  return finalizeJob(ports, job, "failed", updated.safeErrorKind, events);
}

async function moderationConfirmWork(ports: EngagementPorts, job: CommentJobRow): Promise<WorkResult> {
  // Confirmation re-reads the comment thread to verify the moderation outcome. It
  // is READ-ONLY (safe to requeue) and never re-issues the write.
  const ctx = job.engagementActionId ? await ports.store.moderationRef(job.orgId, job.engagementActionId) : null;
  if (!ctx) return finalizeJob(ports, job, "failed", "action_ref_missing", []);
  const { action, ref } = ctx;
  const cred = await ports.credential.resolve(job.orgId, ref.assetId);
  if (!cred || !ref.objectExternalId) return finalizeJob(ports, job, "succeeded", "confirm_skipped", []);
  const res = await ports.gateway.fetchComments({ platform: ref.platform, assetExternalId: cred.externalId, tokenPlain: cred.tokenPlain, objectExternalId: ref.objectExternalId, cursor: null, limit: DEFAULT_COMMENT_PAGE_SIZE, correlationId: job.correlationId, timeoutMs: 15_000 });
  if (!res.ok) return retryOrFail(ports, job, res.ambiguous ? "timeout" : (res.error?.kind ?? "internal"), "confirm_fetch_failed");
  const found = res.comments.find((c) => c.externalId === ref.commentExternalId);
  const consistent = action.actionKind === "delete" ? !found : action.actionKind === "hide" ? (found?.isHidden ?? false) : action.actionKind === "unhide" ? (found ? !found.isHidden : true) : (action.providerResultId ? res.comments.some((c) => c.externalId === action.providerResultId || c.parentExternalId === ref.commentExternalId) : true);
  await ports.audit.log({ action: "meta.comment.moderation_confirmed", entityId: action.id, summary: `moderation confirmed=${consistent}`, metadata: { actionKind: action.actionKind, consistent } });
  return finalizeJob(ports, job, "succeeded", consistent ? null : "confirm_inconsistent", []);
}

// ── Retry / finalize / recovery ─────────────────────────────────────────────────
async function retryOrFail(ports: EngagementPorts, job: CommentJobRow, errorKind: string, reason: string): Promise<WorkResult> {
  const transient = ["timeout", "network", "rate_limited", "transient_provider", "unavailable", "media_processing"].includes(errorKind);
  if (transient && job.retryBudgetRemaining > 0 && job.attemptCount + 1 < job.maxAttempts) {
    const delay = computeBackoffMs(job.attemptCount + 1, DEFAULT_RETRY_POLICY, ports.random.fraction(), null);
    const next: CommentJobRow = { ...job, status: "retry_wait", attemptCount: job.attemptCount + 1, retryBudgetRemaining: job.retryBudgetRemaining - 1, availableAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), lastErrorKind: errorKind, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
    await ports.store.updateJob(next);
    return { job: next, outcome: "retry_scheduled", events: [] };
  }
  return finalizeJob(ports, job, transient ? "dead_letter" : "failed", reason, []);
}
async function finalizeJob(ports: EngagementPorts, job: CommentJobRow, status: CommentJobStatus, error: string | null, events: readonly MetaNotificationEvent[]): Promise<WorkResult> {
  const done: CommentJobRow = { ...job, status, completedAtIso: ports.clock.nowIso(), lastErrorKind: error, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
  await ports.store.updateJob(done);
  await ports.audit.log({ action: "meta.comment.job_completed", entityId: job.id, summary: `comment job ${status}`, metadata: { jobKind: job.jobKind, status, error } });
  return { job: done, outcome: status, events };
}

export async function recoverAbandoned(ports: EngagementPorts, opts?: { limit?: number }): Promise<{ recovered: number; requeued: number; manualReview: number }> {
  const nowMs = ports.clock.nowMs();
  const stale = await ports.store.findStaleJobs(nowMs, opts?.limit ?? 16);
  let requeued = 0, manualReview = 0;
  for (const job of stale) {
    if (!isLeaseStale(leaseState(job), nowMs)) continue;
    // A mid-execution moderation WRITE may have reached Meta → ambiguous → manual
    // review, never blindly re-run. Reads (ingest/confirm) safely requeue.
    if (job.jobKind === "moderation_execute" && job.status === "executing") {
      if (job.engagementActionId) { const ctx = await ports.store.moderationRef(job.orgId, job.engagementActionId); if (ctx) await ports.store.updateAction({ ...ctx.action, status: "manual_review_required", safeErrorKind: "abandoned_mid_write" }); }
      await ports.store.updateJob({ ...job, status: "dead_letter", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null });
      manualReview++;
    } else if (job.attemptCount >= job.maxAttempts) {
      await ports.store.updateJob({ ...job, status: "failed", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null });
    } else {
      await ports.store.updateJob({ ...job, status: "available", requeueCount: job.requeueCount + 1, availableAtIso: new Date(nowMs).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null });
      requeued++;
    }
    await ports.audit.log({ action: "meta.comment.job_recovered", entityId: job.id, summary: "abandoned comment job recovered", metadata: { jobKind: job.jobKind } });
  }
  return { recovered: stale.length, requeued, manualReview };
}
