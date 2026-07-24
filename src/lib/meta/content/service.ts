// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONTENT SERVICE (server wiring). Phase 2.
// ----------------------------------------------------------------------------
// Wires the pure content engine to production adapters (Supabase store, audit,
// clock, id-gen), resolves role → approval permissions, and applies local rate
// limits. Every write resolves org server-side, verifies role, and returns safe
// DTOs. NOTHING here publishes or calls Meta.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { logAudit } from "@/lib/audit/service";
import { decide } from "@/lib/platform/rate-limit/rate-limit";
import { createSupabaseContentStore } from "./store";
import type { ContentPorts } from "./ports";
import { resolvePermissions, canEditDrafts } from "./roles";
import * as engine from "./engine";
import { toDraftEditor, toDraftListItem, type DraftEditorDTO, type DraftListItemDTO } from "./read";
import { buildCalendar, type CalendarModel, type CalendarItem } from "./calendar";
import type { DraftState } from "./domain";

/** Build production content-engine ports. */
export function buildContentPorts(): ContentPorts {
  return {
    store: createSupabaseContentStore(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_content_draft", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
  };
}

// ── Local rate limits (NOT Meta Graph limits — no Graph call occurs) ─────────
export type MetaContentRateDomain = "media_upload" | "draft_create" | "draft_update" | "validation" | "approval" | "preview" | "version_restore";
const RATE: Record<MetaContentRateDomain, { limit: number; windowMs: number }> = {
  media_upload: { limit: 30, windowMs: 60_000 },
  draft_create: { limit: 30, windowMs: 60_000 },
  draft_update: { limit: 120, windowMs: 60_000 },
  validation: { limit: 120, windowMs: 60_000 },
  approval: { limit: 60, windowMs: 60_000 },
  preview: { limit: 240, windowMs: 60_000 },
  version_restore: { limit: 20, windowMs: 60_000 },
};
const counters = new Map<string, { count: number; windowStartMs: number }>();
/** Deterministic fixed-window rate check for a Phase-2 content action. */
export function rateCheck(domain: MetaContentRateDomain, subject: string, now = Date.now()): { allowed: boolean } {
  const key = `${domain}:${subject}`;
  const cfg = RATE[domain];
  const cur = counters.get(key);
  const d = decide(cur?.count ?? 0, cur?.windowStartMs ?? now, cfg, now);
  if (d.allowed) counters.set(key, { count: (cur && now - cur.windowStartMs < cfg.windowMs ? cur.count : 0) + 1, windowStartMs: cur && now - cur.windowStartMs < cfg.windowMs ? cur.windowStartMs : now });
  return { allowed: d.allowed };
}

// ── Draft operations (server entrypoints for routes/actions) ─────────────────
export async function createDraft(orgId: string, userId: string, internalName: string): Promise<DraftEditorDTO | { error: string }> {
  if (!rateCheck("draft_create", `${orgId}:${userId}`).allowed) return { error: "rate_limited" };
  const draft = await engine.createDraft(buildContentPorts(), { orgId, userId, internalName });
  return toDraftEditor(draft);
}

export async function listDrafts(orgId: string): Promise<readonly DraftListItemDTO[]> {
  const rows = await createSupabaseContentStore().listDrafts(orgId);
  return rows.map(toDraftListItem);
}

export async function getDraftEditor(orgId: string, draftId: string): Promise<DraftEditorDTO | null> {
  const d = await createSupabaseContentStore().getDraft(orgId, draftId);
  return d ? toDraftEditor(d) : null;
}

/** Guarded field edit with optimistic concurrency. */
export async function updateDraftFields(orgId: string, userId: string, role: string, draftId: string, patch: Partial<Pick<DraftState, "internalName" | "defaultCaption" | "defaultHashtags" | "plannedAt" | "timezone">>, expectedRevision: number): Promise<DraftEditorDTO | { error: string }> {
  if (!canEditDrafts(role)) return { error: "forbidden" };
  if (!rateCheck("draft_update", `${orgId}:${userId}`).allowed) return { error: "rate_limited" };
  const ports = buildContentPorts();
  const draft = await ports.store.getDraft(orgId, draftId);
  if (!draft) return { error: "not_found" };
  const r = await engine.editFields(ports, draft, patch, expectedRevision, userId);
  if (!r.ok) return { error: r.error ?? "edit_failed" };
  return toDraftEditor(r.draft);
}

/** Submit for approval (role-gated). */
export async function submitForApproval(orgId: string, userId: string, role: string, draftId: string): Promise<DraftEditorDTO | { error: string }> {
  if (!rateCheck("approval", `${orgId}:${userId}`).allowed) return { error: "rate_limited" };
  const ports = buildContentPorts();
  const draft = await ports.store.getDraft(orgId, draftId);
  if (!draft) return { error: "not_found" };
  const r = await engine.submitForApproval(ports, draft, userId, resolvePermissions(role, draft.createdBy === userId));
  if (!r.ok) return { error: r.error ?? "submit_failed" };
  return toDraftEditor(r.draft);
}

/** Build the editorial calendar read model (planning only — never publishes). */
export async function getCalendar(orgId: string): Promise<CalendarModel> {
  const drafts = await createSupabaseContentStore().listDrafts(orgId);
  const items: CalendarItem[] = drafts.filter((d) => !d.archivedAt).map((d) => ({
    draftId: d.id, internalName: d.internalName, status: d.status, approvalState: d.approvalState,
    plannedAt: d.plannedAt, timezone: d.timezone,
    platforms: [...new Set(d.targets.map((t) => t.platform))],
    contentKinds: [...new Set(d.targets.map((t) => t.contentKind))],
    readiness: "unknown", conflict: false,
  }));
  return buildCalendar(items);
}

/** Decide an approval (role-gated; creators cannot self-approve). */
export async function decideApproval(orgId: string, userId: string, role: string, draftId: string, action: "approve" | "reject" | "request_changes", reason: string | null): Promise<DraftEditorDTO | { error: string }> {
  if (!rateCheck("approval", `${orgId}:${userId}`).allowed) return { error: "rate_limited" };
  const ports = buildContentPorts();
  const draft = await ports.store.getDraft(orgId, draftId);
  if (!draft) return { error: "not_found" };
  const r = await engine.decideApproval(ports, draft, action, userId, resolvePermissions(role, draft.createdBy === userId), reason);
  if (!r.ok) return { error: r.error ?? "decision_failed" };
  return toDraftEditor(r.draft);
}
