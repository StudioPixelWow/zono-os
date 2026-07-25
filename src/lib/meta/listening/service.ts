// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · SOCIAL LISTENING SERVICE (server). Phase 5.
// ----------------------------------------------------------------------------
// Wires the pure listening engine to production adapters: the Supabase store, the
// sealed READ-ONLY listening gateway, the same server credential resolver, the SAME
// capability evaluator (resolveRuntime) mapped to listening caps + token health, the
// Phase-4 intelligence job path (REUSED — no new model), and the Phase-3 inbox
// projection (REUSED — no second inbox). The webhook handler REUSES the Batch-6.8
// signature verification + trusted asset→org mapping unchanged and only enqueues a
// bounded pull. Sources are derived from CONNECTED assets — an arbitrary external
// target can never be configured. Listening is READ-ONLY at the provider.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { logAudit } from "@/lib/audit/service";
import { resolveAssetCredential, resolveRuntime } from "../publish/service";
import { createListeningGateway } from "../provider/graph";
import { verifySignatureDualSecret } from "../webhooks/verify";
import { createWebhookStore } from "../webhooks/store";
import { createSupabaseInboxStore } from "../inbox/store";
import { buildIntelligencePorts } from "../intelligence/service";
import * as intelEngine from "../intelligence/engine";
import { subjectFingerprint } from "../intelligence/fingerprint";
import { createSupabaseListeningStore } from "./store";
import type { ListeningPorts, CapabilityResolver, IntelligenceEnqueue, InboxProjection } from "./ports";
import * as engine from "./engine";
import { extractMentionSignals } from "./webhook";
import { toSourceDTO, toFeedItemDTO, toMentionDetailDTO, type ListeningSourceDTO, type MentionFeedItemDTO, type MentionDetailDTO } from "./read";
import { canChangeStatus } from "./state";
import { canConfigureListening, canRefreshListening, canChangeMentionStatus } from "./roles";
export { canViewListening, canConfigureListening, canRefreshListening, canChangeMentionStatus } from "./roles";
import { isSourceKind, isMentionStatus, type ListeningSourceKind, type MentionFilter, type MentionSort, type MentionStatus, type SourceCapabilityState } from "./domain";
import type { MetaPlatform } from "../types";

function secrets(): string[] { return [process.env.META_WEBHOOK_SECRET ?? process.env.META_APP_SECRET ?? "", process.env.META_WEBHOOK_SECRET_PREVIOUS ?? ""].filter(Boolean); }

/** Map (platform, source surface) → the canonical listening capability key. */
function listeningCapKey(platform: MetaPlatform, sourceKind: ListeningSourceKind): string {
  if (platform === "facebook") return "facebook.mentions.read";
  return sourceKind === "tagged_media" ? "instagram.tags.read" : "instagram.mentions.read";
}
function mapCapState(allowed: boolean, reason: string | null): { state: SourceCapabilityState; reason: string | null } {
  if (allowed) return { state: "allowed", reason: null };
  const r = (reason ?? "").toLowerCase();
  if (/connect|health|token|expired|reauth/.test(r)) return { state: "blocked_token", reason };
  if (/unsupported|excluded|kill/.test(r)) return { state: "unsupported", reason };
  return { state: "blocked_capability", reason };
}

function capabilityResolver(): CapabilityResolver {
  return {
    async listeningAllowed(orgId, assetId, platform, sourceKind) {
      const rt = await resolveRuntime(orgId, assetId, listeningCapKey(platform, sourceKind));
      const s = mapCapState(rt.capability.allowed, (rt.capability as { reason?: string | null }).reason ?? null);
      return { allowed: rt.capability.allowed, state: s.state, reason: s.reason };
    },
    async killSwitchEngaged() { return process.env.META_LISTENING_KILL_SWITCH === "1"; },
  };
}
function intelligenceEnqueue(): IntelligenceEnqueue {
  return {
    async enqueueForConversation(orgId, conversationId) {
      const iports = buildIntelligencePorts();
      const candidate = await iports.store.getCandidate(orgId, conversationId);
      if (!candidate) return null;
      const fp = subjectFingerprint(candidate.snapshot);
      const r = await intelEngine.scheduleScoring(iports, { orgId, candidate, fingerprint: fp, jobKind: "score_conversation", correlationId: crypto.randomUUID(), idempotencyKey: `${conversationId}|listen_score|${fp}` });
      return r.job.id;
    },
  };
}
function inboxProjection(): InboxProjection {
  return {
    async projectMention(orgId, input) {
      const store = createSupabaseInboxStore();
      const up = await store.upsertConversation(orgId, { sourceKind: "mention", sourceRef: input.subjectRef, platform: input.platform, providerObjectId: input.providerObjectId, participantExternalId: null, participantDisplay: input.participantDisplay, subjectPreview: input.preview.slice(0, 160), replyCount: 0, lastActivityAt: input.lastActivityAt });
      return { conversationId: up.id, created: up.created };
    },
  };
}

export function buildListeningPorts(): ListeningPorts {
  return {
    store: createSupabaseListeningStore(),
    gateway: createListeningGateway(),
    credential: { resolve: (orgId, assetId) => resolveAssetCredential(orgId, assetId) },
    capability: capabilityResolver(),
    intelligence: intelligenceEnqueue(),
    inbox: inboxProjection(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_listening_source", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
    random: { fraction: () => Math.random() },
  };
}

// ── Webhook handler (reuses 6.8 verify + trusted asset→org; enqueues a pull) ───
export interface MentionWebhookResult { accepted: boolean; reason: string; enqueued: number; unmatched: number; gated: number }
export async function handleMentionWebhook(rawBody: string | Buffer, signatureHeader: string | null, contentType: string | null): Promise<MentionWebhookResult> {
  const sig = verifySignatureDualSecret(rawBody, signatureHeader, secrets(), { contentType });
  if (!sig.ok) return { accepted: false, reason: sig.reason, enqueued: 0, unmatched: 0, gated: 0 };
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody); } catch { return { accepted: true, reason: "malformed_json", enqueued: 0, unmatched: 0, gated: 0 }; }
  const signals = extractMentionSignals(parsed);
  if (signals.length === 0) return { accepted: true, reason: "no_mention_signals", enqueued: 0, unmatched: 0, gated: 0 };

  const ports = buildListeningPorts();
  const webhookStore = createWebhookStore();
  const res: MentionWebhookResult = { accepted: true, reason: "ok", enqueued: 0, unmatched: 0, gated: 0 };
  for (const s of signals) {
    // Org is derived from the TRUSTED asset→org mapping — NEVER from the payload.
    const asset = await webhookStore.resolveAsset(s.assetExternalId);
    if (!asset) { res.unmatched++; continue; }
    const sourceKind: ListeningSourceKind = s.topic === "tags" ? (s.platform === "instagram" ? "tagged_media" : "page_mentions") : (s.platform === "instagram" ? "account_mentions" : "page_mentions");
    const source = await ports.store.findSourceByAsset(asset.orgId, await assetIdFor(asset.orgId, s.assetExternalId, s.platform), sourceKind).catch(() => null);
    if (!source || !source.enabled) { res.gated++; continue; }
    const cap = await ports.capability.listeningAllowed(asset.orgId, source.assetId, s.platform, sourceKind);
    if (!cap.allowed) { res.gated++; continue; }
    const idem = `${source.id}|listening_webhook_followup|${Math.floor(Date.now() / 60000)}`;   // debounced per minute
    await engine.scheduleJob(ports, { orgId: asset.orgId, sourceId: source.id, jobKind: "listening_webhook_followup", cursorRef: source.cursorRef, correlationId: crypto.randomUUID(), idempotencyKey: idem });
    res.enqueued++;
  }
  return res;
}
async function assetIdFor(orgId: string, externalId: string, platform: MetaPlatform): Promise<string> {
  // Resolve the internal asset id from the trusted external id (org-scoped).
  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const table = platform === "instagram" ? "meta_instagram_account" : "meta_page";
  const r = await createServiceRoleClient().from(table as never).select("id").eq("org_id", orgId).eq("external_id", externalId).maybeSingle();
  return r.data ? String((r.data as { id: string }).id) : "";
}

// ── Sources (config is role + capability + connected-asset gated) ──────────────
export async function listSources(orgId: string): Promise<readonly ListeningSourceDTO[]> {
  return (await createSupabaseListeningStore().listSources(orgId)).map(toSourceDTO);
}
export async function createSource(orgId: string, userId: string, role: string, input: { assetId: string; sourceKind: string }): Promise<{ ok: boolean; error?: string; id?: string; blockedReason?: string | null }> {
  if (!canConfigureListening(role)) return { ok: false, error: "forbidden" };
  if (!isSourceKind(input.sourceKind)) return { ok: false, error: "bad_request" };
  const ports = buildListeningPorts();
  // The asset MUST be a connected asset owned by this org (no arbitrary target).
  const asset = await ports.store.resolveConnectedAsset(orgId, input.assetId);
  if (!asset) return { ok: false, error: "asset_not_connected" };
  const existing = await ports.store.findSourceByAsset(orgId, input.assetId, input.sourceKind);
  if (existing) return { ok: true, id: existing.id };
  const cap = await ports.capability.listeningAllowed(orgId, input.assetId, asset.platform, input.sourceKind);
  const id = crypto.randomUUID();
  await ports.store.createSource({ id, orgId, platform: asset.platform, sourceKind: input.sourceKind, assetId: input.assetId, assetExternalId: asset.assetExternalId, enabled: false, capabilityState: cap.state, safeBlockReason: cap.reason, cursorRef: null, backfillState: "idle", lastPolledAtIso: null, nextPollAtIso: null, lastSyncStatus: "never", createdBy: userId });
  await logAudit({ action: "meta.listening.source_created", category: "configuration", entityType: "meta_listening_source", entityId: id, summary: "listening source created", metadata: { platform: asset.platform, sourceKind: input.sourceKind, capabilityState: cap.state } });
  return { ok: true, id, blockedReason: cap.allowed ? null : cap.reason };
}
export async function setSourceEnabled(orgId: string, role: string, id: string, enabled: boolean): Promise<{ ok: boolean; error?: string; blockedReason?: string | null }> {
  if (!canConfigureListening(role)) return { ok: false, error: "forbidden" };
  const ports = buildListeningPorts();
  const source = await ports.store.getSource(orgId, id);
  if (!source) return { ok: false, error: "not_found" };
  if (enabled) {
    const cap = await ports.capability.listeningAllowed(orgId, source.assetId, source.platform, source.sourceKind);
    if (!cap.allowed) { await ports.store.updateSource(orgId, id, { capabilityState: cap.state, safeBlockReason: cap.reason }); return { ok: false, error: "capability_denied", blockedReason: cap.reason }; }
    await ports.store.updateSource(orgId, id, { enabled: true, capabilityState: "allowed", safeBlockReason: null, nextPollAtIso: new Date(Date.now()).toISOString() });
  } else {
    await ports.store.updateSource(orgId, id, { enabled: false, nextPollAtIso: null });   // disable stops future polling
  }
  await logAudit({ action: enabled ? "meta.listening.source_enabled" : "meta.listening.source_disabled", category: "configuration", entityType: "meta_listening_source", entityId: id, summary: `listening source ${enabled ? "enabled" : "disabled"}`, metadata: {} });
  return { ok: true };
}
export async function refreshSource(orgId: string, role: string, id: string, kind: "poll" | "backfill" = "poll"): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canRefreshListening(role)) return { ok: false, error: "forbidden" };
  const ports = buildListeningPorts();
  const source = await ports.store.getSource(orgId, id);
  if (!source) return { ok: false, error: "not_found" };
  if (!source.enabled) return { ok: false, error: "source_disabled" };
  const cap = await ports.capability.listeningAllowed(orgId, source.assetId, source.platform, source.sourceKind);
  if (!cap.allowed) return { ok: false, error: "capability_denied" };
  const jobKind = kind === "backfill" ? "listening_backfill" : "listening_poll";
  const idem = crypto.createHash("sha256").update(`${id}|${jobKind}|manual|${Math.floor(Date.now() / 60000)}`).digest("hex");
  const r = await engine.scheduleJob(ports, { orgId, sourceId: id, jobKind, availableAtMs: Date.now(), priority: 60, cursorRef: kind === "backfill" ? null : source.cursorRef, correlationId: crypto.randomUUID(), idempotencyKey: idem });
  await logAudit({ action: kind === "backfill" ? "meta.listening.backfill_scheduled" : "meta.listening.refresh_scheduled", category: "configuration", entityType: "meta_listening_source", entityId: id, summary: "listening refresh scheduled", metadata: { jobKind } });
  return { ok: true, jobId: r.job.id };
}

// ── Mentions (feed + detail + local status + inbox projection) ─────────────────
export async function listMentions(orgId: string, filter: MentionFilter, sort: MentionSort, page: { limit: number; offset: number }): Promise<{ items: readonly MentionFeedItemDTO[]; total: number }> {
  const r = await createSupabaseListeningStore().listFeed(orgId, filter, sort, page);
  return { items: r.items.map(toFeedItemDTO), total: r.total };
}
export async function getMention(orgId: string, id: string): Promise<MentionDetailDTO | null> {
  const m = await createSupabaseListeningStore().getMention(orgId, id);
  return m ? toMentionDetailDTO(m) : null;
}
export async function changeMentionStatus(orgId: string, userId: string, role: string, id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  if (!canChangeMentionStatus(role)) return { ok: false, error: "forbidden" };
  if (!isMentionStatus(status)) return { ok: false, error: "bad_request" };
  const store = createSupabaseListeningStore();
  const m = await store.getMention(orgId, id);
  if (!m) return { ok: false, error: "not_found" };
  const guard = canChangeStatus(m.status, status as MentionStatus);
  if (!guard.ok) return { ok: false, error: guard.reason ?? "illegal_transition" };
  await store.setMentionStatus(orgId, id, status as MentionStatus, userId);
  await logAudit({ action: "meta.listening.mention_status_changed", category: "configuration", entityType: "meta_mention", entityId: id, summary: "mention status changed", metadata: { to: status } });
  return { ok: true };
}
export async function projectMentionToInbox(orgId: string, userId: string, role: string, id: string): Promise<{ ok: boolean; error?: string; conversationId?: string }> {
  if (!canChangeMentionStatus(role)) return { ok: false, error: "forbidden" };
  const ports = buildListeningPorts();
  const m = await ports.store.getMention(orgId, id);
  if (!m) return { ok: false, error: "not_found" };
  if (m.matchState === "unmatched") return { ok: false, error: "unmatched_not_actionable" };
  const proj = await ports.inbox.projectMention(orgId, { platform: m.platform, subjectRef: m.externalMentionId, providerObjectId: m.matchedProviderObjectId, participantDisplay: m.authorDisplaySafe, preview: m.messageText, lastActivityAt: m.providerCreatedAt });
  await ports.store.setMentionProjection(orgId, id, proj.conversationId);
  await ports.intelligence.enqueueForConversation(orgId, proj.conversationId);
  await logAudit({ action: "meta.listening.inbox_projection_created", category: "configuration", entityType: "meta_mention", entityId: id, summary: "mention projected to inbox", metadata: {} });
  return { ok: true, conversationId: proj.conversationId };
}

// ── Internal worker entrypoints (protected routes only) ────────────────────────
export interface ListeningTickResult { scanned: number; enqueued: number; claimed: number; ingested: number; deduped: number; succeeded: number; failed: number; retries: number }
export async function runListeningDispatchTick(opts?: { limit?: number; perOrgMax?: number }): Promise<ListeningTickResult> {
  const ports = buildListeningPorts();
  const trig = await engine.enqueueDuePolls(ports, { limit: 50, correlationId: crypto.randomUUID() });
  const leaseOwner = `listen:${crypto.randomUUID()}`;
  const claimed = await engine.dispatchDue(ports, { leaseOwner, limit: opts?.limit, perOrgMax: opts?.perOrgMax });
  const res: ListeningTickResult = { scanned: trig.scanned, enqueued: trig.enqueued, claimed: claimed.length, ingested: 0, deduped: 0, succeeded: 0, failed: 0, retries: 0 };
  for (const job of claimed) {
    const out = await engine.workJob(ports, job);
    res.ingested += out.ingested ?? 0; res.deduped += out.deduped ?? 0;
    if (out.job.status === "succeeded") res.succeeded++;
    else if (out.job.status === "failed" || out.job.status === "dead_letter") res.failed++;
    else if (out.job.status === "retry_wait") res.retries++;
  }
  return res;
}
export async function runListeningRecoveryTick(opts?: { limit?: number }): Promise<{ recovered: number; requeued: number; deadLettered: number }> {
  return engine.recoverAbandoned(buildListeningPorts(), { limit: opts?.limit });
}
export async function runListeningBackfill(orgId: string, sourceId: string): Promise<{ ok: boolean; jobId?: string }> {
  const ports = buildListeningPorts();
  const idem = `${sourceId}|listening_backfill|${Math.floor(Date.now() / 3600000)}`;
  const r = await engine.scheduleJob(ports, { orgId, sourceId, jobKind: "listening_backfill", correlationId: crypto.randomUUID(), idempotencyKey: idem });
  return { ok: true, jobId: r.job.id };
}
export async function getListeningQueueHealth(orgId: string | null): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }> {
  return createSupabaseListeningStore().queueHealth(orgId, Date.now());
}
