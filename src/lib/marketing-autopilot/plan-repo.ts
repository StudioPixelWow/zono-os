/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Marketing Autopilot 2.0 · plan persistence repo (server-only). Thin,
// org-scoped access to the ONE marketing_plans table. Status transitions use
// CONDITIONAL updates (update ... where status=<expected>) so approval double-
// clicks and concurrent activations are decided by the database, never by a race
// in app code: the flip that returns 0 rows lost the race and no-ops. plan_json
// carries the full snapshot; this file never invents plan content.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MarketingPlanSnapshot, PlanStatus } from "./plan-core";

export interface MarketingPlanRow {
  id: string;
  org_id: string;
  property_id: string;
  created_by: string | null;
  approved_by: string | null;
  status: PlanStatus;
  source_version: string;
  plan_json: MarketingPlanSnapshot;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  activated_at: string | null;
}

const OPEN = ["draft", "approved", "activating", "active", "partially_completed"];
const TABLE = "marketing_plans";

/** The single OPEN (non-terminal) plan for a property, if any. */
export async function getOpenPlan(db: any, orgId: string, propertyId: string): Promise<MarketingPlanRow | null> {
  const { data } = await db.from(TABLE).select("*")
    .eq("org_id", orgId).eq("property_id", propertyId).in("status", OPEN)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as MarketingPlanRow) ?? null;
}

export async function getPlanById(db: any, orgId: string, planId: string): Promise<MarketingPlanRow | null> {
  const { data } = await db.from(TABLE).select("*").eq("org_id", orgId).eq("id", planId).maybeSingle();
  return (data as MarketingPlanRow) ?? null;
}

/** Insert a fresh DRAFT. If an open plan already exists (partial unique index),
 *  reuse it instead of erroring — "prepare" is idempotent per property. */
export async function insertDraft(
  db: any,
  args: { orgId: string; propertyId: string; createdBy: string | null; snapshot: MarketingPlanSnapshot },
): Promise<MarketingPlanRow> {
  const existing = await getOpenPlan(db, args.orgId, args.propertyId);
  if (existing) return existing;
  const { data, error } = await db.from(TABLE).insert({
    org_id: args.orgId, property_id: args.propertyId, created_by: args.createdBy,
    status: "draft", source_version: args.snapshot.sourceVersion, plan_json: args.snapshot,
  }).select("*").single();
  if (error) {
    // Lost a race on the unique index — return whoever won.
    const again = await getOpenPlan(db, args.orgId, args.propertyId);
    if (again) return again;
    throw error;
  }
  return data as MarketingPlanRow;
}

/** Persist an edited snapshot — only while still a draft. Returns null if not editable. */
export async function updateDraftSnapshot(db: any, orgId: string, planId: string, snapshot: MarketingPlanSnapshot): Promise<MarketingPlanRow | null> {
  const { data } = await db.from(TABLE).update({ plan_json: snapshot })
    .eq("org_id", orgId).eq("id", planId).eq("status", "draft").select("*").maybeSingle();
  return (data as MarketingPlanRow) ?? null;
}

/** draft → approved (conditional). Freezes the approved snapshot. */
export async function approveDraft(db: any, orgId: string, planId: string, approvedBy: string | null, snapshot: MarketingPlanSnapshot): Promise<MarketingPlanRow | null> {
  const { data } = await db.from(TABLE).update({
    status: "approved", approved_by: approvedBy, approved_at: new Date().toISOString(), plan_json: snapshot,
  }).eq("org_id", orgId).eq("id", planId).eq("status", "draft").select("*").maybeSingle();
  return (data as MarketingPlanRow) ?? null;
}

/** approved|partially_completed → activating (conditional CLAIM). Whoever flips it
 *  owns the run; a concurrent/double-click activation gets null and no-ops. */
export async function claimForActivation(db: any, orgId: string, planId: string): Promise<MarketingPlanRow | null> {
  const { data } = await db.from(TABLE).update({ status: "activating" })
    .eq("org_id", orgId).eq("id", planId).in("status", ["approved", "partially_completed"])
    .select("*").maybeSingle();
  return (data as MarketingPlanRow) ?? null;
}

/** activating → final status, persisting the executed snapshot. */
export async function finishActivation(db: any, orgId: string, planId: string, args: { status: PlanStatus; snapshot: MarketingPlanSnapshot }): Promise<MarketingPlanRow | null> {
  const patch: Record<string, unknown> = { status: args.status, plan_json: args.snapshot };
  if (args.status !== "activating") patch.activated_at = new Date().toISOString();
  const { data } = await db.from(TABLE).update(patch)
    .eq("org_id", orgId).eq("id", planId).eq("status", "activating").select("*").maybeSingle();
  return (data as MarketingPlanRow) ?? null;
}

/** draft|approved → cancelled (conditional). Active/executed plans are never silently killed. */
export async function cancelPlan(db: any, orgId: string, planId: string): Promise<MarketingPlanRow | null> {
  const { data } = await db.from(TABLE).update({ status: "cancelled" })
    .eq("org_id", orgId).eq("id", planId).in("status", ["draft", "approved"]).select("*").maybeSingle();
  return (data as MarketingPlanRow) ?? null;
}

/** Open plans across the org (portfolio /week + distribution home buckets). Bounded. */
export async function listOpenPlansForOrg(db: any, orgId: string, opts?: { limit?: number }): Promise<MarketingPlanRow[]> {
  const { data } = await db.from(TABLE).select("*")
    .eq("org_id", orgId).in("status", OPEN).order("updated_at", { ascending: false }).limit(opts?.limit ?? 200);
  return (data ?? []) as MarketingPlanRow[];
}

export function serviceDb(): any { return createServiceRoleClient(); }
