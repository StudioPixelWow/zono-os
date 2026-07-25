// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTELLIGENCE STORE ADAPTER. Phase 4 (server).
// ----------------------------------------------------------------------------
// Supabase-backed IntelligenceStore (service-role writes; org-scoped reads).
// Signals are APPEND-ONLY: `appendSignalAsCurrent` flips the prior current row to
// is_current=false (history preserved, never mutated in place) and inserts the new
// current row. Candidates/ context are a READ projection over the Phase-3 inbox +
// Phase-1 comments — no Graph call, no token, no raw payload stored. The atomic
// claim reuses the SKIP LOCKED SQL function.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { IntelligenceStore, IntelJobRow, StoredSignal, StoredSuggestion, ScoreCandidate } from "./ports";
import type { EngagementSignalRecord, IntelligenceSubjectKind, SuggestionStatus } from "./domain";
import type { ContextItem } from "./fingerprint";
import type { MetaPlatform } from "../types";

type Row = Record<string, unknown>;
const db = () => createServiceRoleClient();
const now = () => new Date().toISOString();

const jobToDb = (j: IntelJobRow): Row => ({ id: j.id, org_id: j.orgId, inbox_conversation_id: j.inboxConversationId, subject_kind: j.subjectKind, subject_ref: j.subjectRef, job_kind: j.jobKind, status: j.status, priority: j.priority, available_at: j.availableAtIso, content_fingerprint: j.contentFingerprint, attempt_count: j.attemptCount, max_attempts: j.maxAttempts, retry_budget_remaining: j.retryBudgetRemaining, requeue_count: j.requeueCount, lease_owner: j.leaseOwner, lease_token: j.leaseToken, lease_expires_at: j.leaseExpiresAtIso, heartbeat_at: j.heartbeatAtIso, claimed_at: j.claimedAtIso, started_at: j.startedAtIso, completed_at: j.completedAtIso, next_attempt_at: j.nextAttemptAtIso, last_error_kind: j.lastErrorKind, safe_last_error: j.safeLastError, correlation_id: j.correlationId, idempotency_key: j.idempotencyKey, updated_at: now() });
const jobFromDb = (d: Row): IntelJobRow => ({ id: String(d.id), orgId: String(d.org_id), inboxConversationId: String(d.inbox_conversation_id), subjectKind: (d.subject_kind as IntelligenceSubjectKind) ?? "comment_thread", subjectRef: String(d.subject_ref), jobKind: d.job_kind as IntelJobRow["jobKind"], status: d.status as IntelJobRow["status"], priority: Number(d.priority ?? 100), availableAtIso: String(d.available_at), contentFingerprint: (d.content_fingerprint as string) ?? null, attemptCount: Number(d.attempt_count ?? 0), maxAttempts: Number(d.max_attempts ?? 6), retryBudgetRemaining: Number(d.retry_budget_remaining ?? 6), requeueCount: Number(d.requeue_count ?? 0), leaseOwner: (d.lease_owner as string) ?? null, leaseToken: (d.lease_token as string) ?? null, leaseExpiresAtIso: (d.lease_expires_at as string) ?? null, heartbeatAtIso: (d.heartbeat_at as string) ?? null, claimedAtIso: (d.claimed_at as string) ?? null, startedAtIso: (d.started_at as string) ?? null, completedAtIso: (d.completed_at as string) ?? null, nextAttemptAtIso: (d.next_attempt_at as string) ?? null, lastErrorKind: (d.last_error_kind as string) ?? null, safeLastError: (d.safe_last_error as string) ?? null, correlationId: String(d.correlation_id ?? ""), idempotencyKey: String(d.idempotency_key ?? "") });
const signalFromDb = (d: Row): StoredSignal => ({ id: String(d.id), subjectKind: (d.subject_kind as IntelligenceSubjectKind) ?? "comment_thread", subjectRef: String(d.subject_ref), inboxConversationId: (d.inbox_conversation_id as string) ?? null, sentiment: d.sentiment as StoredSignal["sentiment"], sentimentScore: Number(d.sentiment_score ?? 0), intent: d.intent as StoredSignal["intent"], urgency: d.urgency as StoredSignal["urgency"], confidence: Number(d.confidence ?? 0), modelProviderSafe: (d.model_provider_safe as string) ?? null, modelNameSafe: (d.model_name_safe as string) ?? null, modelVersionSafe: (d.model_version_safe as string) ?? null, promptTemplateVersion: (d.prompt_template_version as string) ?? null, contentFingerprint: String(d.content_fingerprint ?? ""), processingState: d.processing_state as StoredSignal["processingState"], safeErrorKind: (d.safe_error_kind as string) ?? null, computedAtIso: String(d.computed_at ?? d.created_at ?? "") });
const suggestionFromDb = (d: Row): StoredSuggestion => ({ id: String(d.id), inboxConversationId: String(d.inbox_conversation_id), engagementSignalId: String(d.engagement_signal_id), actionKind: d.action_kind as StoredSuggestion["actionKind"], rationaleSafe: String(d.rationale_safe ?? ""), suggestedDraftRef: (d.suggested_draft_ref as string) ?? null, confidence: Number(d.confidence ?? 0), status: d.status as SuggestionStatus, routedRef: (d.routed_ref as string) ?? null, createdAtIso: String(d.created_at ?? "") });

export function createSupabaseIntelligenceStore(): IntelligenceStore {
  return {
    async listScoreCandidates(orgId, limit): Promise<readonly ScoreCandidate[]> {
      let cq = db().from("meta_inbox_conversation" as never).select("id, org_id, source_kind, source_ref, platform, provider_object_id, subject_preview, reply_count, last_activity_at").neq("status", "archived").order("last_activity_at", { ascending: false } as never).limit(limit);
      if (orgId) cq = cq.eq("org_id", orgId);
      const cr = await cq; const convs = (cr.data as Row[]) ?? [];
      if (convs.length === 0) return [];
      // Current signal fingerprints for these subjects (append-only current rows).
      const refs = convs.map((c) => String(c.source_ref));
      let sq = db().from("meta_engagement_signal" as never).select("subject_ref, content_fingerprint").eq("is_current", true).in("subject_ref", refs as never);
      if (orgId) sq = sq.eq("org_id", orgId);
      const sr = await sq; const fpByRef = new Map<string, string>();
      for (const s of (sr.data as Row[]) ?? []) fpByRef.set(String(s.subject_ref), String(s.content_fingerprint));
      return convs.map((c) => ({ orgId: String(c.org_id), inboxConversationId: String(c.id), subjectKind: "comment_thread" as const, subjectRef: String(c.source_ref), platform: c.platform as MetaPlatform, providerObjectId: (c.provider_object_id as string) ?? null, snapshot: { subjectRef: String(c.source_ref), replyCount: Number(c.reply_count ?? 0), lastActivityAt: (c.last_activity_at as string) ?? null, subjectPreview: String(c.subject_preview ?? "") }, currentSignalFingerprint: fpByRef.get(String(c.source_ref)) ?? null }));
    },
    async getCandidate(orgId, inboxConversationId): Promise<ScoreCandidate | null> {
      const cr = await db().from("meta_inbox_conversation" as never).select("id, org_id, source_kind, source_ref, platform, provider_object_id, subject_preview, reply_count, last_activity_at").eq("org_id", orgId).eq("id", inboxConversationId).maybeSingle();
      if (!cr.data) return null; const c = cr.data as Row;
      const sr = await db().from("meta_engagement_signal" as never).select("content_fingerprint").eq("org_id", orgId).eq("is_current", true).eq("subject_ref", String(c.source_ref)).maybeSingle();
      return { orgId, inboxConversationId: String(c.id), subjectKind: "comment_thread", subjectRef: String(c.source_ref), platform: c.platform as MetaPlatform, providerObjectId: (c.provider_object_id as string) ?? null, snapshot: { subjectRef: String(c.source_ref), replyCount: Number(c.reply_count ?? 0), lastActivityAt: (c.last_activity_at as string) ?? null, subjectPreview: String(c.subject_preview ?? "") }, currentSignalFingerprint: sr.data ? String((sr.data as Row).content_fingerprint) : null };
    },
    async loadContext(orgId, subjectRef, platform, maxItems): Promise<readonly ContextItem[]> {
      const r = await db().from("meta_comment" as never).select("author_display, message_text, is_from_page, provider_created_at").eq("org_id", orgId).eq("platform", platform).eq("root_external_comment_id", subjectRef).order("provider_created_at", { ascending: true } as never).limit(maxItems);
      return ((r.data as Row[]) ?? []).map((d) => ({ author: (d.author_display as string) ?? null, text: String(d.message_text ?? ""), at: (d.provider_created_at as string) ?? null, fromPage: Boolean(d.is_from_page) }));
    },
    async getCurrentSignal(orgId, subjectKind, subjectRef): Promise<StoredSignal | null> {
      const r = await db().from("meta_engagement_signal" as never).select("*").eq("org_id", orgId).eq("subject_kind", subjectKind).eq("subject_ref", subjectRef).eq("is_current", true).maybeSingle();
      return r.data ? signalFromDb(r.data as Row) : null;
    },
    async appendSignalAsCurrent(orgId, record: EngagementSignalRecord, computedAtIso) {
      // Append-only: retire the prior current (history preserved), insert new current.
      await db().from("meta_engagement_signal" as never).update({ is_current: false, processing_state: "superseded", updated_at: now() } as never).eq("org_id", orgId).eq("subject_kind", record.subjectKind).eq("subject_ref", record.subjectRef).eq("is_current", true);
      const prior = await db().from("meta_engagement_signal" as never).select("id").eq("org_id", orgId).eq("subject_kind", record.subjectKind).eq("subject_ref", record.subjectRef).order("computed_at", { ascending: false } as never).limit(1).maybeSingle();
      const id = crypto.randomUUID();
      await db().from("meta_engagement_signal" as never).insert({ id, org_id: orgId, inbox_conversation_id: record.inboxConversationId, subject_kind: record.subjectKind, subject_ref: record.subjectRef, sentiment: record.sentiment, sentiment_score: record.sentimentScore, intent: record.intent, urgency: record.urgency, confidence: record.confidence, model_provider_safe: record.modelProviderSafe, model_name_safe: record.modelNameSafe, model_version_safe: record.modelVersionSafe, prompt_template_version: record.promptTemplateVersion, content_fingerprint: record.contentFingerprint, supersedes_signal_id: prior.data ? String((prior.data as Row).id) : null, is_current: true, processing_state: "scored", computed_at: computedAtIso, created_at: now() } as never);
      return { id };
    },
    async listSignalsForConversation(orgId, inboxConversationId): Promise<readonly StoredSignal[]> {
      const r = await db().from("meta_engagement_signal" as never).select("*").eq("org_id", orgId).eq("inbox_conversation_id", inboxConversationId).order("computed_at", { ascending: false } as never).limit(20);
      return ((r.data as Row[]) ?? []).map(signalFromDb);
    },
    async replaceActiveSuggestions(orgId, inboxConversationId, signalId, suggestions) {
      // Expire prior active suggestions for this conversation (superseded by rescore).
      await db().from("meta_next_best_action" as never).update({ status: "expired", updated_at: now() } as never).eq("org_id", orgId).eq("inbox_conversation_id", inboxConversationId).eq("status", "suggested");
      if (suggestions.length === 0) return;
      const rows = suggestions.map((s) => ({ id: s.id, org_id: orgId, inbox_conversation_id: inboxConversationId, engagement_signal_id: signalId, action_kind: s.actionKind, rationale_safe: s.rationaleSafe, suggested_draft_ref: s.suggestedDraftRef, confidence: s.confidence, status: "suggested", created_at: now(), updated_at: now() }));
      await db().from("meta_next_best_action" as never).insert(rows as never);
    },
    async listActiveSuggestions(orgId, inboxConversationId): Promise<readonly StoredSuggestion[]> {
      const r = await db().from("meta_next_best_action" as never).select("*").eq("org_id", orgId).eq("inbox_conversation_id", inboxConversationId).eq("status", "suggested").order("confidence", { ascending: false } as never);
      return ((r.data as Row[]) ?? []).map(suggestionFromDb);
    },
    async getSuggestion(orgId, id): Promise<StoredSuggestion | null> {
      const r = await db().from("meta_next_best_action" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
      return r.data ? suggestionFromDb(r.data as Row) : null;
    },
    async markSuggestion(orgId, id, patch) {
      const body: Row = { status: patch.status, updated_at: now() };
      if (patch.status === "accepted") { body.accepted_by = patch.actorId ?? null; body.accepted_at = now(); if (patch.routedRef !== undefined) body.routed_ref = patch.routedRef; }
      if (patch.status === "dismissed") { body.dismissed_by = patch.actorId ?? null; body.dismissed_at = now(); body.dismiss_reason_safe = patch.reasonSafe ?? null; }
      await db().from("meta_next_best_action" as never).update(body as never).eq("org_id", orgId).eq("id", id);
    },
    async expireSuggestionsOlderThan(orgId, beforeIso, limit) {
      let q = db().from("meta_next_best_action" as never).select("id").eq("status", "suggested").lt("created_at", beforeIso).limit(limit);
      if (orgId) q = q.eq("org_id", orgId);
      const r = await q; const ids = ((r.data as Row[]) ?? []).map((x) => String(x.id));
      if (ids.length === 0) return 0;
      await db().from("meta_next_best_action" as never).update({ status: "expired", updated_at: now() } as never).in("id", ids as never);
      return ids.length;
    },
    async insertJob(row) { await db().from("meta_intelligence_job" as never).insert({ ...jobToDb(row), created_at: now() } as never); },
    async getJob(orgId, id) { const r = await db().from("meta_intelligence_job" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async findJobByIdem(orgId, key) { const r = await db().from("meta_intelligence_job" as never).select("*").eq("org_id", orgId).eq("idempotency_key", key).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async findActiveJob(orgId, subjectKind, subjectRef) { const r = await db().from("meta_intelligence_job" as never).select("*").eq("org_id", orgId).eq("subject_kind", subjectKind).eq("subject_ref", subjectRef).in("status", ["scheduled", "available", "claimed", "executing", "retry_wait"] as never).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async updateJob(row) { await db().from("meta_intelligence_job" as never).update(jobToDb(row) as never).eq("id", row.id); },
    async claimDueJobs(args) { const r = await db().rpc("meta_intelligence_claim_due" as never, { p_now: new Date(args.nowMs).toISOString(), p_limit: args.limit, p_per_org_max: args.perOrgMax, p_lease_owner: args.leaseOwner, p_lease_seconds: args.leaseSeconds } as never); return ((r.data as unknown as Row[]) ?? []).map(jobFromDb); },
    async findStaleJobs(nowMs, limit) { const r = await db().from("meta_intelligence_job" as never).select("*").in("status", ["claimed", "executing"] as never).lte("lease_expires_at", new Date(nowMs).toISOString()).limit(limit); return ((r.data as Row[]) ?? []).map(jobFromDb); },
    async countInFlight() { const r = await db().from("meta_intelligence_job" as never).select("org_id").in("status", ["claimed", "executing"] as never); const rows = (r.data as Row[]) ?? []; const per: Record<string, number> = {}; for (const x of rows) { const o = String(x.org_id); per[o] = (per[o] ?? 0) + 1; } return { global: rows.length, perOrg: per }; },
    async queueHealth(orgId, nowMs) { let q = db().from("meta_intelligence_job" as never).select("status, available_at"); if (orgId) q = q.eq("org_id", orgId); const r = await q; const rows = (r.data as Row[]) ?? []; const by: Record<string, number> = {}; let oldest: number | null = null; for (const x of rows) { const s = String(x.status); by[s] = (by[s] ?? 0) + 1; if ((s === "scheduled" || s === "available" || s === "retry_wait") && x.available_at) { const due = Date.parse(String(x.available_at)); if (due <= nowMs) { const age = nowMs - due; if (oldest == null || age > oldest) oldest = age; } } } return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: oldest }; },
  };
}
