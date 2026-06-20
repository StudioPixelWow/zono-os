/**
 * Revenue Intelligence service — server-only. Aggregates existing engines
 * (deal_forecasts, deals, team intelligence, opportunity leaks, locality/
 * property performance, acquisition, management actions) into an org revenue
 * profile, targets, leakage ledger and revenue opportunities. Deterministic.
 * Does not modify any existing module. Org-scoped.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import { buildRevenueAi, gapLevel, growthRate, revenueGapScore, simulateGrowth, type GrowthScenario } from "./engine";
import { latestResearchForProperties } from "@/lib/transactions/service";

type DB = Database["public"]["Tables"];
const DAY = 86_400_000;

async function requireOrg(): Promise<string> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile.org_id;
}

const dealRevenue = (d: { commission_amount: number | null; value: number | null }) =>
  d.commission_amount ?? Math.round((d.value ?? 0) * 0.02);

const LEAK_SOURCE: Record<string, string> = {
  lead_never_contacted: "uncontacted_lead", match_stalled: "stalled_match",
  property_no_activity: "inactive_property", seller_no_touchpoint: "inactive_seller",
  deal_at_risk: "at_risk_deal", forecast_stalled: "at_risk_deal",
};

export interface RevenueRecomputeSummary { gap: number; gapLevel: string; atRisk: number }

export async function recomputeRevenueIntelligence(): Promise<RevenueRecomputeSummary> {
  const orgId = await requireOrg();
  const supabase = await createClient();
  const now = new Date();
  const nowMs = now.getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
  const in30 = new Date(nowMs + 30 * DAY).toISOString().slice(0, 10);
  const in60 = new Date(nowMs + 60 * DAY).toISOString().slice(0, 10);
  const in90 = new Date(nowMs + 90 * DAY).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);
  const since30 = new Date(nowMs - 30 * DAY).toISOString();

  const [dealsRes, forecastsRes, leaksRes, commitsRes, targetRes] = await Promise.all([
    supabase.from("deals").select("status,value,commission_amount,closed_at").eq("status", "won").not("closed_at", "is", null),
    supabase.from("deal_forecasts").select("probability_weighted_revenue,closing_probability,deal_risk_score,confidence_score,expected_close_date,status,assigned_agent_id").eq("status", "active"),
    supabase.from("team_opportunity_leaks").select("id,leak_type,entity_type,entity_id,owner_user_id,title,reason,lost_revenue_impact,severity").eq("status", "open"),
    supabase.from("communication_commitments").select("commitment_text,entity_type,entity_id,status").eq("status", "broken").limit(200),
    supabase.from("revenue_targets").select("*").eq("scope_type", "organization").eq("period_type", "monthly").gte("period_start", monthStart.slice(0, 10)).maybeSingle(),
  ]);

  const wonDeals = dealsRes.data ?? [];
  const currentMonth = wonDeals.filter((d) => d.closed_at! >= monthStart).reduce((s, d) => s + dealRevenue(d), 0);
  const priorMonth = wonDeals.filter((d) => d.closed_at! >= priorMonthStart && d.closed_at! < monthStart).reduce((s, d) => s + dealRevenue(d), 0);
  const currentQuarter = wonDeals.filter((d) => d.closed_at! >= quarterStart).reduce((s, d) => s + dealRevenue(d), 0);
  const currentYear = wonDeals.filter((d) => d.closed_at! >= yearStart).reduce((s, d) => s + dealRevenue(d), 0);
  const recovered = wonDeals.filter((d) => d.closed_at! >= since30).reduce((s, d) => s + dealRevenue(d), 0);

  const forecasts = forecastsRes.data ?? [];
  const f30 = forecasts.filter((f) => f.expected_close_date && f.expected_close_date >= todayStr && f.expected_close_date <= in30).reduce((s, f) => s + f.probability_weighted_revenue, 0);
  const f60 = forecasts.filter((f) => f.expected_close_date && f.expected_close_date >= todayStr && f.expected_close_date <= in60).reduce((s, f) => s + f.probability_weighted_revenue, 0);
  const f90 = forecasts.filter((f) => f.expected_close_date && f.expected_close_date >= todayStr && f.expected_close_date <= in90).reduce((s, f) => s + f.probability_weighted_revenue, 0);
  const pwr = forecasts.reduce((s, f) => s + f.probability_weighted_revenue, 0);
  const atRisk = forecasts.filter((f) => f.deal_risk_score >= 55).reduce((s, f) => s + f.probability_weighted_revenue, 0);
  const forecastConfidence = forecasts.length ? Math.round(forecasts.reduce((s, f) => s + f.confidence_score, 0) / forecasts.length) : 0;

  const leaks = leaksRes.data ?? [];
  const lost = leaks.reduce((s, l) => s + (l.lost_revenue_impact ?? 0), 0);

  const target = targetRes.data?.target_amount ?? 0;
  const projected = currentMonth + f30;
  const gapScore = revenueGapScore(target, projected);
  const level = gapLevel(gapScore);
  const gap = Math.max(0, target - projected);
  const growth = growthRate(currentMonth, priorMonth);

  const profile = {
    organization_id: orgId,
    current_month_revenue: currentMonth, current_quarter_revenue: currentQuarter, current_year_revenue: currentYear,
    forecast_revenue_30: f30, forecast_revenue_60: f60, forecast_revenue_90: f90,
    probability_weighted_revenue: pwr, revenue_at_risk: atRisk, lost_revenue: lost, recovered_revenue: recovered,
    revenue_gap: gap, growth_rate: growth, forecast_confidence: forecastConfidence,
    revenue_gap_score: gapScore, gap_level: level,
    ai_revenue_summary: buildRevenueAi({ gap_level: level, revenue_gap: gap, forecast_revenue_90: f90, revenue_at_risk: atRisk }),
    last_calculated_at: new Date().toISOString(),
  };
  await supabase.from("organization_revenue_profiles").upsert(profile as never, { onConflict: "organization_id" });

  // Keep the org monthly target's actual/forecast in sync (if a target exists).
  if (targetRes.data) {
    await supabase.from("revenue_targets").update({ actual_amount: currentMonth, forecast_amount: f30 } as never).eq("id", targetRes.data.id);
  }

  // Regenerate the revenue leakage ledger from existing leaks + broken commitments.
  const leakRows: DB["revenue_leakage_events"]["Insert"][] = leaks.map((l) => ({
    organization_id: orgId, source: LEAK_SOURCE[l.leak_type] ?? "at_risk_deal", entity_type: l.entity_type, entity_id: l.entity_id,
    owner_user_id: l.owner_user_id, title: l.title, reason: l.reason, lost_revenue: l.lost_revenue_impact ?? 0,
    recoverable: l.leak_type !== "deal_at_risk", severity: l.severity, status: "open",
  }));
  for (const c of (commitsRes.data ?? [])) {
    leakRows.push({ organization_id: orgId, source: "broken_commitment", entity_type: c.entity_type, entity_id: c.entity_id, owner_user_id: null,
      title: "התחייבות שנשברה", reason: c.commitment_text, lost_revenue: 5000, recoverable: true, severity: "medium", status: "open" });
  }
  // Consume Transactions Intelligence: managed listings priced materially above
  // sold-price market value are stale-inventory revenue leakage (slow sale → lost
  // commission velocity). Deterministic, from real transactions; high confidence only.
  try {
    const { data: managed } = await supabase.from("properties").select("id,price,status,city")
      .eq("org_id", orgId).in("status", ["published", "active", "ready", "under_offer"]).limit(300);
    const ids = (managed ?? []).map((p) => p.id);
    if (ids.length) {
      const research = await latestResearchForProperties(orgId, ids);
      for (const p of managed ?? []) {
        const rr = research.get(p.id);
        const comps = Array.isArray(rr?.comparable_transactions) ? (rr!.comparable_transactions as unknown[]).length : 0;
        if (rr && rr.gap_from_market_percent != null && rr.gap_from_market_percent >= 18 && (rr.confidence_score ?? 0) >= 50 && comps > 0) {
          const lost = Math.round((p.price ?? 0) * 0.02 * 0.15); // ~15% commission velocity at risk
          leakRows.push({ organization_id: orgId, source: "overpriced_inventory", entity_type: "property", entity_id: p.id, owner_user_id: null,
            title: `נכס מעל שווי עסקאות${p.city ? ` · ${p.city}` : ""}`, reason: `מחיר ~${Math.round(rr.gap_from_market_percent)}% מעל שווי עסקאות אמת (${comps} עסקאות) — סיכון לקיפאון מלאי ואובדן קצב עמלות`,
            lost_revenue: lost, recoverable: true, severity: rr.gap_from_market_percent >= 28 ? "high" : "medium", status: "open" });
        }
      }
    }
  } catch { /* additive — never block the leakage ledger */ }
  await supabase.from("revenue_leakage_events").delete().eq("organization_id", orgId);
  for (let i = 0; i < leakRows.length; i += 500) { const c = leakRows.slice(i, i + 500); if (c.length) await supabase.from("revenue_leakage_events").insert(c as never); }

  return { gap, gapLevel: level, atRisk };
}

// ── Target management ────────────────────────────────────────────────────────
export async function setRevenueTarget(input: { scopeType: string; scopeId: string | null; scopeLabel: string | null; periodType: string; amount: number }): Promise<void> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const now = new Date();
  const periodStart = input.periodType === "yearly" ? new Date(now.getFullYear(), 0, 1)
    : input.periodType === "quarterly" ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const supabase = await createClient();
  await supabase.from("revenue_targets").upsert({
    organization_id: profile.org_id, scope_type: input.scopeType, scope_id: input.scopeId, scope_label: input.scopeLabel,
    period_type: input.periodType, period_start: periodStart.toISOString().slice(0, 10), target_amount: Math.max(0, Math.round(input.amount)),
    created_by: user.id,
  } as never, { onConflict: "organization_id,scope_type,scope_id,period_type,period_start" });
}

// ── Read model ───────────────────────────────────────────────────────────────
export interface RevenueBoard {
  profile: DB["organization_revenue_profiles"]["Row"] | null;
  targets: DB["revenue_targets"]["Row"][];
  leakage: (DB["revenue_leakage_events"]["Row"] & { ownerName: string | null })[];
  opportunities: { id: string; title: string; reason: string; revenueImpact: number; confidence: number; urgency: number; href: string }[];
  agents: { userId: string; name: string; revenue: number; forecast: number; atRisk: number; efficiency: number }[];
  localities: { locality: string; revenue: number; forecast: number; deals: number }[];
  propertyTypes: { type: string; revenue: number; deals: number; conversion: number }[];
  growth: GrowthScenario[];
}

export async function getRevenueBoard(): Promise<RevenueBoard> {
  const supabase = await createClient();
  const [profRes, targetsRes, leakRes, actRes, teamRes, locRes, ptRes, fcRes, propsRes, buyersRes] = await Promise.all([
    supabase.from("organization_revenue_profiles").select("*").maybeSingle(),
    supabase.from("revenue_targets").select("*").order("period_start", { ascending: false }).limit(50),
    supabase.from("revenue_leakage_events").select("*").eq("status", "open").order("lost_revenue", { ascending: false }).limit(40),
    supabase.from("management_actions").select("*").eq("status", "open").gt("expected_revenue_impact", 0).order("expected_revenue_impact", { ascending: false }).limit(15),
    supabase.from("team_intelligence_profiles").select("user_id,total_revenue,forecast_revenue,active_leads,active_buyers,active_sellers,active_properties").order("total_revenue", { ascending: false }).limit(100),
    supabase.from("agent_locality_performance").select("locality,revenue,deals_count").limit(2000),
    supabase.from("agent_property_type_performance").select("property_type,revenue,deals_count,conversion_rate").limit(2000),
    supabase.from("deal_forecasts").select("assigned_agent_id,locality,probability_weighted_revenue,deal_risk_score,status").eq("status", "active").limit(3000),
    supabase.from("properties").select("id", { count: "exact", head: true }).in("status", ["active", "published", "ready", "under_offer", "in_contract"]),
    supabase.from("buyers").select("id", { count: "exact", head: true }),
  ]);

  const team = teamRes.data ?? [];
  const forecasts = fcRes.data ?? [];
  const ids = team.map((t) => t.user_id);
  const names = new Map<string, string>();
  if (ids.length) { const { data } = await supabase.from("users").select("id,full_name").in("id", ids); for (const u of data ?? []) names.set(u.id, u.full_name); }

  const atRiskByAgent = new Map<string, number>();
  const fcByLocality = new Map<string, number>();
  for (const f of forecasts) {
    if (f.assigned_agent_id && f.deal_risk_score >= 55) atRiskByAgent.set(f.assigned_agent_id, (atRiskByAgent.get(f.assigned_agent_id) ?? 0) + f.probability_weighted_revenue);
    if (f.locality) fcByLocality.set(f.locality, (fcByLocality.get(f.locality) ?? 0) + f.probability_weighted_revenue);
  }

  const agents = team.map((t) => {
    const load = t.active_leads + t.active_buyers + t.active_sellers + t.active_properties;
    return { userId: t.user_id, name: names.get(t.user_id) ?? "סוכן", revenue: t.total_revenue, forecast: t.forecast_revenue, atRisk: atRiskByAgent.get(t.user_id) ?? 0, efficiency: load > 0 ? Math.round((t.total_revenue + t.forecast_revenue * 0.4) / load) : 0 };
  }).sort((a, b) => (b.revenue + b.forecast) - (a.revenue + a.forecast));

  const locAgg = new Map<string, { revenue: number; deals: number }>();
  for (const l of locRes.data ?? []) { const k = l.locality; const cur = locAgg.get(k) ?? { revenue: 0, deals: 0 }; cur.revenue += l.revenue; cur.deals += l.deals_count; locAgg.set(k, cur); }
  const localities = [...locAgg.entries()].map(([locality, v]) => ({ locality, revenue: v.revenue, forecast: fcByLocality.get(locality) ?? 0, deals: v.deals })).sort((a, b) => (b.revenue + b.forecast) - (a.revenue + a.forecast)).slice(0, 12);

  const ptAgg = new Map<string, { revenue: number; deals: number; convSum: number; n: number }>();
  for (const p of ptRes.data ?? []) { const k = p.property_type; const cur = ptAgg.get(k) ?? { revenue: 0, deals: 0, convSum: 0, n: 0 }; cur.revenue += p.revenue; cur.deals += p.deals_count; cur.convSum += p.conversion_rate; cur.n++; ptAgg.set(k, cur); }
  const propertyTypes = [...ptAgg.entries()].map(([type, v]) => ({ type, revenue: v.revenue, deals: v.deals, conversion: v.n ? Math.round(v.convSum / v.n) : 0 })).sort((a, b) => b.revenue - a.revenue).slice(0, 12);

  const opportunities = (actRes.data ?? []).map((a) => ({ id: a.id, title: a.title, reason: a.reason ?? "", revenueImpact: a.expected_revenue_impact, confidence: a.impact_score, urgency: a.urgency_score, href: a.href ?? "/team" }));

  const profile = profRes.data ?? null;
  const monthly = profile?.current_month_revenue ?? 0;
  const growth = simulateGrowth({
    monthlyRevenue: monthly, forecastRevenue90: profile?.forecast_revenue_90 ?? 0,
    activeProperties: propsRes.count ?? 0, activeBuyers: buyersRes.count ?? 0,
    agents: team.length, localities: locAgg.size,
    avgCommissionPerDeal: 35000, avgDealsPerAgentMonth: 1.2,
  });

  return {
    profile, targets: targetsRes.data ?? [],
    leakage: (leakRes.data ?? []).map((l) => ({ ...l, ownerName: l.owner_user_id ? names.get(l.owner_user_id) ?? null : null })),
    opportunities, agents: agents.slice(0, 12), localities, propertyTypes, growth,
  };
}
