"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Marketing Autopilot 2.0 · server ACTIONS (the UI's only entry points).
// prepare → edit → validate → ONE approval (אשר והפעל) → retry / cancel. Every
// action re-derives org + user from the session (browser IDs are never trusted),
// scopes the plan to the org, and routes execution through the orchestrator +
// canonical engines. Approval is the single consequential step: it validates
// against fresh facts, freezes the snapshot, then activates. No external send
// happens outside this gated path.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { buildPreparedSnapshot } from "./plan-prepare";
import { validateSnapshot } from "./plan-validate";
import { activateMarketingPlan } from "./plan-orchestrator";
import {
  insertDraft, updateDraftSnapshot, approveDraft, cancelPlan, getPlanById, getOpenPlan, serviceDb,
} from "./plan-repo";
import { buildSummary, canEditFrom, type MarketingPlanSnapshot, type PlanItem } from "./plan-core";

async function ctx() {
  const { profile, user } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  const userId = user?.id ?? null;
  let isManager = false;
  try { const sb = await createClient(); const { data } = await sb.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }
  return { orgId, userId, isManager };
}

export interface PreparePlanResult { ok: boolean; planId?: string; error?: string }

/** Build (or reuse) the prepared DRAFT for a property and return its id. */
export async function preparePlanAction(propertyId: string): Promise<PreparePlanResult> {
  const { orgId, userId, isManager } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  const db: any = serviceDb();

  const existing = await getOpenPlan(db, orgId, propertyId);
  if (existing) return { ok: true, planId: existing.id };

  const snapshot = await buildPreparedSnapshot(orgId, propertyId, { isManager, userId, db });
  if (!snapshot) return { ok: false, error: "לא נמצאו נתוני שיווק לנכס." };
  const row = await insertDraft(db, { orgId, propertyId, createdBy: userId, snapshot: { ...snapshot, planId: "" } });
  // Stamp the real planId into the stored snapshot.
  await updateDraftSnapshot(db, orgId, row.id, { ...(row.plan_json as MarketingPlanSnapshot), planId: row.id });
  await emitBusinessEvent({ type: DOMAIN_EVENTS.marketingPlanCreated, entityType: "property", entityId: propertyId, orgId, actorUserId: userId, idempotencyKey: `marketing.plan_created:${row.id}`, payload: { planId: row.id } });
  return { ok: true, planId: row.id };
}

/** Prepare drafts for several properties at once (portfolio "הכן את השבוע").
 *  Each becomes an independent, individually-reviewable DRAFT — never auto-approved. */
export async function prepareManyPlansAction(propertyIds: string[]): Promise<{ ok: boolean; prepared: number; error?: string }> {
  const { orgId, userId, isManager } = await ctx();
  if (!orgId) return { ok: false, prepared: 0, error: "אין הרשאה." };
  const db: any = serviceDb();
  let prepared = 0;
  for (const propertyId of propertyIds.slice(0, 50)) {
    const existing = await getOpenPlan(db, orgId, propertyId);
    if (existing) { prepared++; continue; }
    const snapshot = await buildPreparedSnapshot(orgId, propertyId, { isManager, userId, db });
    if (!snapshot) continue;
    const row = await insertDraft(db, { orgId, propertyId, createdBy: userId, snapshot: { ...snapshot, planId: "" } });
    await updateDraftSnapshot(db, orgId, row.id, { ...(row.plan_json as MarketingPlanSnapshot), planId: row.id });
    await emitBusinessEvent({ type: DOMAIN_EVENTS.marketingPlanCreated, entityType: "property", entityId: propertyId, orgId, actorUserId: userId, idempotencyKey: `marketing.plan_created:${row.id}`, payload: { planId: row.id, batch: true } });
    prepared++;
  }
  return { ok: true, prepared };
}

export type PlanEdit =
  | { kind: "caption"; itemId: string; caption: string }
  | { kind: "groups"; itemId: string; groupIds: string[] }
  | { kind: "schedule"; itemId: string; startDate?: string; frequency?: string }
  | { kind: "selectCreative"; itemId: string; creativeOutputId: string | null }
  | { kind: "removeRecipient"; itemId: string; buyerId: string }
  | { kind: "removeItem"; itemId: string };

export interface EditResult { ok: boolean; error?: string }

/** Apply an edit to a DRAFT plan. Never touches an approved/active plan. */
export async function updatePlanDraftAction(planId: string, edit: PlanEdit): Promise<EditResult> {
  const { orgId, userId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  const db: any = serviceDb();
  const row = await getPlanById(db, orgId, planId);
  if (!row) return { ok: false, error: "התוכנית לא נמצאה." };
  if (!canEditFrom(row.status)) return { ok: false, error: "לא ניתן לערוך תוכנית שכבר אושרה. שכפלו לתוכנית חדשה." };

  const snap = row.plan_json as MarketingPlanSnapshot;
  let items: PlanItem[] = snap.items;

  if (edit.kind === "removeItem") {
    items = items.filter((i) => i.itemId !== edit.itemId);
  } else {
    // Resolve group names for a groups edit (never trust client-supplied names).
    const groupNames: Record<string, string> = {};
    if (edit.kind === "groups" && edit.groupIds.length) {
      const { data: gr } = await db.from("distribution_groups").select("id,name").eq("org_id", orgId).in("id", edit.groupIds);
      for (const g of (gr ?? []) as any[]) groupNames[g.id] = (g.name as string) ?? "קבוצה";
    }
    items = items.map((it) => {
      if (it.itemId !== edit.itemId) return it;
      const n: PlanItem = { ...it };
      if (edit.kind === "caption" && n.facebook) n.facebook = { ...n.facebook, caption: edit.caption };
      if (edit.kind === "groups" && n.facebook) n.facebook = { ...n.facebook, groupIds: edit.groupIds, groupNames: edit.groupIds.map((id) => groupNames[id] ?? "קבוצה") };
      if (edit.kind === "schedule" && n.facebook) n.facebook = { ...n.facebook, startDate: edit.startDate ?? n.facebook.startDate, frequency: edit.frequency ?? n.facebook.frequency };
      if (edit.kind === "selectCreative" && n.facebook) n.facebook = { ...n.facebook, creativeOutputId: edit.creativeOutputId };
      if (edit.kind === "removeRecipient" && n.buyer) {
        const removed = [...new Set([...n.buyer.removedIds, edit.buyerId])];
        const recipients = n.buyer.recipientIds.filter((id) => id !== edit.buyerId);
        n.buyer = { ...n.buyer, removedIds: removed, recipientIds: recipients, estimatedRecipients: recipients.length };
      }
      return n;
    });
  }

  const nextSnap: MarketingPlanSnapshot = { ...snap, items, summary: buildSummary(items), audit: { ...snap.audit, editedBy: userId, editedAt: new Date().toISOString() } };
  const saved = await updateDraftSnapshot(db, orgId, planId, nextSnap);
  if (!saved) return { ok: false, error: "העריכה נכשלה — ייתכן שהתוכנית כבר אושרה." };
  await emitBusinessEvent({ type: DOMAIN_EVENTS.marketingPlanUpdated, entityType: "property", entityId: snap.propertyId, orgId, actorUserId: userId, payload: { planId, edit: edit.kind } });
  return { ok: true };
}

export interface ValidatePreview { ok: boolean; blockers: string[]; notices: string[]; canApprove: boolean; error?: string }

/** Pre-approval preview — re-validate and show what will change / what blocks. */
export async function validatePlanAction(planId: string): Promise<ValidatePreview> {
  const { orgId } = await ctx();
  if (!orgId) return { ok: false, blockers: [], notices: [], canApprove: false, error: "אין הרשאה." };
  const db: any = serviceDb();
  const row = await getPlanById(db, orgId, planId);
  if (!row) return { ok: false, blockers: [], notices: [], canApprove: false, error: "התוכנית לא נמצאה." };
  const v = await validateSnapshot(orgId, row.plan_json as MarketingPlanSnapshot, { db });
  return { ok: true, blockers: v.blockers, notices: v.notices, canApprove: v.canApprove };
}

export interface ApproveActivateResult { ok: boolean; status?: string; blockers?: string[]; notices?: string[]; error?: string }

/** THE single approval: validate → freeze approved snapshot → activate through the
 *  canonical engines. Idempotent + concurrency-safe (repo status claims). */
export async function approveAndActivatePlanAction(planId: string): Promise<ApproveActivateResult> {
  const { orgId, userId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  const db: any = serviceDb();
  const row = await getPlanById(db, orgId, planId);
  if (!row) return { ok: false, error: "התוכנית לא נמצאה." };

  // Already approved/active → just (re)activate (idempotent retry).
  if (row.status === "approved" || row.status === "partially_completed") {
    const out = await activateMarketingPlan(orgId, planId, { actorUserId: userId, db });
    return { ok: out.ok, status: out.status };
  }
  if (row.status !== "draft") return { ok: false, error: "התוכנית אינה במצב שניתן לאשר.", status: row.status };

  const v = await validateSnapshot(orgId, row.plan_json as MarketingPlanSnapshot, { db });
  if (!v.canApprove) return { ok: false, blockers: v.blockers, notices: v.notices, error: "התוכנית אינה מוכנה לאישור." };

  const approvedSnap: MarketingPlanSnapshot = { ...v.snapshot, audit: { ...v.snapshot.audit, approvedBy: userId, approvedAt: new Date().toISOString() } };
  const approved = await approveDraft(db, orgId, planId, userId, approvedSnap);
  if (!approved) return { ok: false, error: "האישור נכשל — ייתכן שהתוכנית כבר אושרה." };
  await emitBusinessEvent({ type: DOMAIN_EVENTS.marketingPlanApproved, entityType: "property", entityId: row.property_id, orgId, actorUserId: userId, idempotencyKey: `marketing.plan_approved:${planId}`, payload: { planId } });

  const out = await activateMarketingPlan(orgId, planId, { actorUserId: userId, db });
  return { ok: out.ok, status: out.status, notices: v.notices };
}

export interface RetryResult { ok: boolean; status?: string; error?: string }

/** Retry a partially-completed plan (re-runs only the failed items). */
export async function retryPlanAction(planId: string): Promise<RetryResult> {
  const { orgId, userId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  const db: any = serviceDb();
  const out = await activateMarketingPlan(orgId, planId, { actorUserId: userId, db });
  return { ok: out.ok, status: out.status };
}

/** Cancel a draft/approved plan. */
export async function cancelPlanAction(planId: string): Promise<{ ok: boolean; error?: string }> {
  const { orgId, userId } = await ctx();
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  const db: any = serviceDb();
  const row = await getPlanById(db, orgId, planId);
  if (!row) return { ok: false, error: "התוכנית לא נמצאה." };
  const cancelled = await cancelPlan(db, orgId, planId);
  if (!cancelled) return { ok: false, error: "לא ניתן לבטל תוכנית פעילה." };
  await emitBusinessEvent({ type: DOMAIN_EVENTS.marketingPlanUpdated, entityType: "property", entityId: row.property_id, orgId, actorUserId: userId, payload: { planId, cancelled: true } });
  return { ok: true };
}
