/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Marketing Autopilot 2.0 · read model for the workboard + surfaces
// (server-only). Composes the stored plan snapshot with the live editing options
// the review UI needs (active groups, approved creatives, the Facebook post
// identity) — all org-scoped. No writes, no fabricated data.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getPortfolioMarketingAutopilot, type PortfolioItem } from "./autopilot";
import { getPlanById, getOpenPlan, listOpenPlansForOrg, type MarketingPlanRow } from "./plan-repo";
import type { MarketingPlanSnapshot } from "./plan-core";

export interface GroupOption { id: string; name: string; city: string | null }
export interface CreativeOption { id: string; label: string; imageUrl: string | null; approved: boolean }
export interface PostIdentity { name: string; avatarUrl: string | null }

export interface PlanWorkboard {
  row: MarketingPlanRow;
  snapshot: MarketingPlanSnapshot;
  groups: GroupOption[];
  creatives: CreativeOption[];
  identity: PostIdentity;
}

export async function getPlanWorkboard(orgId: string, planId: string, opts?: { db?: any }): Promise<PlanWorkboard | null> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const row = await getPlanById(db, orgId, planId);
  if (!row) return null;
  const snapshot = row.plan_json as MarketingPlanSnapshot;

  const [groupsRes, creativeRes, orgRes] = await Promise.all([
    db.from("distribution_groups").select("id,name,city").eq("org_id", orgId).eq("status", "active").order("performance_score", { ascending: false }).limit(60),
    db.from("zono_quick_creative_outputs").select("id,is_approved,status,image_url,preview_url,variant_name").eq("org_id", orgId).eq("property_id", row.property_id).order("created_at", { ascending: false }).limit(12),
    db.from("organizations").select("name,logo_url").eq("id", orgId).maybeSingle(),
  ]);

  const groups: GroupOption[] = ((groupsRes?.data ?? []) as any[]).map((g) => ({ id: g.id, name: g.name ?? "קבוצה", city: g.city ?? null }));
  const creatives: CreativeOption[] = ((creativeRes?.data ?? []) as any[]).map((c) => ({
    id: c.id, label: (c.variant_name as string) || "קריאייטיב", imageUrl: (c.image_url || c.preview_url) ?? null, approved: !!(c.is_approved || c.status === "approved"),
  }));
  const identity: PostIdentity = { name: (orgRes?.data?.name as string) || "צוות ZONO", avatarUrl: (orgRes?.data?.logo_url as string) ?? null };

  return { row, snapshot, groups, creatives, identity };
}

/** The workboard for a property's OPEN plan (or null if none prepared yet). */
export async function getOpenPlanWorkboard(orgId: string, propertyId: string, opts?: { db?: any }): Promise<PlanWorkboard | null> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const row = await getOpenPlan(db, orgId, propertyId);
  if (!row) return null;
  return getPlanWorkboard(orgId, row.id, { db });
}

/** Compact plan state for the Control Center block / surfaces (open plan only). */
export interface PlanBadge { planId: string; status: MarketingPlanRow["status"]; itemCount: number; failedItems: number }

export async function getOpenPlanBadge(orgId: string, propertyId: string, opts?: { db?: any }): Promise<PlanBadge | null> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const row = await getOpenPlan(db, orgId, propertyId);
  if (!row) return null;
  const snap = row.plan_json as MarketingPlanSnapshot;
  const items = snap.items ?? [];
  const failedItems = items.filter((i) => (i.execution?.status ?? i.status) === "failed").length;
  return { planId: row.id, status: row.status, itemCount: items.length, failedItems };
}

export interface OpenPlanSummary { planId: string; propertyId: string; propertyTitle: string | null; imageUrl: string | null; status: MarketingPlanRow["status"]; itemCount: number; failedItems: number; updatedAt: string }

/** Open plans across the org, bucketed for /week + distribution home. */
export async function listOpenPlanSummaries(orgId: string, opts?: { db?: any; limit?: number }): Promise<OpenPlanSummary[]> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const rows = await listOpenPlansForOrg(db, orgId, { limit: opts?.limit ?? 200 });
  return rows.map((r) => {
    const snap = r.plan_json as MarketingPlanSnapshot;
    const items = snap.items ?? [];
    return {
      planId: r.id, propertyId: r.property_id, propertyTitle: snap.propertyTitle ?? null, imageUrl: snap.propertyImageUrl ?? null,
      status: r.status, itemCount: items.length,
      failedItems: items.filter((i) => (i.execution?.status ?? i.status) === "failed").length,
      updatedAt: r.updated_at,
    };
  });
}

// ── Portfolio week review (/distribution/week + distribution home buckets) ────
export interface WeekReview {
  needsPlan: PortfolioItem[];      // active properties needing marketing, no open plan yet
  drafts: OpenPlanSummary[];       // prepared, awaiting approval
  active: OpenPlanSummary[];       // approved / activating / active
  attention: OpenPlanSummary[];    // partially_completed / failed / has failed items
  counts: { needsPlan: number; drafts: number; active: number; attention: number };
}

/** Session-scoped weekly command surface — combines the deterministic portfolio
 *  scan with the stateful open plans, bucketed for review. */
export async function getMarketingWeekReview(opts?: { limit?: number }): Promise<WeekReview> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  const empty: WeekReview = { needsPlan: [], drafts: [], active: [], attention: [], counts: { needsPlan: 0, drafts: 0, active: 0, attention: 0 } };
  if (!orgId) return empty;

  const db: any = createServiceRoleClient();
  const [portfolio, open] = await Promise.all([
    getPortfolioMarketingAutopilot({ limit: opts?.limit ?? 200 }),
    listOpenPlanSummaries(orgId, { db, limit: opts?.limit ?? 200 }),
  ]);
  const withPlan = new Set(open.map((p) => p.propertyId));

  const needsPlan = portfolio.items.filter((i) => (i.priority === "P0" || i.priority === "P1") && !withPlan.has(i.propertyId));
  const drafts = open.filter((p) => p.status === "draft");
  const active = open.filter((p) => p.status === "approved" || p.status === "activating" || p.status === "active");
  const attention = open.filter((p) => p.status === "partially_completed" || p.status === "failed" || p.failedItems > 0);

  return { needsPlan, drafts, active, attention, counts: { needsPlan: needsPlan.length, drafts: drafts.length, active: active.length, attention: attention.length } };
}
