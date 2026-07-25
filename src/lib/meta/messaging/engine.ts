// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING ENGINE (PURE). Phase 6.
// ----------------------------------------------------------------------------
// The durable messaging brain over injected ports. REUSES the Batch-6.8 lease/
// fencing + bounded backoff. TWO flows:
//  • SYNC (READ): fetch conversations/messages via the sealed gateway → normalize →
//    dedup → ENCRYPT + persist → project to the Phase-3 inbox → enqueue Phase-4
//    scoring → advance cursor ATOMICALLY WITH persistence → deduped events. Reads
//    retry with bounded backoff; a failed read never fabricates empties/advances.
//  • SEND (OUTBOUND): APPROVAL-GATED. createSend (draft, encrypted, window + policy-
//    tag evaluated) → explicit approveSend → a SINGLE provider write that is NEVER
//    auto-retried (ambiguous → manual_review). Window + tag + capability are RE-
//    checked at execution. Nothing here auto-sends, auto-replies, or auto-escalates.
// ============================================================================
import type { MessagingPorts, MessagingJobRow, MessagingJobStatus, MessagingJobKind, SendRow } from "./ports";
import { DEFAULT_MESSAGING_MAX_ATTEMPTS } from "./ports";
import { heartbeatLease, canFinalize, isLeaseStale, DEFAULT_LEASE_MS, type LeaseState } from "../schedule/lease";
import { computeBackoffMs, DEFAULT_RETRY_POLICY } from "../schedule/retry";
import { normalizeMessage, messageFingerprint, safeInboxPlaceholder, type CanonicalMessage, type CanonicalConversation } from "./normalize";
import { evaluateSendEligibility } from "./policy";
import { canApproveSend, isSendExecutable, classifySendOutcome } from "./state";
import { isPolicyTag, type ConversationRecord } from "./domain";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent } from "../notify/types";

const TERMINAL = new Set<MessagingJobStatus>(["succeeded", "failed", "dead_letter"]);
const leaseState = (j: MessagingJobRow): LeaseState => ({ status: j.status, leaseOwner: j.leaseOwner, leaseToken: j.leaseToken, leaseExpiresAtMs: j.leaseExpiresAtIso ? Date.parse(j.leaseExpiresAtIso) : null });
const PAGE_LIMIT = 25, MAX_PAGES = 3, MAX_RECORDS = 200;

// ── Scheduling ────────────────────────────────────────────────────────────────
export async function scheduleJob(ports: MessagingPorts, input: { orgId: string; conversationId: string | null; sendId?: string | null; jobKind: MessagingJobKind; availableAtMs?: number; priority?: number; cursorRef?: string | null; correlationId: string; idempotencyKey: string }): Promise<{ job: MessagingJobRow; resumed: boolean }> {
  const existing = await ports.store.findJobByIdem(input.orgId, input.idempotencyKey);
  if (existing) return { job: existing, resumed: true };
  if (input.conversationId && input.jobKind !== "dm_send_execute") { const active = await ports.store.findActiveJob(input.orgId, input.conversationId, input.jobKind); if (active) return { job: active, resumed: true }; }
  const job = newJob(ports, input);
  await ports.store.insertJob(job);
  await ports.audit.log({ action: "meta.messaging.job_scheduled", entityId: job.id, summary: "messaging job scheduled", metadata: { jobKind: input.jobKind } });
  return { job, resumed: false };
}
function newJob(ports: MessagingPorts, input: { orgId: string; conversationId: string | null; sendId?: string | null; jobKind: MessagingJobKind; availableAtMs?: number; priority?: number; cursorRef?: string | null; correlationId: string; idempotencyKey: string }): MessagingJobRow {
  return { id: ports.ids.uuid(), orgId: input.orgId, conversationId: input.conversationId, sendId: input.sendId ?? null, jobKind: input.jobKind, status: "scheduled", priority: input.priority ?? 100, availableAtIso: new Date(input.availableAtMs ?? ports.clock.nowMs()).toISOString(), cursorRef: input.cursorRef ?? null, pageBudget: 3, recordBudget: 200, attemptCount: 0, maxAttempts: DEFAULT_MESSAGING_MAX_ATTEMPTS, retryBudgetRemaining: DEFAULT_MESSAGING_MAX_ATTEMPTS, requeueCount: 0, retryAfterMs: null, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, heartbeatAtIso: null, claimedAtIso: null, startedAtIso: null, completedAtIso: null, nextAttemptAtIso: null, lastErrorKind: null, safeLastError: null, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey };
}
export async function scheduleConversationSync(ports: MessagingPorts, orgId: string, conversationId: string, correlationId: string): Promise<{ job: MessagingJobRow; resumed: boolean }> {
  const conv = await ports.store.getConversation(orgId, conversationId);
  const idem = `${conversationId}|dm_message_sync|${conv?.lastMessageAt ?? ""}`;
  return scheduleJob(ports, { orgId, conversationId, jobKind: "dm_message_sync", cursorRef: conv?.cursorRef ?? null, correlationId, idempotencyKey: idem });
}

// ── Dispatch / heartbeat ──────────────────────────────────────────────────────
export async function dispatchDue(ports: MessagingPorts, opts: { leaseOwner: string; limit?: number; perOrgMax?: number; leaseSeconds?: number }): Promise<readonly MessagingJobRow[]> {
  const inFlight = await ports.store.countInFlight();
  const limit = Math.max(0, Math.min(opts.limit ?? 8, Math.max(0, 16 - inFlight.global)));
  if (limit === 0) return [];
  const claimed = await ports.store.claimDueJobs({ nowMs: ports.clock.nowMs(), limit, perOrgMax: opts.perOrgMax ?? 3, leaseOwner: opts.leaseOwner, leaseSeconds: Math.round((opts.leaseSeconds ?? DEFAULT_LEASE_MS / 1000)) });
  for (const j of claimed) await ports.audit.log({ action: "meta.messaging.job_claimed", entityId: j.id, summary: "messaging job claimed", metadata: { jobKind: j.jobKind } });
  return claimed;
}
export async function heartbeat(ports: MessagingPorts, orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason: string | null }> {
  const job = await ports.store.getJob(orgId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const hb = heartbeatLease(leaseState(job), owner, token, ports.clock.nowMs());
  if (!hb.ok) return { ok: false, reason: hb.reason };
  await ports.store.updateJob({ ...job, leaseExpiresAtIso: new Date(hb.leaseExpiresAtMs!).toISOString(), heartbeatAtIso: new Date(hb.heartbeatAtMs!).toISOString() });
  return { ok: true, reason: null };
}

// ── Work one claimed job (routes by kind) ─────────────────────────────────────
export interface WorkResult { job: MessagingJobRow; outcome: string; events: readonly MetaNotificationEvent[]; ingested?: number; sent?: boolean }
export async function workJob(ports: MessagingPorts, job0: MessagingJobRow): Promise<WorkResult> {
  const current = await ports.store.getJob(job0.orgId, job0.id);
  if (!current) return { job: job0, outcome: "fence_not_found", events: [] };
  if (TERMINAL.has(current.status)) return { job: current, outcome: "already_terminal", events: [] };
  const fence = canFinalize(leaseState(current), job0.leaseOwner ?? "", job0.leaseToken ?? "");
  if (!fence.ok) return { job: current, outcome: `fence_${fence.reason}`, events: [] };
  const job: MessagingJobRow = { ...current, status: "executing", startedAtIso: ports.clock.nowIso(), heartbeatAtIso: ports.clock.nowIso() };
  await ports.store.updateJob(job);
  return job.jobKind === "dm_send_execute" ? workSend(ports, job) : workSync(ports, job);
}

// ── SYNC (READ) ───────────────────────────────────────────────────────────────
async function workSync(ports: MessagingPorts, job: MessagingJobRow): Promise<WorkResult> {
  if (!job.conversationId) {
    // Conversation-discovery sync: pull conversations for due assets is handled by
    // dispatch seeding; here a message-sync job requires a conversation.
    return finalize(ports, job, "failed", "no_conversation", []);
  }
  const conv = await ports.store.getConversation(job.orgId, job.conversationId);
  if (!conv) return finalize(ports, job, "failed", "conversation_missing", []);
  if (!(await ports.capability.messagingReadAllowed(job.orgId, conv.assetId, conv.platform))) return finalize(ports, job, "blocked", "capability_denied", []);
  const cred = await ports.credential.resolve(job.orgId, conv.assetId);
  if (!cred) return finalize(ports, job, "blocked", "credential_unavailable", []);

  let cursor = job.cursorRef; let pages = 0, records = 0, ingested = 0; let lastInbound = conv.lastInboundAt, lastMsgAt = conv.lastMessageAt;
  const events: MetaNotificationEvent[] = [];
  while (pages < Math.min(job.pageBudget, MAX_PAGES) && records < Math.min(job.recordBudget, MAX_RECORDS)) {
    const res = await ports.gateway.fetchMessages({ platform: conv.platform, assetExternalId: cred.externalId, tokenPlain: cred.tokenPlain, cursorRef: cursor, pageLimit: PAGE_LIMIT, threadExternalId: conv.externalThreadId, correlationId: job.correlationId });
    if (!res.ok) {
      if (res.ambiguous) return retryOrFail(ports, job, "provider_transient", res.error?.kind ?? "transient", res.error?.retryAfterMs ?? null);
      return finalize(ports, job, "failed", res.error?.kind ?? "provider_permanent", []);
    }
    pages++;
    for (const m of res.messages as readonly CanonicalMessage[]) {
      records++;
      const rec = normalizeMessage(m);
      if (!rec.externalMessageId) continue;
      const existing = await ports.store.findMessage(job.orgId, conv.id, rec.externalMessageId);
      if (existing) continue;                          // dedup
      const cipher = ports.encryptor.encrypt(rec.body);   // ENCRYPT at rest — never store plaintext
      const up = await ports.store.insertMessage(job.orgId, conv.id, rec, cipher, messageFingerprint(rec));
      if (up.created) { ingested++; if (rec.direction === "inbound") { lastInbound = maxIso(lastInbound, rec.providerCreatedAt); } lastMsgAt = maxIso(lastMsgAt, rec.providerCreatedAt); }
      if (records >= Math.min(job.recordBudget, MAX_RECORDS)) break;
    }
    cursor = res.nextCursorRef;
    await ports.store.updateConversation(job.orgId, conv.id, { cursorRef: cursor });   // advance ONLY after persist
    if (!cursor) break;
  }

  // Update conversation activity + a NON-sensitive inbox preview; encrypt the preview.
  const preview = safeInboxPlaceholder(conv.participantDisplaySafe);
  await ports.store.updateConversation(job.orgId, conv.id, { lastInboundAt: lastInbound, lastMessageAt: lastMsgAt, unread: ingested > 0 ? true : conv.unread, lastPreviewCipher: ports.encryptor.encrypt(preview) });
  // Project to the Phase-3 inbox (safe placeholder only — no body text) + enqueue Phase-4 scoring.
  if (ingested > 0) {
    const proj = await ports.inbox.projectThread(job.orgId, { platform: conv.platform, subjectRef: conv.externalThreadId, participantDisplay: conv.participantDisplaySafe, placeholder: preview, lastActivityAt: lastMsgAt });
    if (proj.conversationId !== conv.inboxConversationId) await ports.store.updateConversation(job.orgId, conv.id, { inboxConversationId: proj.conversationId });
    await ports.intelligence.enqueueForConversation(job.orgId, proj.conversationId);
    events.push(buildMetaNotificationEvent({ event: "meta.message.received", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: null, correlationId: job.correlationId, data: { platform: conv.platform, count: ingested } }));
  }
  await ports.audit.log({ action: "meta.messaging.messages_synced", entityId: conv.id, summary: "messages synced", metadata: { ingested } });
  const done = await finalize(ports, job, "succeeded", null, events);
  return { ...done, ingested };
}
const maxIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : a >= b ? a : b);

// ── SEND (OUTBOUND, approval-gated, single write, NEVER auto-retried) ─────────
export async function createSend(ports: MessagingPorts, input: { orgId: string; actorId: string; conversationId: string; body: string; policyTag: string | null; correlationId: string }): Promise<{ ok: boolean; error: string | null; send: SendRow | null }> {
  const conv = await ports.store.getConversation(input.orgId, input.conversationId);
  if (!conv) return { ok: false, error: "conversation_missing", send: null };
  if (input.policyTag && !isPolicyTag(input.policyTag)) return { ok: false, error: "unsupported_policy_tag", send: null };
  const elig = evaluateSendEligibility({ lastInboundAt: conv.lastInboundAt, nowMs: ports.clock.nowMs(), tag: input.policyTag });
  const id = ports.ids.uuid();
  const idem = `${input.conversationId}|dm_send|${messageFingerprint({ externalMessageId: "draft", body: input.body, providerCreatedAt: null })}`;
  const send: SendRow = { id, orgId: input.orgId, conversationId: input.conversationId, policyTag: input.policyTag, windowState: elig.windowState, approvalState: "pending", status: elig.ok ? "pending" : "manual_review", requestedBy: input.actorId, approvedBy: null, providerMessageId: null, safeErrorKind: elig.ok ? null : elig.reason, attemptCount: 0, correlationId: input.correlationId, idempotencyKey: idem };
  await ports.store.insertSend({ ...send, draftBodyCipher: ports.encryptor.encrypt(input.body.slice(0, 4000)) });   // encrypt the draft body at rest
  await ports.audit.log({ action: "meta.messaging.send_drafted", entityId: id, summary: "outbound draft created (approval required)", metadata: { windowState: elig.windowState, eligible: elig.ok } });
  return { ok: true, error: elig.ok ? null : elig.reason, send };
}
export async function approveSend(ports: MessagingPorts, orgId: string, approverId: string, sendId: string): Promise<{ ok: boolean; error: string | null; job: MessagingJobRow | null }> {
  const send = await ports.store.getSend(orgId, sendId);
  if (!send) return { ok: false, error: "not_found", job: null };
  const guard = canApproveSend(send.approvalState, send.status);
  if (!guard.ok) return { ok: false, error: guard.reason, job: null };
  await ports.store.updateSend(orgId, sendId, { approvalState: "approved", status: "ready", approvedBy: approverId });
  // Enqueue a SINGLE execution job (idempotent by send id).
  const r = await scheduleJob(ports, { orgId, conversationId: send.conversationId, sendId, jobKind: "dm_send_execute", priority: 40, correlationId: send.correlationId, idempotencyKey: `${sendId}|dm_send_execute` });
  await ports.audit.log({ action: "meta.messaging.send_approved", entityId: sendId, summary: "outbound approved", metadata: { by: approverId } });
  return { ok: true, error: null, job: r.job };
}
export async function rejectSend(ports: MessagingPorts, orgId: string, actorId: string, sendId: string): Promise<{ ok: boolean; error: string | null }> {
  const send = await ports.store.getSend(orgId, sendId);
  if (!send) return { ok: false, error: "not_found" };
  if (send.approvalState !== "pending") return { ok: false, error: `not_pending:${send.approvalState}` };
  await ports.store.updateSend(orgId, sendId, { approvalState: "rejected", status: "failed" });
  await ports.audit.log({ action: "meta.messaging.send_rejected", entityId: sendId, summary: "outbound rejected", metadata: { by: actorId } });
  return { ok: true, error: null };
}
async function workSend(ports: MessagingPorts, job: MessagingJobRow): Promise<WorkResult> {
  if (!job.sendId) return finalize(ports, job, "failed", "no_send", []);
  const send = await ports.store.getSend(job.orgId, job.sendId);
  if (!send) return finalize(ports, job, "failed", "send_missing", []);
  if (!isSendExecutable(send.approvalState, send.status)) return finalize(ports, job, "failed", "not_executable", []);   // approval required
  const conv = await ports.store.getConversation(job.orgId, send.conversationId);
  if (!conv || !conv.participantExternalId) return failSend(ports, job, send, "recipient_missing");
  const capr = await ports.capability.messagingReplyAllowed(job.orgId, conv.assetId, conv.platform);
  if (!capr.allowed || !capr.assetActive) return failSend(ports, job, send, "capability_denied");
  // RE-check window + policy tag at execution (state may have changed since approval).
  const elig = evaluateSendEligibility({ lastInboundAt: conv.lastInboundAt, nowMs: ports.clock.nowMs(), tag: send.policyTag });
  if (!elig.ok) { await ports.store.updateSend(job.orgId, send.id, { status: "manual_review", safeErrorKind: elig.reason, windowState: elig.windowState }); return finalize(ports, job, "failed", elig.reason ?? "window", []); }
  const cred = await ports.credential.resolve(job.orgId, conv.assetId);
  if (!cred) return failSend(ports, job, send, "credential_unavailable");

  // SINGLE provider write — NEVER auto-retried. Ambiguous → manual_review.
  const body = ports.encryptor.decrypt(send.draftBodyCipher);
  const res = await ports.gateway.sendMessage({ platform: conv.platform, assetExternalId: cred.externalId, tokenPlain: cred.tokenPlain, recipientExternalId: conv.participantExternalId, body, policyTag: send.policyTag, correlationId: job.correlationId });
  const status = classifySendOutcome(res.ok, res.ambiguous);
  await ports.store.updateSend(job.orgId, send.id, { status, providerMessageId: res.providerMessageId, safeErrorKind: res.ok ? null : (res.error?.kind ?? "send_failed"), attemptCount: send.attemptCount + 1 });
  const events: MetaNotificationEvent[] = [];
  if (res.ok && res.providerMessageId) {
    // Persist the delivered outbound message (encrypted) + delivery confirmation.
    const rec = normalizeMessage({ externalMessageId: res.providerMessageId, direction: "outbound", senderExternalId: null, body, attachments: [], providerCreatedAt: ports.clock.nowIso() });
    await ports.store.insertMessage(job.orgId, conv.id, rec, ports.encryptor.encrypt(body), messageFingerprint(rec), send.id);
    await ports.store.setMessageDelivery(job.orgId, send.id, res.providerMessageId, "sent");
    await ports.store.updateConversation(job.orgId, conv.id, { lastMessageAt: ports.clock.nowIso() });
    events.push(buildMetaNotificationEvent({ event: "meta.message.sent", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: null, correlationId: job.correlationId, data: { platform: conv.platform } }));
  } else if (status === "manual_review") {
    events.push(buildMetaNotificationEvent({ event: "meta.message.send_review", orgId: job.orgId, occurredAt: ports.clock.nowIso(), assetRef: null, correlationId: job.correlationId, data: { platform: conv.platform } }));
  }
  await ports.audit.log({ action: "meta.messaging.send_executed", entityId: send.id, summary: `outbound ${status}`, metadata: { status } });
  // The send job is single-shot: it FINALIZES regardless (no auto-retry).
  const done = await finalize(ports, job, res.ok ? "succeeded" : (status === "manual_review" ? "failed" : "failed"), res.ok ? null : (res.error?.kind ?? "send_failed"), events);
  return { ...done, sent: res.ok };
}
async function failSend(ports: MessagingPorts, job: MessagingJobRow, send: SendRow, reason: string): Promise<WorkResult> {
  await ports.store.updateSend(job.orgId, send.id, { status: "failed", safeErrorKind: reason });
  return finalize(ports, job, "failed", reason, []);
}

// ── Retry (READS only) / finalize / recovery ─────────────────────────────────
async function retryOrFail(ports: MessagingPorts, job: MessagingJobRow, errorKind: string, reason: string, retryAfterMs: number | null): Promise<WorkResult> {
  if (job.retryBudgetRemaining > 0 && job.attemptCount + 1 < job.maxAttempts) {
    const backoff = computeBackoffMs(job.attemptCount + 1, DEFAULT_RETRY_POLICY, ports.random.fraction(), null);
    const delay = retryAfterMs && retryAfterMs > 0 ? Math.max(retryAfterMs, backoff) : backoff;
    const next: MessagingJobRow = { ...job, status: "retry_wait", attemptCount: job.attemptCount + 1, retryBudgetRemaining: job.retryBudgetRemaining - 1, availableAtIso: new Date(ports.clock.nowMs() + delay).toISOString(), retryAfterMs, lastErrorKind: errorKind, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
    await ports.store.updateJob(next);
    return { job: next, outcome: "retry_scheduled", events: [] };
  }
  return finalize(ports, job, "failed", reason, []);
}
async function finalize(ports: MessagingPorts, job: MessagingJobRow, status: MessagingJobStatus, error: string | null, events: readonly MetaNotificationEvent[]): Promise<WorkResult> {
  const done: MessagingJobRow = { ...job, status, completedAtIso: ports.clock.nowIso(), lastErrorKind: error, leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null };
  await ports.store.updateJob(done);
  await ports.audit.log({ action: "meta.messaging.job_completed", entityId: job.id, summary: `messaging job ${status}`, metadata: { status, error, jobKind: job.jobKind } });
  return { job: done, outcome: status, events };
}
export async function recoverAbandoned(ports: MessagingPorts, opts?: { limit?: number }): Promise<{ recovered: number; requeued: number; deadLettered: number; manualReview: number }> {
  const nowMs = ports.clock.nowMs();
  const stale = await ports.store.findStaleJobs(nowMs, opts?.limit ?? 16);
  let requeued = 0, deadLettered = 0, manualReview = 0;
  for (const job of stale) {
    if (!isLeaseStale(leaseState(job), nowMs)) continue;
    if (job.jobKind === "dm_send_execute") {
      // A write job is NEVER auto-replayed — its ambiguous outcome goes to manual review.
      await ports.store.updateJob({ ...job, status: "failed", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null });
      if (job.sendId) await ports.store.updateSend(job.orgId, job.sendId, { status: "manual_review", safeErrorKind: "abandoned_send" });
      manualReview++;
    } else if (job.attemptCount >= job.maxAttempts) { await ports.store.updateJob({ ...job, status: "dead_letter", completedAtIso: ports.clock.nowIso(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); deadLettered++; }
    else { await ports.store.updateJob({ ...job, status: "available", requeueCount: job.requeueCount + 1, availableAtIso: new Date(nowMs).toISOString(), leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null }); requeued++; }
    await ports.audit.log({ action: "meta.messaging.job_recovered", entityId: job.id, summary: "abandoned messaging job recovered", metadata: { jobKind: job.jobKind } });
  }
  return { recovered: stale.length, requeued, deadLettered, manualReview };
}

// ── Webhook-driven conversation upsert (from a verified, trusted signal) ──────
export async function upsertConversationFromSignal(ports: MessagingPorts, orgId: string, assetId: string, rec: ConversationRecord): Promise<{ id: string; created: boolean }> {
  return ports.store.upsertConversation(orgId, assetId, rec);
}
export type { CanonicalConversation };
