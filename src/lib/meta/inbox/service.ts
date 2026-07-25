// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · UNIFIED INBOX SERVICE (server wiring). Phase 3.
// ----------------------------------------------------------------------------
// Wires the pure inbox engine to production adapters. The inbox is a LOCAL
// projection over Phase-1 canonical comment data — there is NO gateway and NO
// Graph call here; sync only folds already-ingested threads into unified
// conversations and advances a per-(org,platform) cursor. Capability is still
// honoured (never bypassed): platform-level inbox read requires an active asset
// on that platform whose comments.read capability is granted — reusing the same
// evaluator (publish/service.resolveRuntime) Phases 1/2 use. Local state actions
// (read/archive/assign/label/snooze) are role-gated and never touch Meta. The
// durable cursor-sync queue reuses the Batch-6.8 lease/job conventions; the
// dispatcher/recover entrypoints are protected internal routes. Reads return
// safe, secret-free DTOs.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { resolveRuntime } from "../publish/service";
import { createSupabaseInboxStore } from "./store";
import type { InboxPorts, CapabilityResolver } from "./ports";
import * as engine from "./engine";
import { toConversationListItem, toConversationDetail, toLabelDTO, type ConversationListItemDTO, type ConversationDetailDTO, type LabelDTO } from "./read";
import { canViewInbox, canManageInbox, canAssignInbox } from "./roles";
export { canViewInbox, canManageInbox, canAssignInbox } from "./roles";
import type { InboxFilter, InboxSort, InboxPage } from "./domain";
import type { InboxAction } from "./state";
import type { MetaPlatform } from "../types";

const readCap = (p: MetaPlatform) => (p === "instagram" ? "instagram.comments.read" : "facebook.comments.read");

/** Resolve one active asset for (org, platform) to anchor the capability check. */
async function activeAssetId(orgId: string, platform: MetaPlatform): Promise<string | null> {
  const db = createServiceRoleClient();
  const table = platform === "instagram" ? "meta_instagram_account" : "meta_page";
  const r = await db.from(table as never).select("id").eq("org_id", orgId).eq("status", "active").limit(1).maybeSingle();
  return r.data ? String((r.data as { id: string }).id) : null;
}

// Platform-level inbox read: an active asset on that platform must grant comments.read.
// The inbox never calls Graph, but it still refuses to surface a platform the org has
// lost read capability on — capability is honoured, not bypassed.
function capabilityResolver(): CapabilityResolver {
  return {
    async inboxReadAllowed(orgId, platform) {
      const assetId = await activeAssetId(orgId, platform);
      if (!assetId) return false;
      const rt = await resolveRuntime(orgId, assetId, readCap(platform));
      return rt.capability.allowed;
    },
  };
}

export function buildInboxPorts(): InboxPorts {
  return {
    store: createSupabaseInboxStore(),
    capability: capabilityResolver(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_inbox_conversation", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
    random: { fraction: () => Math.random() },
  };
}

// ── Seed / refresh sync (user-triggered) ───────────────────────────────────────
export async function seedInboxSync(orgId: string, role: string, platform: MetaPlatform): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canViewInbox(role)) return { ok: false, error: "forbidden" };
  const ports = buildInboxPorts();
  if (!(await ports.capability.inboxReadAllowed(orgId, platform))) return { ok: false, error: "capability_denied" };
  const idem = crypto.createHash("sha256").update(`${orgId}|inbox_sync|${platform}|seed`).digest("hex");
  const r = await engine.scheduleSync(ports, { orgId, platform, availableAtMs: Date.now(), priority: 70, correlationId: crypto.randomUUID(), idempotencyKey: idem });
  return { ok: true, jobId: r.job.id };
}

// ── Internal worker entrypoints (protected routes only) ────────────────────────
export interface InboxTickResult { claimed: number; projected: number; created: number; succeeded: number; failed: number; retries: number }
export async function runInboxDispatchTick(opts?: { limit?: number; perOrgMax?: number }): Promise<InboxTickResult> {
  const ports = buildInboxPorts();
  const leaseOwner = `inbox:${crypto.randomUUID()}`;
  const claimed = await engine.dispatchDue(ports, { leaseOwner, limit: opts?.limit, perOrgMax: opts?.perOrgMax });
  const res: InboxTickResult = { claimed: claimed.length, projected: 0, created: 0, succeeded: 0, failed: 0, retries: 0 };
  for (const job of claimed) {
    const out = await engine.workJob(ports, job);
    res.projected += out.projected ?? 0;
    res.created += out.created ?? 0;
    if (out.job.status === "succeeded") res.succeeded++;
    else if (out.job.status === "failed" || out.job.status === "dead_letter") res.failed++;
    else if (out.job.status === "retry_wait") res.retries++;
  }
  return res;
}
export async function runInboxRecoveryTick(opts?: { limit?: number }): Promise<{ recovered: number; requeued: number }> {
  return engine.recoverAbandoned(buildInboxPorts(), { limit: opts?.limit });
}

// ── Local conversation actions (role-gated; never touch Meta) ──────────────────
export async function applyInboxAction(orgId: string, userId: string, role: string, conversationId: string, action: InboxAction, payload?: { assigneeUserId?: string | null; labelId?: string; snoozedUntil?: string; priority?: number }): Promise<{ ok: boolean; error?: string }> {
  const isAssign = action === "assign" || action === "unassign";
  if (isAssign ? !canAssignInbox(role) : !canManageInbox(role)) return { ok: false, error: "forbidden" };
  const r = await engine.applyConversationAction(buildInboxPorts(), orgId, userId, conversationId, action, payload);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "action_failed" };
}

// ── Labels (list open; manage-gated create) ────────────────────────────────────
export async function listInboxLabels(orgId: string): Promise<readonly LabelDTO[]> {
  const labels = await createSupabaseInboxStore().listLabels(orgId);
  return labels.map(toLabelDTO);
}
export async function createInboxLabel(orgId: string, role: string, name: string, color: string | null): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!canManageInbox(role)) return { ok: false, error: "forbidden" };
  const clean = (name || "").trim().slice(0, 64);
  if (!clean) return { ok: false, error: "bad_request" };
  const id = await createSupabaseInboxStore().createLabel(orgId, clean, color);
  return { ok: true, id };
}

// ── Reads (safe DTOs; org-scoped) ─────────────────────────────────────────────
export async function listInboxConversations(orgId: string, filter: InboxFilter, sort: InboxSort, page: InboxPage): Promise<{ items: readonly ConversationListItemDTO[]; total: number }> {
  const r = await createSupabaseInboxStore().listConversations(orgId, filter, sort, page);
  return { items: r.items.map(toConversationListItem), total: r.total };
}
export async function getInboxConversation(orgId: string, id: string): Promise<ConversationDetailDTO | null> {
  const c = await createSupabaseInboxStore().getConversation(orgId, id);
  return c ? toConversationDetail(c) : null;
}
export async function getInboxUnreadCount(orgId: string): Promise<number> {
  return createSupabaseInboxStore().countUnread(orgId);
}
