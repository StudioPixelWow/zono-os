/**
 * Deal Forecast service — server-only. Predicts revenue across all intelligence
 * layers and builds daily pipeline snapshots. Org-scoped. No AI, no auto-send.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import { buildForecastAi, computeForecast, deriveForecastAction, type ForecastInput } from "./engine";

type DB = Database["public"]["Tables"];
export type DealForecastRow = DB["deal_forecasts"]["Row"];
export type PipelineSnapshotRow = DB["pipeline_snapshots"]["Row"];
const cityNorm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");

async function requireProfile() {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile;
}

export interface ForecastRecomputeSummary { forecasts: number; likely: number; atRisk: number }

export async function generateForecastsForOrg(): Promise<ForecastRecomputeSummary> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const orgId = profile.org_id;

  const [matchRes, biRes, siRes, piRes, propsRes, commRes, mktRes, twinRes, accelRes] = await Promise.all([
    supabase.from("match_intelligence_profiles").select("id,buyer_id,property_id,closing_probability,compatibility_score,risk_score,momentum_score,urgency_score,match_stage,match_status,estimated_deal_value,estimated_commission").eq("match_status", "active").not("match_stage", "in", "(closed,lost)").limit(1000),
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_readiness_score,buyer_financing_score,buyer_engagement_score,buyer_conversion_probability"),
    supabase.from("seller_intelligence_profiles").select("seller_id,seller_trust_score,seller_churn_risk_score"),
    supabase.from("property_intelligence_profiles").select("property_id,health_score,momentum_score,exposure_score"),
    supabase.from("properties").select("id,city,type,seller_id,assigned_agent_id,price"),
    supabase.from("communication_intelligence_profiles").select("entity_type,entity_id,followup_risk_score,days_since_contact,open_commitments_count,sentiment_score"),
    supabase.from("market_area_snapshots").select("locality_name,date,demand_score").order("date", { ascending: false }).limit(500),
    supabase.from("agent_intelligence_profiles").select("user_id,conversion_score,workload_score,avg_days_to_close"),
    supabase.from("graph_signals").select("signal_type,source_entities").eq("signal_type", "deal_acceleration").limit(500),
  ]);

  const matches = matchRes.data ?? [];
  if (!matches.length) return { forecasts: 0, likely: 0, atRisk: 0 };

  const bi = new Map((biRes.data ?? []).map((b) => [b.buyer_id, b]));
  const si = new Map((siRes.data ?? []).map((s) => [s.seller_id, s]));
  const pi = new Map((piRes.data ?? []).map((p) => [p.property_id, p]));
  const propMap = new Map((propsRes.data ?? []).map((p) => [p.id, p]));
  const twin = new Map((twinRes.data ?? []).map((t) => [t.user_id, t]));
  const commByEntity = new Map((commRes.data ?? []).map((c) => [`${c.entity_type}:${c.entity_id}`, c]));
  const mktByCity = new Map<string, number>();
  for (const m of mktRes.data ?? []) { const k = cityNorm(m.locality_name); if (!mktByCity.has(k)) mktByCity.set(k, m.demand_score); }
  const accelBuyers = new Set<string>();
  for (const s of accelRes.data ?? []) for (const id of (Array.isArray(s.source_entities) ? s.source_entities : []) as string[]) accelBuyers.add(id);

  const rows: DB["deal_forecasts"]["Insert"][] = [];
  const signalRows: DB["deal_forecast_signals"]["Insert"][] = [];
  const summary: ForecastRecomputeSummary = { forecasts: 0, likely: 0, atRisk: 0 };

  for (const m of matches) {
    const prop = propMap.get(m.property_id);
    const b = bi.get(m.buyer_id);
    const s = prop?.seller_id ? si.get(prop.seller_id) : undefined;
    const p = pi.get(m.property_id);
    const comm = commByEntity.get(`buyer:${m.buyer_id}`);
    const agent = prop?.assigned_agent_id ? twin.get(prop.assigned_agent_id) : undefined;

    const input: ForecastInput = {
      matchClosingProbability: m.closing_probability, matchStage: m.match_stage, compatibility: m.compatibility_score,
      matchRisk: m.risk_score, matchMomentum: m.momentum_score, matchUrgency: m.urgency_score,
      estimatedValue: m.estimated_deal_value ?? prop?.price ?? null, estimatedCommission: m.estimated_commission ?? null,
      buyerReadiness: b?.buyer_readiness_score ?? 50, buyerFinancing: b?.buyer_financing_score ?? 50,
      buyerEngagement: b?.buyer_engagement_score ?? 50, buyerConversion: b?.buyer_conversion_probability ?? 50,
      sellerTrust: s?.seller_trust_score ?? 55, sellerChurnRisk: s?.seller_churn_risk_score ?? 30,
      propertyHealth: p?.health_score ?? 55, propertyMomentum: p?.momentum_score ?? 50, propertyExposure: p?.exposure_score ?? 50,
      daysSinceContact: comm?.days_since_contact ?? null, followupRisk: comm?.followup_risk_score ?? 30,
      openCommitments: comm?.open_commitments_count ?? 0, negativeSentiment: (comm?.sentiment_score ?? 55) < 40,
      relationshipStrength: m.compatibility_score, dealAcceleration: accelBuyers.has(m.buyer_id),
      marketDemand: prop?.city ? mktByCity.get(cityNorm(prop.city)) ?? 50 : 50,
      agentConversion: agent?.conversion_score ?? 50, agentWorkloadCapacity: agent?.workload_score ?? 60,
      agentAvgDaysToClose: agent?.avg_days_to_close ?? null,
    };
    const f = computeForecast(input);
    const action = deriveForecastAction(input, f);
    const ai = buildForecastAi("עסקה", f, action);
    const commission = m.estimated_commission ?? (input.estimatedValue ? Math.round(input.estimatedValue * 0.02) : 0);

    rows.push({
      organization_id: orgId, match_id: m.id, buyer_id: m.buyer_id, seller_id: prop?.seller_id ?? null,
      property_id: m.property_id, assigned_agent_id: prop?.assigned_agent_id ?? null,
      locality: prop?.city ?? null, property_type: prop?.type ?? null, forecast_stage: m.match_stage,
      closing_probability: f.closing_probability, expected_close_date: f.expected_close_date,
      expected_days_to_close: f.expected_days_to_close, estimated_deal_value: input.estimatedValue,
      estimated_commission: commission, probability_weighted_revenue: f.probability_weighted_revenue,
      deal_health_score: f.deal_health_score, deal_risk_score: f.deal_risk_score, urgency_score: f.urgency_score,
      momentum_score: f.momentum_score, confidence_score: f.confidence_score,
      primary_blocker: action.blocker, next_best_action: action.nextAction, forecast_reason: ai.reason,
      ai_summary: ai.ai_summary, ai_risk_summary: ai.ai_risk_summary, ai_recommendation_summary: ai.ai_recommendation_summary,
      status: "active", metadata: { probabilityLift: action.probabilityLift } as never, last_calculated_at: new Date().toISOString(),
    });
    if (f.closing_probability >= 70) summary.likely++;
    if (f.deal_risk_score >= 60) summary.atRisk++;
  }

  await supabase.from("deal_forecasts").delete().eq("organization_id", orgId).eq("status", "active");
  for (let i = 0; i < rows.length; i += 500) await supabase.from("deal_forecasts").insert(rows.slice(i, i + 500) as never);
  summary.forecasts = rows.length;

  // Per-forecast signals — re-read to get ids.
  const { data: saved } = await supabase.from("deal_forecasts").select("id,closing_probability,deal_risk_score,probability_weighted_revenue,estimated_commission,locality,next_best_action,primary_blocker").eq("organization_id", orgId).eq("status", "active");
  await supabase.from("deal_forecast_signals").delete().eq("organization_id", orgId).eq("status", "new");
  for (const fc of saved ?? []) {
    if (fc.closing_probability >= 70) signalRows.push({ organization_id: orgId, forecast_id: fc.id, signal_type: "deal_likely_to_close", title: `עסקה צפויה להיסגר${fc.locality ? ` · ${fc.locality}` : ""}`, description: `סיכוי ${fc.closing_probability}% · הכנסה צפויה`, impact_score: 80, confidence_score: 75 });
    if (fc.deal_risk_score >= 65) signalRows.push({ organization_id: orgId, forecast_id: fc.id, signal_type: fc.deal_risk_score >= 75 ? "intervention_needed" : "deal_at_risk", title: `עסקה בסיכון${fc.locality ? ` · ${fc.locality}` : ""}`, description: fc.primary_blocker ? `חסם: ${fc.primary_blocker}` : `סיכון ${fc.deal_risk_score}`, impact_score: 75, confidence_score: 72, metadata: { action: fc.next_best_action } as never });
  }
  if (signalRows.length) await supabase.from("deal_forecast_signals").insert(signalRows as never);

  return summary;
}

// ── Pipeline snapshot ────────────────────────────────────────────────────────
export async function generatePipelineSnapshot(): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const orgId = profile.org_id;
  const now = Date.now();
  const { data: forecasts } = await supabase.from("deal_forecasts").select("closing_probability,probability_weighted_revenue,estimated_commission,estimated_deal_value,deal_risk_score,expected_days_to_close,assigned_agent_id,locality,property_type").eq("organization_id", orgId).eq("status", "active");
  const fc = forecasts ?? [];
  const { data: users } = await supabase.from("users").select("id,full_name");
  const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));

  const sumBy = (key: (r: typeof fc[number]) => string | null) => {
    const m = new Map<string, { pwr: number; commission: number; count: number }>();
    for (const r of fc) { const k = key(r); if (!k) continue; const cur = m.get(k) ?? { pwr: 0, commission: 0, count: 0 }; cur.pwr += r.probability_weighted_revenue; cur.commission += r.estimated_commission ?? 0; cur.count++; m.set(k, cur); }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.pwr - a.pwr);
  };
  const byAgent = sumBy((r) => r.assigned_agent_id).map((a) => ({ ...a, name: userName.get(a.key) ?? "סוכן" }));
  const byLocality = sumBy((r) => r.locality);
  const byType = sumBy((r) => r.property_type);

  await supabase.from("pipeline_snapshots").upsert({
    organization_id: orgId, date: new Date().toISOString().slice(0, 10),
    total_pipeline_value: fc.reduce((s, r) => s + (r.estimated_deal_value ?? 0), 0),
    probability_weighted_revenue: fc.reduce((s, r) => s + r.probability_weighted_revenue, 0),
    expected_commission: fc.reduce((s, r) => s + (r.estimated_commission ?? 0), 0),
    active_forecasts_count: fc.length,
    high_probability_count: fc.filter((r) => r.closing_probability >= 70).length,
    at_risk_count: fc.filter((r) => r.deal_risk_score >= 60).length,
    expected_closes_7d: fc.filter((r) => (r.expected_days_to_close ?? 999) <= 7).length,
    expected_closes_30d: fc.filter((r) => (r.expected_days_to_close ?? 999) <= 30).length,
    by_agent: byAgent as never, by_locality: byLocality as never, by_property_type: byType as never,
  } as never, { onConflict: "organization_id,date" });

  // Pipeline-level signals.
  await supabase.from("deal_forecast_signals").delete().eq("organization_id", orgId).in("signal_type", ["agent_pipeline_strong", "agent_pipeline_weak", "locality_pipeline_hot", "revenue_gap"]).eq("status", "new");
  const sigs: DB["deal_forecast_signals"]["Insert"][] = [];
  if (byAgent[0] && byAgent[0].pwr > 0) sigs.push({ organization_id: orgId, signal_type: "agent_pipeline_strong", title: `${byAgent[0].name} — צנרת חזקה`, description: `הכנסה משוקללת מובילה`, impact_score: 65, confidence_score: 70 });
  if (byLocality[0] && byLocality[0].pwr > 0) sigs.push({ organization_id: orgId, signal_type: "locality_pipeline_hot", title: `${byLocality[0].key} — אזור מוביל בצנרת`, description: `ריכוז הכנסה צפויה`, impact_score: 60, confidence_score: 68 });
  const totalPwr = fc.reduce((s, r) => s + r.probability_weighted_revenue, 0);
  const totalVal = fc.reduce((s, r) => s + (r.estimated_deal_value ?? 0), 0);
  void now; void totalVal;
  if (totalPwr > 0) sigs.push({ organization_id: orgId, signal_type: "revenue_gap", title: "פער מימוש הכנסה", description: `הכנסה משוקללת מתוך צנרת מלאה — נצל פעולות התערבות לסגירת הפער`, impact_score: 62, confidence_score: 65 });
  if (sigs.length) await supabase.from("deal_forecast_signals").insert(sigs as never);
}

// ── Read models ──────────────────────────────────────────────────────────────
export interface ForecastBoard {
  snapshot: PipelineSnapshotRow | null;
  confidence: number;
  likely: DealForecastRow[];
  atRisk: DealForecastRow[];
  intervention: DealForecastRow[];
  signals: DB["deal_forecast_signals"]["Row"][];
}

export async function getForecastBoard(): Promise<ForecastBoard> {
  const supabase = await createClient();
  const [snapRes, fcRes, sigRes] = await Promise.all([
    supabase.from("pipeline_snapshots").select("*").order("date", { ascending: false }).limit(1),
    supabase.from("deal_forecasts").select("*").eq("status", "active").order("closing_probability", { ascending: false }).limit(300),
    supabase.from("deal_forecast_signals").select("*").eq("status", "new").order("impact_score", { ascending: false }).limit(60),
  ]);
  const fc = fcRes.data ?? [];
  const confidence = fc.length ? Math.round(fc.reduce((s, r) => s + r.confidence_score, 0) / fc.length) : 0;
  return {
    snapshot: snapRes.data?.[0] ?? null, confidence,
    likely: fc.filter((r) => r.closing_probability >= 70).slice(0, 20),
    atRisk: [...fc].filter((r) => r.deal_risk_score >= 60).sort((a, b) => b.deal_risk_score - a.deal_risk_score).slice(0, 20),
    intervention: [...fc].filter((r) => r.deal_risk_score >= 65 && r.probability_weighted_revenue > 0).sort((a, b) => b.probability_weighted_revenue - a.probability_weighted_revenue).slice(0, 12),
    signals: sigRes.data ?? [],
  };
}

export async function getMatchForecast(matchId: string): Promise<DealForecastRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("deal_forecasts").select("*").eq("match_id", matchId).maybeSingle();
  return data ?? null;
}

export interface ForecastKpis { pwr: number; commission: number; closes30: number; atRiskRevenue: number; confidence: number }
export async function getForecastKpis(): Promise<ForecastKpis> {
  const supabase = await createClient();
  const { data: fc } = await supabase.from("deal_forecasts").select("probability_weighted_revenue,estimated_commission,expected_days_to_close,deal_risk_score,confidence_score,closing_probability").eq("status", "active");
  const rows = fc ?? [];
  return {
    pwr: rows.reduce((s, r) => s + r.probability_weighted_revenue, 0),
    commission: rows.reduce((s, r) => s + (r.estimated_commission ?? 0), 0),
    closes30: rows.filter((r) => (r.expected_days_to_close ?? 999) <= 30 && r.closing_probability >= 60).length,
    atRiskRevenue: rows.filter((r) => r.deal_risk_score >= 60).reduce((s, r) => s + r.probability_weighted_revenue, 0),
    confidence: rows.length ? Math.round(rows.reduce((s, r) => s + r.confidence_score, 0) / rows.length) : 0,
  };
}
