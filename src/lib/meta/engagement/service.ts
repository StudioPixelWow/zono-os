// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · ENGAGEMENT SERVICE (server wiring). Phase 1.
// ----------------------------------------------------------------------------
// Wires the comment engine to production adapters: the Supabase engagement store
// (SKIP LOCKED claim), the sealed comments gateway, the same server credential
// resolver publishing uses, and a capability resolver built on the existing
// evaluator (reusing publish/service.resolveRuntime). The webhook comment handler
// REUSES the Batch-6.8 signature verification unmodified and only enqueues bounded
// ingestion — the worker pulls authoritative content. Moderation is approval-gated
// and role-gated; the dispatcher/recover entrypoints are protected internal routes.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { resolveAssetCredential, resolveRuntime } from "../publish/service";
import { createCommentsGateway } from "../provider/graph";
import { verifySignatureDualSecret } from "../webhooks/verify";
import { createWebhookStore } from "../webhooks/store";
import { extractCommentSignals } from "./webhook";
import { createSupabaseEngagementStore } from "./store";
import type { EngagementPorts, CapabilityResolver, ModerationActionRow } from "./ports";
import * as engine from "./engine";
import { canViewComments, canRequestModeration, canApproveModeration } from "./roles";
export { canViewComments, canRequestModeration, canApproveModeration } from "./roles";
import { toModerationActionDTO, toCommentDTO, toThreadDTO, type ModerationActionDTO, type CommentDTO, type ThreadDTO } from "./read";
import type { MetaPlatform } from "../types";
import type { ModerationKind } from "./domain";

function secrets(): string[] { return [process.env.META_WEBHOOK_SECRET ?? process.env.META_APP_SECRET ?? "", process.env.META_WEBHOOK_SECRET_PREVIOUS ?? ""].filter(Boolean); }
const readCap = (p: MetaPlatform) => (p === "instagram" ? "instagram.comments.read" : "facebook.comments.read");
const moderateCap = (p: MetaPlatform) => (p === "instagram" ? "instagram.comments.reply" : "facebook.comments.reply");

function capabilityResolver(): CapabilityResolver {
  return {
    async commentsReadAllowed(orgId, assetId, platform) { const rt = await resolveRuntime(orgId, assetId, readCap(platform)); return rt.capability.allowed; },
    async commentsModerateAllowed(orgId, assetId, platform) { const rt = await resolveRuntime(orgId, assetId, moderateCap(platform)); return { allowed: rt.capability.allowed, assetActive: rt.assetStatus === "active" }; },
  };
}

export function buildEngagementPorts(): EngagementPorts {
  return {
    store: createSupabaseEngagementStore(),
    gateway: createCommentsGateway(),
    credential: { resolve: (orgId, assetId) => resolveAssetCredential(orgId, assetId) },
    capability: capabilityResolver(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_comment", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
    random: { fraction: () => Math.random() },
  };
}

// ── Webhook comment handler (reuses 6.8 verify unmodified; enqueues sync) ──────
export interface CommentWebhookResult { accepted: boolean; reason: string; enqueued: number; unmatched: number; gated: number }
export async function handleCommentWebhook(rawBody: string | Buffer, signatureHeader: string | null, contentType: string | null): Promise<CommentWebhookResult> {
  const sig = verifySignatureDualSecret(rawBody, signatureHeader, secrets(), { contentType });
  if (!sig.ok) return { accepted: false, reason: sig.reason, enqueued: 0, unmatched: 0, gated: 0 };
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody); } catch { return { accepted: true, reason: "malformed_json", enqueued: 0, unmatched: 0, gated: 0 }; }
  const signals = extractCommentSignals(parsed);
  if (signals.length === 0) return { accepted: true, reason: "no_comment_signals", enqueued: 0, unmatched: 0, gated: 0 };

  const ports = buildEngagementPorts();
  const webhookStore = createWebhookStore();
  const res: CommentWebhookResult = { accepted: true, reason: "ok", enqueued: 0, unmatched: 0, gated: 0 };
  for (const s of signals) {
    if (!s.postExternalId) { res.unmatched++; continue; }
    // Match the parent post to a canonical provider object (org derived from it).
    const obj = await webhookStore.findProviderObjectByExternalId(s.postExternalId);
    if (!obj) { res.unmatched++; continue; }
    const ref = await ports.store.objectRef(obj.orgId, obj.providerObjectId);
    if (!ref) { res.unmatched++; continue; }
    if (!(await ports.capability.commentsReadAllowed(obj.orgId, ref.assetId, ref.platform))) { res.gated++; continue; }
    // Debounced per (post, minute): a burst of comment webhooks → one sync job.
    const idem = crypto.createHash("sha256").update(`${obj.orgId}|comment_sync|${obj.providerObjectId}|${Math.floor(Date.now() / 60000)}`).digest("hex");
    await engine.scheduleIngestion(ports, { orgId: obj.orgId, providerObjectId: obj.providerObjectId, kind: "comment_sync", availableAtMs: Date.now(), priority: 40, correlationId: crypto.randomUUID(), idempotencyKey: idem });
    res.enqueued++;
  }
  return res;
}

// ── User-facing (authenticated, org server-side, role + capability gated) ──────
export async function backfillComments(orgId: string, role: string, providerObjectId: string): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canViewComments(role)) return { ok: false, error: "forbidden" };
  const ports = buildEngagementPorts();
  const ref = await ports.store.objectRef(orgId, providerObjectId);
  if (!ref) return { ok: false, error: "not_found" };
  if (!(await ports.capability.commentsReadAllowed(orgId, ref.assetId, ref.platform))) return { ok: false, error: "capability_denied" };
  const idem = crypto.createHash("sha256").update(`${orgId}|comment_backfill|${providerObjectId}`).digest("hex");
  const r = await engine.scheduleIngestion(ports, { orgId, providerObjectId, kind: "comment_backfill", availableAtMs: Date.now(), priority: 80, correlationId: crypto.randomUUID(), idempotencyKey: idem });
  return { ok: true, jobId: r.job.id };
}

export async function requestModeration(orgId: string, userId: string, role: string, input: { targetCommentId: string; actionKind: ModerationKind; replyText?: string }): Promise<{ ok: boolean; error?: string; action?: ModerationActionDTO }> {
  if (!canRequestModeration(role)) return { ok: false, error: "forbidden" };
  const ports = buildEngagementPorts();
  const comment = await ports.store.getComment(orgId, input.targetCommentId);
  if (!comment) return { ok: false, error: "not_found" };
  const cap = await ports.capability.commentsModerateAllowed(orgId, "", comment.platform).catch(() => ({ allowed: false, assetActive: false }));
  void cap; // capability is re-checked at execution against the real asset
  const idem = crypto.createHash("sha256").update(`${orgId}|${input.actionKind}|${input.targetCommentId}|${(input.replyText ?? "").slice(0, 64)}`).digest("hex");
  const r = await engine.createModerationAction(ports, { orgId, actorId: userId, actionKind: input.actionKind, platform: comment.platform, targetCommentId: input.targetCommentId, providerObjectId: comment.providerObjectId, replyText: input.replyText ?? null, correlationId: crypto.randomUUID(), idempotencyKey: idem });
  if (!r.ok || !r.action) return { ok: false, error: r.error ?? "request_failed" };
  return { ok: true, action: toModerationActionDTO(r.action) };
}

export async function approveModeration(orgId: string, userId: string, role: string, actionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!canApproveModeration(role)) return { ok: false, error: "forbidden" };
  const r = await engine.approveModerationAction(buildEngagementPorts(), orgId, userId, actionId);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "approve_failed" };
}
export async function rejectModeration(orgId: string, userId: string, role: string, actionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!canRequestModeration(role)) return { ok: false, error: "forbidden" };
  const r = await engine.rejectModerationAction(buildEngagementPorts(), orgId, userId, actionId);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "reject_failed" };
}

// ── Internal worker entrypoints (protected routes only) ────────────────────────
export interface CommentTickResult { claimed: number; ingested: number; succeeded: number; failed: number; retries: number }
export async function runCommentDispatchTick(opts?: { limit?: number; perOrgMax?: number }): Promise<CommentTickResult> {
  const ports = buildEngagementPorts();
  const leaseOwner = `comment:${crypto.randomUUID()}`;
  const claimed = await engine.dispatchDue(ports, { leaseOwner, limit: opts?.limit, perOrgMax: opts?.perOrgMax });
  const res: CommentTickResult = { claimed: claimed.length, ingested: 0, succeeded: 0, failed: 0, retries: 0 };
  for (const job of claimed) {
    const out = await engine.workJob(ports, job);
    res.ingested += out.ingested ?? 0;
    if (out.job.status === "succeeded") res.succeeded++;
    else if (out.job.status === "failed" || out.job.status === "dead_letter") res.failed++;
    else if (out.job.status === "retry_wait" || out.outcome === "page_continued") res.retries++;
  }
  return res;
}
export async function runCommentRecoveryTick(opts?: { limit?: number }): Promise<{ recovered: number; requeued: number; manualReview: number }> {
  return engine.recoverAbandoned(buildEngagementPorts(), { limit: opts?.limit });
}

// ── Reads (safe DTOs; org-scoped, service-role) ──────────────────────────────
type Row = Record<string, unknown>;
export async function listComments(orgId: string, providerObjectId: string): Promise<readonly CommentDTO[]> {
  const r = await createServiceRoleClient().from("meta_comment" as never).select("id, external_comment_id, platform, external_parent_comment_id, root_external_comment_id, author_display, message_text, like_count, reply_count, status, is_from_page, provider_created_at").eq("org_id", orgId).eq("provider_object_id", providerObjectId).order("provider_created_at", { ascending: true } as never);
  return ((r.data as Row[]) ?? []).map((d) => toCommentDTO(d as never));
}
export async function listThreads(orgId: string, providerObjectId: string): Promise<readonly ThreadDTO[]> {
  const r = await createServiceRoleClient().from("meta_comment_thread" as never).select("root_external_comment_id, reply_count, last_activity_at, page_replied, has_unaddressed").eq("org_id", orgId).eq("provider_object_id", providerObjectId).order("last_activity_at", { ascending: false } as never);
  return ((r.data as Row[]) ?? []).map((d) => toThreadDTO(d as never));
}
export async function listActionsForComment(orgId: string, commentId: string): Promise<readonly ModerationActionDTO[]> {
  const r = await createServiceRoleClient().from("meta_engagement_action" as never).select("*").eq("org_id", orgId).eq("target_comment_id", commentId).order("created_at", { ascending: false } as never);
  return ((r.data as Row[]) ?? []).map((d) => toModerationActionDTO({ id: String(d.id), orgId, actionKind: d.action_kind as never, platform: d.platform as never, targetCommentId: String(d.target_comment_id), providerObjectId: (d.provider_object_id as string) ?? null, replyText: (d.reply_text as string) ?? null, approvalState: d.approval_state as never, status: d.status as never, requestedBy: null, approvedBy: null, providerResultId: null, safeErrorKind: (d.safe_error_kind as string) ?? null, safeErrorMessage: null, retryable: false, retryClass: null, attemptCount: 0, correlationId: "", idempotencyKey: "", executedAtIso: (d.executed_at as string) ?? null } as ModerationActionRow));
}

// ── Queue health (Batch 7 · Production GA) — secret-free status-count snapshot ─
export async function getEngagementQueueHealth(orgId: string | null): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }> {
  return createSupabaseEngagementStore().queueHealth(orgId, Date.now());
}
