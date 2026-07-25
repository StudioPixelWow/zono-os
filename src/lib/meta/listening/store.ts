// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING STORE ADAPTER. Phase 5 (server).
// ----------------------------------------------------------------------------
// Supabase-backed ListeningStore (service-role writes; org-scoped reads). Sources
// are bound to CONNECTED assets (resolveConnectedAsset verifies the asset belongs to
// the org — an arbitrary external target can never be stored). Mentions dedup on
// (org, platform, external id); an edit updates in place with a new fingerprint.
// Matching lookups use the trusted Batch-6.8 provider-object mapping. Feed joins the
// Phase-4 CURRENT signal (sentiment/intent/urgency) by subject ref. No token, raw
// payload, webhook signature, or raw cursor text is stored. Claim reuses SKIP LOCKED.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ListeningStore, ListeningJobRow, ListeningSourceRow, StoredMention } from "./ports";
import type { MentionRecord, MentionFilter, MentionSort, MentionPage, MentionStatus, MatchState, ListeningSourceKind, SourceCapabilityState } from "./domain";
import type { MatchCandidates } from "./match";
import type { FeedRow } from "./feed";
import type { MetaPlatform } from "../types";

type Row = Record<string, unknown>;
const db = () => createServiceRoleClient();
const now = () => new Date().toISOString();

const jobToDb = (j: ListeningJobRow): Row => ({ id: j.id, org_id: j.orgId, listening_source_id: j.listeningSourceId, job_kind: j.jobKind, status: j.status, priority: j.priority, available_at: j.availableAtIso, cursor_ref: j.cursorRef, page_budget: j.pageBudget, record_budget: j.recordBudget, attempt_count: j.attemptCount, max_attempts: j.maxAttempts, retry_budget_remaining: j.retryBudgetRemaining, requeue_count: j.requeueCount, retry_after_ms: j.retryAfterMs, lease_owner: j.leaseOwner, lease_token: j.leaseToken, lease_expires_at: j.leaseExpiresAtIso, heartbeat_at: j.heartbeatAtIso, claimed_at: j.claimedAtIso, started_at: j.startedAtIso, completed_at: j.completedAtIso, next_attempt_at: j.nextAttemptAtIso, last_error_kind: j.lastErrorKind, safe_last_error: j.safeLastError, correlation_id: j.correlationId, idempotency_key: j.idempotencyKey, updated_at: now() });
const jobFromDb = (d: Row): ListeningJobRow => ({ id: String(d.id), orgId: String(d.org_id), listeningSourceId: String(d.listening_source_id), jobKind: d.job_kind as ListeningJobRow["jobKind"], status: d.status as ListeningJobRow["status"], priority: Number(d.priority ?? 100), availableAtIso: String(d.available_at), cursorRef: (d.cursor_ref as string) ?? null, pageBudget: Number(d.page_budget ?? 3), recordBudget: Number(d.record_budget ?? 200), attemptCount: Number(d.attempt_count ?? 0), maxAttempts: Number(d.max_attempts ?? 6), retryBudgetRemaining: Number(d.retry_budget_remaining ?? 6), requeueCount: Number(d.requeue_count ?? 0), retryAfterMs: (d.retry_after_ms as number) ?? null, leaseOwner: (d.lease_owner as string) ?? null, leaseToken: (d.lease_token as string) ?? null, leaseExpiresAtIso: (d.lease_expires_at as string) ?? null, heartbeatAtIso: (d.heartbeat_at as string) ?? null, claimedAtIso: (d.claimed_at as string) ?? null, startedAtIso: (d.started_at as string) ?? null, completedAtIso: (d.completed_at as string) ?? null, nextAttemptAtIso: (d.next_attempt_at as string) ?? null, lastErrorKind: (d.last_error_kind as string) ?? null, safeLastError: (d.safe_last_error as string) ?? null, correlationId: String(d.correlation_id ?? ""), idempotencyKey: String(d.idempotency_key ?? "") });
const sourceFromDb = (d: Row): ListeningSourceRow => ({ id: String(d.id), orgId: String(d.org_id), platform: d.platform as MetaPlatform, sourceKind: d.source_kind as ListeningSourceKind, assetId: String(d.asset_id), assetExternalId: (d.asset_external_id as string) ?? null, enabled: Boolean(d.enabled), capabilityState: (d.capability_state as SourceCapabilityState) ?? "unknown", safeBlockReason: (d.safe_block_reason as string) ?? null, cursorRef: (d.cursor_ref as string) ?? null, backfillState: String(d.backfill_state ?? "idle"), lastPolledAtIso: (d.last_polled_at as string) ?? null, nextPollAtIso: (d.next_poll_at as string) ?? null, lastSyncStatus: String(d.last_sync_status ?? "never") });
const mentionFromDb = (d: Row): StoredMention => ({ platform: d.platform as MetaPlatform, externalMentionId: String(d.external_mention_id), mentionKind: d.mention_kind as StoredMention["mentionKind"], sourceObjectRef: (d.source_object_ref as string) ?? null, authorExternalId: (d.author_external_id as string) ?? null, authorDisplaySafe: (d.author_display_safe as string) ?? null, messageText: String(d.message_text ?? ""), attachmentsSafe: (d.attachments_safe as StoredMention["attachmentsSafe"]) ?? [], permalinkSafe: (d.permalink_safe as string) ?? null, providerCreatedAt: (d.provider_created_at as string) ?? null, evidenceKind: (d.evidence_kind as StoredMention["evidenceKind"]) ?? "provider_poll", id: String(d.id), status: d.status as MentionStatus, matchState: d.match_state as MatchState, matchedAssetId: (d.matched_asset_id as string) ?? null, matchedProviderObjectId: (d.matched_provider_object_id as string) ?? null, inboxConversationId: (d.inbox_conversation_id as string) ?? null, intelligenceSignalRef: (d.intelligence_signal_ref as string) ?? null, ingestedAtIso: String(d.ingested_at ?? "") });
const sourceToDb = (p: Partial<ListeningSourceRow>): Row => { const b: Row = { updated_at: now() }; if (p.enabled !== undefined) b.enabled = p.enabled; if (p.capabilityState !== undefined) b.capability_state = p.capabilityState; if (p.safeBlockReason !== undefined) b.safe_block_reason = p.safeBlockReason; if (p.cursorRef !== undefined) b.cursor_ref = p.cursorRef; if (p.backfillState !== undefined) b.backfill_state = p.backfillState; if (p.lastPolledAtIso !== undefined) b.last_polled_at = p.lastPolledAtIso; if (p.nextPollAtIso !== undefined) b.next_poll_at = p.nextPollAtIso; if (p.lastSyncStatus !== undefined) b.last_sync_status = p.lastSyncStatus; return b; };

export function createSupabaseListeningStore(): ListeningStore {
  return {
    async getSource(orgId, id) { const r = await db().from("meta_listening_source" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle(); return r.data ? sourceFromDb(r.data as Row) : null; },
    async listSources(orgId) { const r = await db().from("meta_listening_source" as never).select("*").eq("org_id", orgId).order("created_at", { ascending: false } as never); return ((r.data as Row[]) ?? []).map(sourceFromDb); },
    async findSourceByAsset(orgId, assetId, sourceKind) { const r = await db().from("meta_listening_source" as never).select("*").eq("org_id", orgId).eq("asset_id", assetId).eq("source_kind", sourceKind).maybeSingle(); return r.data ? sourceFromDb(r.data as Row) : null; },
    async createSource(row) { await db().from("meta_listening_source" as never).insert({ id: row.id, org_id: row.orgId, platform: row.platform, source_kind: row.sourceKind, asset_id: row.assetId, asset_external_id: row.assetExternalId, enabled: row.enabled, capability_state: row.capabilityState, safe_block_reason: row.safeBlockReason, cursor_ref: row.cursorRef, backfill_state: row.backfillState, next_poll_at: row.nextPollAtIso, last_sync_status: row.lastSyncStatus, created_by: row.createdBy, created_at: now(), updated_at: now() } as never); },
    async updateSource(orgId, id, patch) { await db().from("meta_listening_source" as never).update(sourceToDb(patch) as never).eq("org_id", orgId).eq("id", id); },
    async listDueSources(nowMs, limit) { const r = await db().from("meta_listening_source" as never).select("*").eq("enabled", true).or(`next_poll_at.is.null,next_poll_at.lte.${new Date(nowMs).toISOString()}`).order("next_poll_at", { ascending: true, nullsFirst: true } as never).limit(limit); return ((r.data as Row[]) ?? []).map(sourceFromDb); },
    async resolveConnectedAsset(orgId, assetId) {
      const page = await db().from("meta_page" as never).select("external_id").eq("org_id", orgId).eq("id", assetId).maybeSingle();
      if (page.data) return { assetExternalId: String((page.data as Row).external_id), platform: "facebook" };
      const ig = await db().from("meta_instagram_account" as never).select("external_id").eq("org_id", orgId).eq("id", assetId).maybeSingle();
      if (ig.data) return { assetExternalId: String((ig.data as Row).external_id), platform: "instagram" };
      return null;
    },
    async findMention(orgId, platform, externalMentionId) { const r = await db().from("meta_mention" as never).select("*").eq("org_id", orgId).eq("platform", platform).eq("external_mention_id", externalMentionId).maybeSingle(); return r.data ? mentionFromDb(r.data as Row) : null; },
    async upsertMention(orgId, sourceId, rec: MentionRecord, fingerprint) {
      const found = await db().from("meta_mention" as never).select("id, content_fingerprint").eq("org_id", orgId).eq("platform", rec.platform).eq("external_mention_id", rec.externalMentionId).maybeSingle();
      if (found.data) { const d = found.data as Row; const id = String(d.id); const changed = String(d.content_fingerprint ?? "") !== fingerprint; if (changed) await db().from("meta_mention" as never).update({ message_text: rec.messageText, attachments_safe: rec.attachmentsSafe, permalink_safe: rec.permalinkSafe, author_display_safe: rec.authorDisplaySafe, edited_at: now(), content_fingerprint: fingerprint, updated_at: now() } as never).eq("id", id); return { id, created: false, changed }; }
      const id = crypto.randomUUID();
      await db().from("meta_mention" as never).insert({ id, org_id: orgId, listening_source_id: sourceId, platform: rec.platform, external_mention_id: rec.externalMentionId, mention_kind: rec.mentionKind, source_object_ref: rec.sourceObjectRef, author_external_id: rec.authorExternalId, author_display_safe: rec.authorDisplaySafe, message_text: rec.messageText, attachments_safe: rec.attachmentsSafe, permalink_safe: rec.permalinkSafe, provider_created_at: rec.providerCreatedAt, content_fingerprint: fingerprint, status: "new", match_state: "unmatched", evidence_kind: rec.evidenceKind, ingested_at: now(), created_at: now(), updated_at: now() } as never);
      return { id, created: true, changed: true };
    },
    async setMentionMatch(orgId, id, m) { await db().from("meta_mention" as never).update({ match_state: m.matchState, matched_asset_id: m.matchedAssetId, matched_provider_object_id: m.matchedProviderObjectId, updated_at: now() } as never).eq("org_id", orgId).eq("id", id); },
    async setMentionProjection(orgId, id, conversationId) { await db().from("meta_mention" as never).update({ inbox_conversation_id: conversationId, status: "actionable", updated_at: now() } as never).eq("org_id", orgId).eq("id", id).eq("status", "new"); await db().from("meta_mention" as never).update({ inbox_conversation_id: conversationId, updated_at: now() } as never).eq("org_id", orgId).eq("id", id); },
    async getMention(orgId, id) { const r = await db().from("meta_mention" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle(); return r.data ? mentionFromDb(r.data as Row) : null; },
    async setMentionStatus(orgId, id, status, actorId) { await db().from("meta_mention" as never).update({ status, updated_at: now() } as never).eq("org_id", orgId).eq("id", id); void actorId; },
    async listFeed(orgId, filter: MentionFilter, sort: MentionSort, page: MentionPage) {
      let q = db().from("meta_mention" as never).select("id, platform, mention_kind, match_state, status, author_display_safe, message_text, provider_created_at, inbox_conversation_id, listening_source_id, external_mention_id", { count: "exact" } as never).eq("org_id", orgId);
      if (filter.sourceId) q = q.eq("listening_source_id", filter.sourceId);
      if (filter.platform) q = q.eq("platform", filter.platform);
      if (filter.mentionKind) q = q.eq("mention_kind", filter.mentionKind);
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.matchState === "unmatched") q = q.eq("match_state", "unmatched"); else if (filter.matchState === "matched") q = q.neq("match_state", "unmatched"); else if (filter.matchState) q = q.eq("match_state", filter.matchState);
      if (filter.sinceIso) q = q.gte("provider_created_at", filter.sinceIso);
      if (filter.untilIso) q = q.lte("provider_created_at", filter.untilIso);
      if (filter.query && filter.query.trim()) { const s = filter.query.trim().replace(/[%_]/g, ""); q = q.or(`author_display_safe.ilike.%${s}%,message_text.ilike.%${s}%`); }
      const limit = Math.max(1, Math.min(100, page.limit)); const offset = Math.max(0, page.offset);
      const r = await q.order("provider_created_at", { ascending: sort === "oldest" } as never).range(offset, offset + limit - 1);
      const rows = (r.data as Row[]) ?? [];
      // Join the Phase-4 current signal (sentiment/intent/urgency) by subject ref.
      const refs = rows.map((d) => String(d.external_mention_id));
      const sigByRef = new Map<string, Row>();
      if (refs.length) { const sr = await db().from("meta_engagement_signal" as never).select("subject_ref, sentiment, intent, urgency").eq("org_id", orgId).eq("is_current", true).in("subject_ref", refs as never); for (const s of (sr.data as Row[]) ?? []) sigByRef.set(String(s.subject_ref), s); }
      let items: FeedRow[] = rows.map((d) => { const sig = sigByRef.get(String(d.external_mention_id)); return { id: String(d.id), platform: d.platform as FeedRow["platform"], mentionKind: String(d.mention_kind), matchState: d.match_state as MatchState, status: String(d.status), authorDisplaySafe: (d.author_display_safe as string) ?? null, messageText: String(d.message_text ?? ""), providerCreatedAt: (d.provider_created_at as string) ?? null, sentiment: sig ? String(sig.sentiment) : null, intent: sig ? String(sig.intent) : null, urgency: sig ? String(sig.urgency) : null, hasInboxProjection: !!d.inbox_conversation_id, sourceId: String(d.listening_source_id) }; });
      if (filter.sentiment) items = items.filter((x) => x.sentiment === filter.sentiment);
      if (filter.intent) items = items.filter((x) => x.intent === filter.intent);
      if (filter.urgency) items = items.filter((x) => x.urgency === filter.urgency);
      return { items, total: (r.count as number) ?? items.length };
    },
    async matchCandidates(orgId, trustedAssetId, sourceObjectRef): Promise<MatchCandidates> {
      let byRef: string | null = null, byMapping: string | null = null;
      if (sourceObjectRef) {
        const o = await db().from("meta_provider_object" as never).select("id").eq("org_id", orgId).eq("external_object_id", sourceObjectRef).maybeSingle();
        if (o.data) byRef = String((o.data as Row).id);
        if (!byRef) { const c = await db().from("meta_provider_object" as never).select("id").eq("org_id", orgId).eq("external_container_id", sourceObjectRef).maybeSingle(); if (c.data) byMapping = String((c.data as Row).id); }
      }
      return { trustedAssetId, providerObjectByRef: byRef, providerObjectByCanonicalMapping: byMapping, providerObjectByParentChild: null };
    },
    async insertJob(row) { await db().from("meta_listening_job" as never).insert({ ...jobToDb(row), created_at: now() } as never); },
    async getJob(orgId, id) { const r = await db().from("meta_listening_job" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async findJobByIdem(orgId, key) { const r = await db().from("meta_listening_job" as never).select("*").eq("org_id", orgId).eq("idempotency_key", key).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async findActiveJob(orgId, sourceId, jobKind) { const r = await db().from("meta_listening_job" as never).select("*").eq("org_id", orgId).eq("listening_source_id", sourceId).eq("job_kind", jobKind).in("status", ["scheduled", "available", "claimed", "executing", "retry_wait"] as never).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async updateJob(row) { await db().from("meta_listening_job" as never).update(jobToDb(row) as never).eq("id", row.id); },
    async claimDueJobs(args) { const r = await db().rpc("meta_listening_claim_due" as never, { p_now: new Date(args.nowMs).toISOString(), p_limit: args.limit, p_per_org_max: args.perOrgMax, p_lease_owner: args.leaseOwner, p_lease_seconds: args.leaseSeconds } as never); return ((r.data as unknown as Row[]) ?? []).map(jobFromDb); },
    async findStaleJobs(nowMs, limit) { const r = await db().from("meta_listening_job" as never).select("*").in("status", ["claimed", "executing"] as never).lte("lease_expires_at", new Date(nowMs).toISOString()).limit(limit); return ((r.data as Row[]) ?? []).map(jobFromDb); },
    async countInFlight() { const r = await db().from("meta_listening_job" as never).select("org_id").in("status", ["claimed", "executing"] as never); const rows = (r.data as Row[]) ?? []; const per: Record<string, number> = {}; for (const x of rows) { const o = String(x.org_id); per[o] = (per[o] ?? 0) + 1; } return { global: rows.length, perOrg: per }; },
    async queueHealth(orgId, nowMs) { let q = db().from("meta_listening_job" as never).select("status, available_at"); if (orgId) q = q.eq("org_id", orgId); const r = await q; const rows = (r.data as Row[]) ?? []; const by: Record<string, number> = {}; let oldest: number | null = null; for (const x of rows) { const s = String(x.status); by[s] = (by[s] ?? 0) + 1; if ((s === "scheduled" || s === "available" || s === "retry_wait") && x.available_at) { const due = Date.parse(String(x.available_at)); if (due <= nowMs) { const age = nowMs - due; if (oldest == null || age > oldest) oldest = age; } } } return { byStatus: by, deadLetter: by.dead_letter ?? 0, oldestDueMs: oldest }; },
  };
}
