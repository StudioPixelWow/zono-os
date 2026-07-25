// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING SERVICE (server). Phase 6.
// ----------------------------------------------------------------------------
// Wires the pure messaging engine to production adapters: the Supabase store, the
// sealed messaging gateway, the AES-256-GCM at-rest encryptor, the same credential
// resolver, the SAME capability evaluator (resolveRuntime → messaging.read/reply),
// the Phase-4 intelligence path (REUSED), the Phase-3 inbox projection (REUSED —
// additive dm_thread), and the Communication Copilot for reviewable drafts (REUSED).
// The webhook handler REUSES the Batch-6.8 verify + trusted asset→org mapping and
// only enqueues a bounded pull. OUTBOUND is APPROVAL-GATED, window + policy-tag +
// capability checked — the browser never calls Meta and nothing auto-sends.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { resolveAssetCredential, resolveRuntime } from "../publish/service";
import { createMessagingGateway } from "../provider/graph";
import { verifySignatureDualSecret } from "../webhooks/verify";
import { createWebhookStore } from "../webhooks/store";
import { createSupabaseInboxStore } from "../inbox/store";
import { buildIntelligencePorts } from "../intelligence/service";
import * as intelEngine from "../intelligence/engine";
import { subjectFingerprint } from "../intelligence/fingerprint";
import { createSupabaseMessagingStore } from "./store";
import { createMessagingEncryptor } from "./encryption";
import { createMessagingCopilot } from "./copilot";
import type { MessagingPorts, CapabilityResolver, IntelligenceEnqueue, InboxProjection } from "./ports";
import * as engine from "./engine";
import { extractMessagingSignals } from "./webhook";
import { isWithinStandardWindow } from "./policy";
import { canTransitionConversation } from "./state";
import { toConversationListItem, toConversationDetail, toMessageDTO, toSendDTO, type ConversationListItemDTO, type ConversationDetailDTO, type MessageDTO, type SendDTO } from "./read";
import { canViewMessaging, canDraftMessage, canApproveSendRole, canManageConversation } from "./roles";
export { canViewMessaging, canDraftMessage, canApproveSendRole, canManageConversation } from "./roles";
import { isConversationStatus, type ConversationFilter, type ConversationSort, type ConversationStatus } from "./domain";
import type { MetaPlatform } from "../types";

function secrets(): string[] { return [process.env.META_WEBHOOK_SECRET ?? process.env.META_APP_SECRET ?? "", process.env.META_WEBHOOK_SECRET_PREVIOUS ?? ""].filter(Boolean); }
const readCap = (p: MetaPlatform) => (p === "instagram" ? "instagram.messaging.read" : "facebook.messaging.read");
const replyCap = (p: MetaPlatform) => (p === "instagram" ? "instagram.messaging.reply" : "facebook.messaging.reply");

function capabilityResolver(): CapabilityResolver {
  return {
    async messagingReadAllowed(orgId, assetId, platform) { const rt = await resolveRuntime(orgId, assetId, readCap(platform)); return rt.capability.allowed; },
    async messagingReplyAllowed(orgId, assetId, platform) { const rt = await resolveRuntime(orgId, assetId, replyCap(platform)); return { allowed: rt.capability.allowed, assetActive: rt.assetStatus === "active" }; },
  };
}
function intelligenceEnqueue(): IntelligenceEnqueue {
  return { async enqueueForConversation(orgId, inboxConversationId) { const iports = buildIntelligencePorts(); const candidate = await iports.store.getCandidate(orgId, inboxConversationId); if (!candidate) return null; const fp = subjectFingerprint(candidate.snapshot); const r = await intelEngine.scheduleScoring(iports, { orgId, candidate, fingerprint: fp, jobKind: "score_conversation", correlationId: crypto.randomUUID(), idempotencyKey: `${inboxConversationId}|dm_score|${fp}` }); return r.job.id; } };
}
function inboxProjection(): InboxProjection {
  return { async projectThread(orgId, input) { const store = createSupabaseInboxStore(); const up = await store.upsertConversation(orgId, { sourceKind: "dm_thread", sourceRef: input.subjectRef, platform: input.platform, providerObjectId: null, participantExternalId: null, participantDisplay: input.participantDisplay, subjectPreview: input.placeholder.slice(0, 160), replyCount: 0, lastActivityAt: input.lastActivityAt }); return { conversationId: up.id, created: up.created }; } };
}

export function buildMessagingPorts(): MessagingPorts {
  return {
    store: createSupabaseMessagingStore(),
    gateway: createMessagingGateway(),
    encryptor: createMessagingEncryptor(),
    credential: { resolve: (orgId, assetId) => resolveAssetCredential(orgId, assetId) },
    capability: capabilityResolver(),
    intelligence: intelligenceEnqueue(),
    inbox: inboxProjection(),
    copilot: createMessagingCopilot(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_dm_conversation", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
    random: { fraction: () => Math.random() },
  };
}

// ── Webhook handler (reuses 6.8 verify + trusted asset→org; enqueues a pull) ───
export interface MessagingWebhookResult { accepted: boolean; reason: string; enqueued: number; unmatched: number; gated: number }
export async function handleMessagingWebhook(rawBody: string | Buffer, signatureHeader: string | null, contentType: string | null): Promise<MessagingWebhookResult> {
  const sig = verifySignatureDualSecret(rawBody, signatureHeader, secrets(), { contentType });
  if (!sig.ok) return { accepted: false, reason: sig.reason, enqueued: 0, unmatched: 0, gated: 0 };
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody); } catch { return { accepted: true, reason: "malformed_json", enqueued: 0, unmatched: 0, gated: 0 }; }
  const signals = extractMessagingSignals(parsed).filter((s) => s.hasMessage);
  if (signals.length === 0) return { accepted: true, reason: "no_message_signals", enqueued: 0, unmatched: 0, gated: 0 };

  const ports = buildMessagingPorts();
  const webhookStore = createWebhookStore();
  const res: MessagingWebhookResult = { accepted: true, reason: "ok", enqueued: 0, unmatched: 0, gated: 0 };
  for (const s of signals) {
    const asset = await webhookStore.resolveAsset(s.assetExternalId);   // org from TRUSTED mapping, never payload
    if (!asset || !s.externalThreadId) { res.unmatched++; continue; }
    const assetId = await assetIdFor(asset.orgId, s.assetExternalId, s.platform);
    if (!assetId) { res.unmatched++; continue; }
    if (!(await ports.capability.messagingReadAllowed(asset.orgId, assetId, s.platform))) { res.gated++; continue; }
    // Upsert the conversation (marks inbound now → opens the 24h window) + enqueue message sync.
    const up = await engine.upsertConversationFromSignal(ports, asset.orgId, assetId, { platform: s.platform, externalThreadId: s.externalThreadId, participantExternalId: s.externalThreadId, participantDisplaySafe: null, lastInboundAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() });
    await engine.scheduleConversationSync(ports, asset.orgId, up.id, crypto.randomUUID());
    res.enqueued++;
  }
  return res;
}
async function assetIdFor(orgId: string, externalId: string, platform: MetaPlatform): Promise<string> {
  const table = platform === "instagram" ? "meta_instagram_account" : "meta_page";
  const r = await createServiceRoleClient().from(table as never).select("id").eq("org_id", orgId).eq("external_id", externalId).maybeSingle();
  return r.data ? String((r.data as { id: string }).id) : "";
}

// ── Reads (safe DTOs; org-scoped; bodies decrypted server-side) ────────────────
export async function listConversations(orgId: string, filter: ConversationFilter, sort: ConversationSort, page: { limit: number; offset: number }): Promise<{ items: readonly ConversationListItemDTO[]; total: number }> {
  const r = await createSupabaseMessagingStore().listConversations(orgId, filter, sort, page);
  return { items: r.items.map(toConversationListItem), total: r.total };
}
export async function getConversation(orgId: string, id: string): Promise<ConversationDetailDTO | null> {
  const c = await createSupabaseMessagingStore().getConversation(orgId, id);
  if (!c) return null;
  return toConversationDetail(c, isWithinStandardWindow(c.lastInboundAt, Date.now()));
}
export async function listMessages(orgId: string, conversationId: string): Promise<readonly MessageDTO[]> {
  const enc = createMessagingEncryptor();
  const rows = await createSupabaseMessagingStore().listMessages(orgId, conversationId, 200);
  // Decrypt bodies server-side for the authorized read; never return ciphertext.
  return rows.map((m) => toMessageDTO({ id: m.id, conversationId, externalMessageId: "", direction: m.direction, senderExternalId: m.senderExternalId, policyTag: m.policyTag, deliveryState: m.deliveryState, providerCreatedAt: m.providerCreatedAt, body: m.bodyCipher ? enc.decrypt(m.bodyCipher) : "" }));
}

// ── Copilot draft (reviewable; never sends) ───────────────────────────────────
export async function draftReply(orgId: string, role: string, conversationId: string): Promise<{ ok: boolean; error?: string; body?: string }> {
  if (!canDraftMessage(role)) return { ok: false, error: "forbidden" };
  const ports = buildMessagingPorts();
  const conv = await ports.store.getConversation(orgId, conversationId);
  if (!conv) return { ok: false, error: "not_found" };
  const enc = createMessagingEncryptor();
  const msgs = await ports.store.listMessages(orgId, conversationId, 12);
  const recentText = msgs.filter((m) => m.direction === "inbound").map((m) => (m.bodyCipher ? enc.decrypt(m.bodyCipher) : "")).filter(Boolean);
  const draft = await ports.copilot.draftReply({ platform: conv.platform, participantDisplay: conv.participantDisplaySafe, recentText });
  return draft ? { ok: true, body: draft.body } : { ok: false, error: "no_draft" };
}

// ── Outbound send (APPROVAL-GATED) ─────────────────────────────────────────────
export async function createDraftSend(orgId: string, userId: string, role: string, conversationId: string, body: string, policyTag: string | null): Promise<{ ok: boolean; error?: string; send?: SendDTO }> {
  if (!canDraftMessage(role)) return { ok: false, error: "forbidden" };
  if (!body.trim()) return { ok: false, error: "empty_body" };
  const r = await engine.createSend(buildMessagingPorts(), { orgId, actorId: userId, conversationId, body, policyTag, correlationId: crypto.randomUUID() });
  if (!r.ok || !r.send) return { ok: false, error: r.error ?? "draft_failed" };
  return { ok: true, send: toSendDTO(r.send), error: r.error ?? undefined };
}
export async function approveAndSend(orgId: string, userId: string, role: string, sendId: string): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canApproveSendRole(role)) return { ok: false, error: "forbidden" };
  const r = await engine.approveSend(buildMessagingPorts(), orgId, userId, sendId);
  if (!r.ok) return { ok: false, error: r.error ?? "approve_failed" };
  return { ok: true, jobId: r.job?.id };
}
export async function rejectDraftSend(orgId: string, userId: string, role: string, sendId: string): Promise<{ ok: boolean; error?: string }> {
  if (!canDraftMessage(role)) return { ok: false, error: "forbidden" };
  const r = await engine.rejectSend(buildMessagingPorts(), orgId, userId, sendId);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "reject_failed" };
}

// ── Conversation local actions ────────────────────────────────────────────────
export async function setConversationStatus(orgId: string, userId: string, role: string, id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  if (!canManageConversation(role)) return { ok: false, error: "forbidden" };
  if (!isConversationStatus(status)) return { ok: false, error: "bad_request" };
  const store = createSupabaseMessagingStore();
  const conv = await store.getConversation(orgId, id);
  if (!conv) return { ok: false, error: "not_found" };
  if (!canTransitionConversation(conv.status, status as ConversationStatus)) return { ok: false, error: "illegal_transition" };
  await store.updateConversation(orgId, id, { status: status as ConversationStatus });
  await logAudit({ action: "meta.messaging.conversation_status", category: "configuration", entityType: "meta_dm_conversation", entityId: id, summary: "conversation status changed", metadata: { to: status } });
  return { ok: true };
}
export async function markConversationRead(orgId: string, role: string, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!canViewMessaging(role)) return { ok: false, error: "forbidden" };
  await createSupabaseMessagingStore().updateConversation(orgId, id, { unread: false });
  return { ok: true };
}
export async function assignConversation(orgId: string, role: string, id: string, assigneeUserId: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!canManageConversation(role)) return { ok: false, error: "forbidden" };
  await createSupabaseMessagingStore().updateConversation(orgId, id, { assigneeUserId, status: assigneeUserId ? "assigned" : "open" });
  await logAudit({ action: "meta.messaging.conversation_assigned", category: "configuration", entityType: "meta_dm_conversation", entityId: id, summary: "conversation assigned", metadata: {} });
  return { ok: true };
}
export async function requestSync(orgId: string, role: string, conversationId: string): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canViewMessaging(role)) return { ok: false, error: "forbidden" };
  const r = await engine.scheduleConversationSync(buildMessagingPorts(), orgId, conversationId, crypto.randomUUID());
  return { ok: true, jobId: r.job.id };
}

// ── Internal worker entrypoints (protected routes only) ────────────────────────
export interface MessagingTickResult { claimed: number; ingested: number; sent: number; succeeded: number; failed: number; retries: number }
export async function runMessagingDispatchTick(opts?: { limit?: number; perOrgMax?: number }): Promise<MessagingTickResult> {
  const ports = buildMessagingPorts();
  const leaseOwner = `msg:${crypto.randomUUID()}`;
  const claimed = await engine.dispatchDue(ports, { leaseOwner, limit: opts?.limit, perOrgMax: opts?.perOrgMax });
  const res: MessagingTickResult = { claimed: claimed.length, ingested: 0, sent: 0, succeeded: 0, failed: 0, retries: 0 };
  for (const job of claimed) {
    const out = await engine.workJob(ports, job);
    res.ingested += out.ingested ?? 0; if (out.sent) res.sent++;
    if (out.job.status === "succeeded") res.succeeded++;
    else if (out.job.status === "failed" || out.job.status === "dead_letter") res.failed++;
    else if (out.job.status === "retry_wait") res.retries++;
  }
  return res;
}
export async function runMessagingRecoveryTick(opts?: { limit?: number }): Promise<{ recovered: number; requeued: number; deadLettered: number; manualReview: number }> {
  return engine.recoverAbandoned(buildMessagingPorts(), { limit: opts?.limit });
}
export async function getMessagingQueueHealth(orgId: string | null): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }> {
  return createSupabaseMessagingStore().queueHealth(orgId, Date.now());
}
