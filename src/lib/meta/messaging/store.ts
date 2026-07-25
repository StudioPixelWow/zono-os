// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING STORE ADAPTER. Phase 6 (server).
// ----------------------------------------------------------------------------
// Supabase-backed MessagingStore (service-role writes; org-scoped reads). Message
// bodies are written ONLY as ciphertext (body_ciphertext / draft_body_ciphertext) —
// no plaintext body column exists. Conversations dedup on (org, platform, external
// thread); messages on (org, conversation, external message id). The claim reuses
// SKIP LOCKED. No token, raw payload, webhook signature, or encryption key is stored.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MessagingStore, MessagingJobRow, ConversationRow, SendRow } from "./ports";
import type { ConversationRecord, MessageRecord, ConversationFilter, ConversationSort, ConversationPage, ConversationStatus, MessageDirection, SendApprovalState, SendStatus, WindowState } from "./domain";
import type { ConvRow } from "./feed";
import { queryConversations } from "./feed";
import type { MetaPlatform } from "../types";

type Row = Record<string, unknown>;
const db = () => createServiceRoleClient();
const now = () => new Date().toISOString();

const jobToDb = (j: MessagingJobRow): Row => ({ id: j.id, org_id: j.orgId, conversation_id: j.conversationId, send_id: j.sendId, job_kind: j.jobKind, status: j.status, priority: j.priority, available_at: j.availableAtIso, cursor_ref: j.cursorRef, page_budget: j.pageBudget, record_budget: j.recordBudget, attempt_count: j.attemptCount, max_attempts: j.maxAttempts, retry_budget_remaining: j.retryBudgetRemaining, requeue_count: j.requeueCount, retry_after_ms: j.retryAfterMs, lease_owner: j.leaseOwner, lease_token: j.leaseToken, lease_expires_at: j.leaseExpiresAtIso, heartbeat_at: j.heartbeatAtIso, claimed_at: j.claimedAtIso, started_at: j.startedAtIso, completed_at: j.completedAtIso, next_attempt_at: j.nextAttemptAtIso, last_error_kind: j.lastErrorKind, safe_last_error: j.safeLastError, correlation_id: j.correlationId, idempotency_key: j.idempotencyKey, updated_at: now() });
const jobFromDb = (d: Row): MessagingJobRow => ({ id: String(d.id), orgId: String(d.org_id), conversationId: (d.conversation_id as string) ?? null, sendId: (d.send_id as string) ?? null, jobKind: d.job_kind as MessagingJobRow["jobKind"], status: d.status as MessagingJobRow["status"], priority: Number(d.priority ?? 100), availableAtIso: String(d.available_at), cursorRef: (d.cursor_ref as string) ?? null, pageBudget: Number(d.page_budget ?? 3), recordBudget: Number(d.record_budget ?? 200), attemptCount: Number(d.attempt_count ?? 0), maxAttempts: Number(d.max_attempts ?? 6), retryBudgetRemaining: Number(d.retry_budget_remaining ?? 6), requeueCount: Number(d.requeue_count ?? 0), retryAfterMs: (d.retry_after_ms as number) ?? null, leaseOwner: (d.lease_owner as string) ?? null, leaseToken: (d.lease_token as string) ?? null, leaseExpiresAtIso: (d.lease_expires_at as string) ?? null, heartbeatAtIso: (d.heartbeat_at as string) ?? null, claimedAtIso: (d.claimed_at as string) ?? null, startedAtIso: (d.started_at as string) ?? null, completedAtIso: (d.completed_at as string) ?? null, nextAttemptAtIso: (d.next_attempt_at as string) ?? null, lastErrorKind: (d.last_error_kind as string) ?? null, safeLastError: (d.safe_last_error as string) ?? null, correlationId: String(d.correlation_id ?? ""), idempotencyKey: String(d.idempotency_key ?? "") });
const convFromDb = (d: Row): ConversationRow => ({ id: String(d.id), orgId: String(d.org_id), platform: d.platform as MetaPlatform, assetId: String(d.asset_id), externalThreadId: String(d.external_thread_id), participantExternalId: (d.participant_external_id as string) ?? null, participantDisplaySafe: (d.participant_display_safe as string) ?? null, lastInboundAt: (d.last_inbound_at as string) ?? null, lastMessageAt: (d.last_message_at as string) ?? null, unread: Boolean(d.unread), status: (d.status as ConversationStatus) ?? "open", assigneeUserId: (d.assignee_user_id as string) ?? null, inboxConversationId: (d.inbox_conversation_id as string) ?? null, cursorRef: (d.cursor_ref as string) ?? null });
const sendFromDb = (d: Row): SendRow & { draftBodyCipher: string } => ({ id: String(d.id), orgId: String(d.org_id), conversationId: String(d.conversation_id), policyTag: (d.policy_tag as string) ?? null, windowState: (d.window_state as WindowState) ?? "unknown", approvalState: (d.approval_state as SendApprovalState) ?? "pending", status: (d.status as SendStatus) ?? "pending", requestedBy: (d.requested_by as string) ?? null, approvedBy: (d.approved_by as string) ?? null, providerMessageId: (d.provider_message_id as string) ?? null, safeErrorKind: (d.safe_error_kind as string) ?? null, attemptCount: Number(d.attempt_count ?? 0), correlationId: String(d.correlation_id ?? ""), idempotencyKey: String(d.idempotency_key ?? ""), draftBodyCipher: String(d.draft_body_ciphertext ?? "") });
const convPatch = (p: Partial<ConversationRow> & { lastPreviewCipher?: string | null }): Row => { const b: Row = { updated_at: now() }; if (p.participantDisplaySafe !== undefined) b.participant_display_safe = p.participantDisplaySafe; if (p.lastInboundAt !== undefined) b.last_inbound_at = p.lastInboundAt; if (p.lastMessageAt !== undefined) b.last_message_at = p.lastMessageAt; if (p.unread !== undefined) b.unread = p.unread; if (p.status !== undefined) b.status = p.status; if (p.assigneeUserId !== undefined) b.assignee_user_id = p.assigneeUserId; if (p.inboxConversationId !== undefined) b.inbox_conversation_id = p.inboxConversationId; if (p.cursorRef !== undefined) b.cursor_ref = p.cursorRef; if (p.lastPreviewCipher !== undefined) b.last_preview_ciphertext = p.lastPreviewCipher; return b; };
const sendPatch = (p: Partial<SendRow>): Row => { const b: Row = { updated_at: now() }; if (p.approvalState !== undefined) b.approval_state = p.approvalState; if (p.status !== undefined) { b.status = p.status; if (p.status === "sent") b.executed_at = now(); } if (p.approvedBy !== undefined) b.approved_by = p.approvedBy; if (p.providerMessageId !== undefined) b.provider_message_id = p.providerMessageId; if (p.safeErrorKind !== undefined) b.safe_error_kind = p.safeErrorKind; if (p.windowState !== undefined) b.window_state = p.windowState; if (p.attemptCount !== undefined) b.attempt_count = p.attemptCount; return b; };

export function createSupabaseMessagingStore(): MessagingStore {
  return {
    async getConversation(orgId, id) { const r = await db().from("meta_dm_conversation" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle(); return r.data ? convFromDb(r.data as Row) : null; },
    async getConversationByThread(orgId, platform, ext) { const r = await db().from("meta_dm_conversation" as never).select("*").eq("org_id", orgId).eq("platform", platform).eq("external_thread_id", ext).maybeSingle(); return r.data ? convFromDb(r.data as Row) : null; },
    async upsertConversation(orgId, assetId, rec: ConversationRecord) {
      const found = await db().from("meta_dm_conversation" as never).select("id, last_inbound_at").eq("org_id", orgId).eq("platform", rec.platform).eq("external_thread_id", rec.externalThreadId).maybeSingle();
      if (found.data) { const id = String((found.data as Row).id); await db().from("meta_dm_conversation" as never).update({ participant_external_id: rec.participantExternalId, participant_display_safe: rec.participantDisplaySafe, last_inbound_at: rec.lastInboundAt ?? (found.data as Row).last_inbound_at, last_message_at: rec.lastMessageAt, updated_at: now() } as never).eq("id", id); return { id, created: false }; }
      const id = crypto.randomUUID();
      await db().from("meta_dm_conversation" as never).insert({ id, org_id: orgId, platform: rec.platform, asset_id: assetId, external_thread_id: rec.externalThreadId, participant_external_id: rec.participantExternalId, participant_display_safe: rec.participantDisplaySafe, last_inbound_at: rec.lastInboundAt, last_message_at: rec.lastMessageAt, unread: true, status: "open", created_at: now(), updated_at: now() } as never);
      return { id, created: true };
    },
    async updateConversation(orgId, id, patch) { await db().from("meta_dm_conversation" as never).update(convPatch(patch) as never).eq("org_id", orgId).eq("id", id); },
    async listConversations(orgId, filter: ConversationFilter, sort: ConversationSort, page: ConversationPage) {
      let q = db().from("meta_dm_conversation" as never).select("id, platform, status, assignee_user_id, unread, participant_display_safe, last_message_at", { count: "exact" } as never).eq("org_id", orgId);
      if (filter.platform) q = q.eq("platform", filter.platform);
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.assigneeUserId !== undefined) q = filter.assigneeUserId === null ? q.is("assignee_user_id", null) : q.eq("assignee_user_id", filter.assigneeUserId);
      if (filter.unreadOnly) q = q.eq("unread", true);
      if (filter.query && filter.query.trim()) { const s = filter.query.trim().replace(/[%_]/g, ""); q = q.ilike("participant_display_safe", `%${s}%`); }
      const limit = Math.max(1, Math.min(100, page.limit)); const offset = Math.max(0, page.offset);
      const r = await q.order("last_message_at", { ascending: sort === "oldest" } as never).range(offset, offset + limit - 1);
      const rows = (r.data as Row[]) ?? [];
      const items: ConvRow[] = rows.map((d) => ({ id: String(d.id), platform: d.platform as ConvRow["platform"], status: String(d.status), assigneeUserId: (d.assignee_user_id as string) ?? null, unread: Boolean(d.unread), participantDisplaySafe: (d.participant_display_safe as string) ?? null, lastMessageAt: (d.last_message_at as string) ?? null }));
      void queryConversations;
      return { items, total: (r.count as number) ?? items.length };
    },
    async listSyncConversations(orgId, limit) { let q = db().from("meta_dm_conversation" as never).select("*").neq("status", "resolved").order("last_message_at", { ascending: false } as never).limit(limit); if (orgId) q = q.eq("org_id", orgId); const r = await q; return ((r.data as Row[]) ?? []).map(convFromDb); },
    async findMessage(orgId, conversationId, ext) { const r = await db().from("meta_dm_message" as never).select("id").eq("org_id", orgId).eq("conversation_id", conversationId).eq("external_message_id", ext).maybeSingle(); return r.data ? { id: String((r.data as Row).id) } : null; },
    async insertMessage(orgId, conversationId, rec: MessageRecord, bodyCipher, fingerprint, sendId) {
      const found = await db().from("meta_dm_message" as never).select("id").eq("org_id", orgId).eq("conversation_id", conversationId).eq("external_message_id", rec.externalMessageId).maybeSingle();
      if (found.data) return { id: String((found.data as Row).id), created: false };
      const id = crypto.randomUUID();
      await db().from("meta_dm_message" as never).insert({ id, org_id: orgId, conversation_id: conversationId, external_message_id: rec.externalMessageId, direction: rec.direction, sender_external_id: rec.senderExternalId, body_ciphertext: bodyCipher, attachments_safe: rec.attachmentsSafe, delivery_state: rec.direction === "outbound" ? "sent" : null, send_id: sendId ?? null, provider_created_at: rec.providerCreatedAt, content_fingerprint: fingerprint, created_at: now() } as never);
      return { id, created: true };
    },
    async listMessages(orgId, conversationId, limit) { const r = await db().from("meta_dm_message" as never).select("id, direction, sender_external_id, body_ciphertext, policy_tag, delivery_state, provider_created_at").eq("org_id", orgId).eq("conversation_id", conversationId).order("provider_created_at", { ascending: true } as never).limit(limit); return ((r.data as Row[]) ?? []).map((d) => ({ id: String(d.id), direction: d.direction as MessageDirection, senderExternalId: (d.sender_external_id as string) ?? null, bodyCipher: (d.body_ciphertext as string) ?? null, policyTag: (d.policy_tag as string) ?? null, deliveryState: (d.delivery_state as string) ?? null, providerCreatedAt: (d.provider_created_at as string) ?? null })); },
    async setMessageDelivery(orgId, sendId, providerMessageId, deliveryState) { await db().from("meta_dm_message" as never).update({ delivery_state: deliveryState } as never).eq("org_id", orgId).eq("send_id", sendId); void providerMessageId; },
    async insertSend(row) { await db().from("meta_dm_send" as never).insert({ id: row.id, org_id: row.orgId, conversation_id: row.conversationId, draft_body_ciphertext: row.draftBodyCipher, policy_tag: row.policyTag, window_state: row.windowState, approval_state: row.approvalState, status: row.status, requested_by: row.requestedBy, correlation_id: row.correlationId, idempotency_key: row.idempotencyKey, safe_error_kind: row.safeErrorKind, created_at: now(), updated_at: now() } as never); },
    async getSend(orgId, id) { const r = await db().from("meta_dm_send" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle(); return r.data ? sendFromDb(r.data as Row) : null; },
    async updateSend(orgId, id, patch) { await db().from("meta_dm_send" as never).update(sendPatch(patch) as never).eq("org_id", orgId).eq("id", id); },
    async resolveConnectedAsset(orgId, assetId) {
      const page = await db().from("meta_page" as never).select("external_id").eq("org_id", orgId).eq("id", assetId).maybeSingle();
      if (page.data) return { assetExternalId: String((page.data as Row).external_id), platform: "facebook" };
      const ig = await db().from("meta_instagram_account" as never).select("external_id").eq("org_id", orgId).eq("id", assetId).maybeSingle();
      if (ig.data) return { assetExternalId: String((ig.data as Row).external_id), platform: "instagram" };
      return null;
    },
    async insertJob(row) { await db().from("meta_messaging_job" as never).insert({ ...jobToDb(row), created_at: now() } as never); },
    async getJob(orgId, id) { const r = await db().from("meta_messaging_job" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async findJobByIdem(orgId, key) { const r = await db().from("meta_messaging_job" as never).select("*").eq("org_id", orgId).eq("idempotency_key", key).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async findActiveJob(orgId, conversationId, jobKind) { const r = await db().from("meta_messaging_job" as never).select("*").eq("org_id", orgId).eq("conversation_id", conversationId).eq("job_kind", jobKind).in("status", ["scheduled", "available", "claimed", "executing", "retry_wait"] as never).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async updateJob(row) { await db().from("meta_messaging_job" as never).update(jobToDb(row) as never).eq("id", row.id); },
    async claimDueJobs(args) { const r = await db().rpc("meta_messaging_claim_due" as never, { p_now: new Date(args.nowMs).toISOString(), p_limit: args.limit, p_per_org_max: args.perOrgMax, p_lease_owner: args.leaseOwner, p_lease_seconds: args.leaseSeconds } as never); return ((r.data as unknown as Row[]) ?? []).map(jobFromDb); },
    async findStaleJobs(nowMs, limit) { const r = await db().from("meta_messaging_job" as never).select("*").in("status", ["claimed", "executing"] as never).lte("lease_expires_at", new Date(nowMs).toISOString()).limit(limit); return ((r.data as Row[]) ?? []).map(jobFromDb); },
    async countInFlight() { const r = await db().from("meta_messaging_job" as never).select("org_id").in("status", ["claimed", "executing"] as never); const rows = (r.data as Row[]) ?? []; const per: Record<string, number> = {}; for (const x of rows) { const o = String(x.org_id); per[o] = (per[o] ?? 0) + 1; } return { global: rows.length, perOrg: per }; },
    async queueHealth(orgId, nowMs) { let q = db().from("meta_messaging_job" as never).select("status, available_at"); if (orgId) q = q.eq("org_id", orgId); const r = await q; const rows = (r.data as Row[]) ?? []; const by: Record<string, number> = {}; let oldest: number | null = null; for (const x of rows) { const s = String(x.status); by[s] = (by[s] ?? 0) + 1; if ((s === "scheduled" || s === "available" || s === "retry_wait") && x.available_at) { const due = Date.parse(String(x.available_at)); if (due <= nowMs) { const age = nowMs - due; if (oldest == null || age > oldest) oldest = age; } } } return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: oldest }; },
  };
}
