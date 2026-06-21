// ============================================================================
// ZONO — Autonomous Office AI Layer · Service (server-only)
// ----------------------------------------------------------------------------
// Gathers a unified read-only snapshot from the Decision Brain (attention_items
// + opportunity_signals) and guarded module metrics, then reasons it (pure
// engine) into briefs / opportunities / risks / role focus / growth plans /
// simulations. The Decision Brain is the SOURCE; this layer does not duplicate
// its logic. Permission-aware (agent / manager / executive). No autonomous acts.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getSessionContext } from "@/lib/auth/session";
import {
  generateOpportunities, generateRisks, generateFocus, generateBrief, generateGrowthPlan, simulate,
  type Snapshot, type Signal, type OfficeMetrics, type Role, type OpportunityItem, type RiskItem,
  type FocusItem, type Brief, type GrowthPlanType, type ScenarioKey,
} from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false, isAdmin = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default */ }
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "admin" }); isAdmin = data === true; } catch { /* default */ }
  const role: Role = isAdmin ? "executive" : isManager ? "manager" : "agent";
  return { userId: user.id, orgId: profile.org_id, isManager, isAdmin, role, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;

// ── snapshot from the Decision Brain (read-only) ──────────────────────────────
async function headCount(supabase: DB, table: string, col: string, orgId: string, extra?: (q: ReturnType<DB["from"]>) => unknown): Promise<number> {
  try {
    const q = supabase.from(table as "deals").select("id", { count: "exact", head: true }).eq(col, orgId);
    if (extra) extra(q as unknown as ReturnType<DB["from"]>);
    const { count } = await q; return count ?? 0;
  } catch { return 0; }
}

async function gatherSnapshot(supabase: DB, orgId: string): Promise<Snapshot> {
  const signals: Signal[] = [];
  try {
    const { data } = await supabase.from("attention_items").select("entity_type,entity_id,title,reason,recommended_action,attention_score,urgency_score,impact_score,confidence_score,revenue_impact_score,relationship_impact_score,churn_impact_score").eq("org_id", orgId).eq("status", "open").order("attention_score", { ascending: false }).limit(80);
    for (const a of (data ?? []) as Record<string, unknown>[]) signals.push({
      entity_type: a.entity_type as string, entity_id: (a.entity_id as string) ?? null, title: a.title as string,
      reason: (a.reason as string) ?? null, recommended_action: (a.recommended_action as string) ?? null,
      attention: (a.attention_score as number) ?? 0, urgency: (a.urgency_score as number) ?? 0, impact: (a.impact_score as number) ?? 0,
      confidence: (a.confidence_score as number) ?? 50, revenue_impact: (a.revenue_impact_score as number) ?? 0,
      relationship_impact: (a.relationship_impact_score as number) ?? 0, churn_impact: (a.churn_impact_score as number) ?? 0, kind: "attention",
    });
  } catch { /* attention items optional */ }
  try {
    const { data } = await supabase.from("opportunity_signals").select("entity_type,entity_id,title,description,recommended_action,opportunity_score,impact_score,confidence_score").eq("org_id", orgId).eq("status", "open").order("opportunity_score", { ascending: false }).limit(40);
    for (const o of (data ?? []) as Record<string, unknown>[]) signals.push({
      entity_type: o.entity_type as string, entity_id: (o.entity_id as string) ?? null, title: o.title as string,
      reason: (o.description as string) ?? null, recommended_action: (o.recommended_action as string) ?? null,
      attention: (o.opportunity_score as number) ?? 0, urgency: 50, impact: (o.impact_score as number) ?? 0,
      confidence: (o.confidence_score as number) ?? 50, revenue_impact: (o.opportunity_score as number) ?? 0,
      relationship_impact: 20, churn_impact: 0, kind: "opportunity",
    });
  } catch { /* opportunity signals optional */ }

  // ── guarded metrics ──
  const metrics: OfficeMetrics = {
    openDeals: 0, wonDeals: 0, lostDeals: 0, pipelineWeightedRevenue: 0, atRiskRevenue: 0,
    financingReady: 0, financingRisk: 0, referralRevenue: 0, ambassadors: 0,
    territoryOpportunities: 0, pendingSignatures: 0, blockedDeals: 0,
  };
  metrics.openDeals = await headCount(supabase, "deals", "org_id", orgId, (q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq("status", "open"));
  metrics.wonDeals = await headCount(supabase, "deals", "org_id", orgId, (q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq("status", "won"));
  metrics.lostDeals = await headCount(supabase, "deals", "org_id", orgId, (q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq("status", "lost"));
  try {
    const { data } = await supabase.from("deal_forecasts").select("probability_weighted_revenue,deal_risk_score").eq("organization_id", orgId).limit(2000);
    for (const f of (data ?? []) as { probability_weighted_revenue: number; deal_risk_score: number }[]) {
      metrics.pipelineWeightedRevenue += f.probability_weighted_revenue ?? 0;
      if ((f.deal_risk_score ?? 0) >= 60) metrics.atRiskRevenue += f.probability_weighted_revenue ?? 0;
    }
  } catch { /* forecasts optional */ }
  metrics.financingReady = await headCount(supabase, "buyer_financial_profiles", "organization_id", orgId, (q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq("readiness_band", "ready"));
  metrics.financingRisk = await headCount(supabase, "buyer_financial_profiles", "organization_id", orgId, (q) => (q as unknown as { in: (c: string, v: string[]) => unknown }).in("financing_risk", ["high", "critical"]));
  metrics.ambassadors = await headCount(supabase, "client_advocates", "organization_id", orgId, (q) => (q as unknown as { in: (c: string, v: string[]) => unknown }).in("advocate_level", ["ambassador", "elite_ambassador"]));
  try { const { data } = await supabase.from("referrals").select("revenue").eq("organization_id", orgId).limit(2000); for (const r of (data ?? []) as { revenue: number }[]) metrics.referralRevenue += r.revenue ?? 0; } catch { /* optional */ }
  metrics.territoryOpportunities = await headCount(supabase, "territory_signals", "organization_id", orgId, (q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq("status", "open"));
  metrics.pendingSignatures = await headCount(supabase, "documents", "org_id", orgId, (q) => (q as unknown as { in: (c: string, v: string[]) => unknown }).in("signature_status", ["pending_signature", "partially_signed"]));
  try { const { data } = await supabase.from("document_checklists").select("blocking_count").eq("organization_id", orgId); metrics.blockedDeals = ((data ?? []) as { blocking_count: number }[]).filter((c) => (c.blocking_count ?? 0) > 0).length; } catch { /* optional */ }

  return { signals, metrics };
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface AIOfficeCommandCenter {
  role: Role; canExecutive: boolean; isManager: boolean;
  brief: Brief; focus: FocusItem[]; opportunities: OpportunityItem[]; risks: RiskItem[];
  metrics: OfficeMetrics;
  growthPlans: { id: string; plan_type: string; title: string; summary: string | null; expected_revenue_impact: number; created_at: string }[];
  simulations: { id: string; scenario_key: string; title: string; summary: string | null; created_at: string }[];
}

export async function getAIOfficeCommandCenter(): Promise<AIOfficeCommandCenter> {
  const { orgId, role, isManager, isAdmin, supabase } = await ctx();
  const snap = await gatherSnapshot(supabase, orgId);
  const brief = generateBrief(role, role === "executive" ? "executive" : "daily", snap);
  const focus = generateFocus(role, snap);
  const opportunities = generateOpportunities(snap);
  const risks = generateRisks(snap);

  const { data: gp } = await supabase.from("ai_growth_plans").select("id,plan_type,title,summary,expected_revenue_impact,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20);
  const growthPlans = ((gp ?? []) as Record<string, unknown>[]).map((p) => ({ id: p.id as string, plan_type: p.plan_type as string, title: p.title as string, summary: (p.summary as string) ?? null, expected_revenue_impact: (p.expected_revenue_impact as number) ?? 0, created_at: p.created_at as string }));
  const { data: sim } = await supabase.from("ai_simulations").select("id,scenario_key,title,summary,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20);
  const simulations = ((sim ?? []) as Record<string, unknown>[]).map((s) => ({ id: s.id as string, scenario_key: s.scenario_key as string, title: s.title as string, summary: (s.summary as string) ?? null, created_at: s.created_at as string }));

  return { role, canExecutive: isAdmin, isManager, brief, focus, opportunities, risks, metrics: snap.metrics, growthPlans, simulations };
}

// ── persisted actions ──────────────────────────────────────────────────────
export async function saveBrief(): Promise<{ id: string }> {
  const { orgId, userId, role, supabase } = await ctx();
  const snap = await gatherSnapshot(supabase, orgId);
  const brief = generateBrief(role, role === "executive" ? "executive" : "daily", snap);
  const { data, error } = await supabase.from("ai_briefs").insert({
    organization_id: orgId, brief_type: role === "executive" ? "executive" : "daily", scope: role,
    headline: brief.headline, summary: brief.summary, sections: brief.sections as unknown as Json,
    opportunity_count: brief.opportunityCount, risk_count: brief.riskCount, focus_count: brief.focusCount, generated_by: userId,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "שמירת התדריך נכשלה");
  return { id: (data as { id: string }).id };
}

export async function createGrowthPlan(planType: GrowthPlanType): Promise<{ id: string }> {
  const { orgId, userId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול ליצור תוכנית צמיחה");
  const snap = await gatherSnapshot(supabase, orgId);
  const plan = generateGrowthPlan(planType, snap);
  const { data, error } = await supabase.from("ai_growth_plans").insert({
    organization_id: orgId, plan_type: plan.plan_type, horizon_days: plan.horizon_days, title: plan.title,
    summary: plan.summary, steps: plan.steps as unknown as Json, expected_revenue_impact: plan.expected_revenue_impact, status: "draft", created_by: userId,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת התוכנית נכשלה");
  return { id: (data as { id: string }).id };
}

export async function runSimulation(scenario: ScenarioKey): Promise<{ id: string; summary: string }> {
  const { orgId, userId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול להריץ סימולציה");
  const snap = await gatherSnapshot(supabase, orgId);
  const sim = simulate(scenario, snap);
  const { data, error } = await supabase.from("ai_simulations").insert({
    organization_id: orgId, scenario_key: sim.scenario_key, title: sim.title, inputs: {} as Json,
    projections: sim.projections as unknown as Json, summary: sim.summary, created_by: userId,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "הסימולציה נכשלה");
  return { id: (data as { id: string }).id, summary: sim.summary };
}
