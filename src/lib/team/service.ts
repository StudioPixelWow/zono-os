/**
 * Team Intelligence service — server-only. Builds per-agent performance
 * profiles, coaching signals, a daily office snapshot and territory coverage
 * from real office activity + forecast + communication intelligence. Org-scoped.
 * Deterministic. No AI calls, no auto-contact, no auto-assign.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import {
  assessTerritoryCoverage, buildTeamAi, calculateOfficeHealth, classifyTier, classifyTrend,
  computeTeamScores, deriveStrengthsWeaknesses, detectCoachingSignals,
  type AgentMetrics, type LocalityCoverage,
} from "./engine";

type DB = Database["public"]["Tables"];
const DAY = 86_400_000;
const cityNorm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");
const ACTIVE_LEAD_STAGES = new Set(["new", "contacted", "qualified", "nurturing"]);
const ACTIVE_FORECAST = new Set(["active", "in_progress"]);

async function requireProfile() {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile;
}

interface Agg {
  activeLeads: number; totalLeads: number; won: number; lost: number; revenue: number;
  daysSum: number; daysN: number; recent90: number; prev90: number;
  activeProperties: number; activeBuyers: number; activeSellers: number; activeTasks: number;
  forecastRevenue: number; likely: number; atRisk: number;
  commHealthSum: number; commHealthN: number; missedFollowups: number; openCommitments: number;
  localities: Map<string, number>; propTypes: Map<string, number>;
}
const blank = (): Agg => ({
  activeLeads: 0, totalLeads: 0, won: 0, lost: 0, revenue: 0, daysSum: 0, daysN: 0, recent90: 0, prev90: 0,
  activeProperties: 0, activeBuyers: 0, activeSellers: 0, activeTasks: 0,
  forecastRevenue: 0, likely: 0, atRisk: 0, commHealthSum: 0, commHealthN: 0, missedFollowups: 0, openCommitments: 0,
  localities: new Map(), propTypes: new Map(),
});

export interface TeamRecomputeSummary { agents: number; coachingSignals: number; officeHealth: number }

// ── Recompute ────────────────────────────────────────────────────────────────
export async function recomputeTeamIntelligence(): Promise<TeamRecomputeSummary> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const orgId = profile.org_id;
  const now = Date.now();
  const since90 = new Date(now - 90 * DAY).toISOString();
  const since180 = new Date(now - 180 * DAY).toISOString();

  const [usersRes, leadsRes, dealsRes, propsRes, buyersRes, sellersRes, tasksRes, forecastRes, commRes, marketRes] = await Promise.all([
    supabase.from("users").select("id,full_name"),
    supabase.from("leads").select("owner_id,stage,property_id"),
    supabase.from("deals").select("owner_id,status,value,commission_amount,property_id,closed_at,created_at"),
    supabase.from("properties").select("id,city,type,assigned_agent_id"),
    supabase.from("buyers").select("id,owner_id"),
    supabase.from("sellers").select("id,owner_id"),
    supabase.from("tasks").select("assignee_id,status"),
    supabase.from("deal_forecasts").select("assigned_agent_id,probability_weighted_revenue,closing_probability,deal_risk_score,status"),
    supabase.from("communication_intelligence_profiles").select("entity_type,entity_id,communication_health_score,missed_followups_count,open_commitments_count"),
    supabase.from("market_area_snapshots").select("locality_name,demand_score,date").order("date", { ascending: false }).limit(400),
  ]);

  const users = usersRes.data ?? [];
  if (!users.length) return { agents: 0, coachingSignals: 0, officeHealth: 0 };

  const propMap = new Map((propsRes.data ?? []).map((p) => [p.id, { city: p.city, type: p.type, agent: p.assigned_agent_id }]));
  const buyerOwner = new Map((buyersRes.data ?? []).map((b) => [b.id, b.owner_id]));
  const sellerOwner = new Map((sellersRes.data ?? []).map((s) => [s.id, s.owner_id]));

  const agg = new Map<string, Agg>();
  for (const u of users) agg.set(u.id, blank());

  for (const l of leadsRes.data ?? []) {
    if (!l.owner_id) continue; const a = agg.get(l.owner_id); if (!a) continue;
    a.totalLeads++;
    if (ACTIVE_LEAD_STAGES.has(l.stage)) a.activeLeads++;
    const p = l.property_id ? propMap.get(l.property_id) : null;
    if (p?.city) { const c = cityNorm(p.city); a.localities.set(c, (a.localities.get(c) ?? 0) + 0); }
  }
  for (const d of dealsRes.data ?? []) {
    if (!d.owner_id) continue; const a = agg.get(d.owner_id); if (!a) continue;
    const rev = d.commission_amount ?? Math.round((d.value ?? 0) * 0.02);
    const p = d.property_id ? propMap.get(d.property_id) : null;
    if (d.status === "won") {
      a.won++; a.revenue += rev;
      if (d.closed_at && d.created_at) { const days = Math.max(0, Math.floor((new Date(d.closed_at).getTime() - new Date(d.created_at).getTime()) / DAY)); a.daysSum += days; a.daysN++; }
      if (d.closed_at && d.closed_at >= since90) a.recent90++;
      else if (d.closed_at && d.closed_at >= since180 && d.closed_at < since90) a.prev90++;
      if (p?.city) { const c = cityNorm(p.city); a.localities.set(c, (a.localities.get(c) ?? 0) + 1); }
      if (p?.type) a.propTypes.set(p.type, (a.propTypes.get(p.type) ?? 0) + 1);
    } else if (d.status === "lost") a.lost++;
  }
  for (const p of propsRes.data ?? []) { if (p.assigned_agent_id) { const a = agg.get(p.assigned_agent_id); if (a) a.activeProperties++; } }
  for (const b of buyersRes.data ?? []) { if (b.owner_id) { const a = agg.get(b.owner_id); if (a) a.activeBuyers++; } }
  for (const s of sellersRes.data ?? []) { if (s.owner_id) { const a = agg.get(s.owner_id); if (a) a.activeSellers++; } }
  for (const t of tasksRes.data ?? []) { if (t.assignee_id && t.status !== "done") { const a = agg.get(t.assignee_id); if (a) a.activeTasks++; } }
  for (const f of forecastRes.data ?? []) {
    if (!f.assigned_agent_id) continue; const a = agg.get(f.assigned_agent_id); if (!a) continue;
    if (!ACTIVE_FORECAST.has(f.status) && f.status !== "active") continue;
    a.forecastRevenue += f.probability_weighted_revenue ?? 0;
    if (f.closing_probability >= 65) a.likely++;
    if (f.deal_risk_score >= 55) a.atRisk++;
  }
  // Communication health attributed via the related entity's owner.
  for (const c of commRes.data ?? []) {
    const owner = c.entity_type === "buyer" ? buyerOwner.get(c.entity_id)
      : c.entity_type === "seller" ? sellerOwner.get(c.entity_id)
      : c.entity_type === "property" ? propMap.get(c.entity_id)?.agent ?? null : null;
    if (!owner) continue; const a = agg.get(owner); if (!a) continue;
    a.commHealthSum += c.communication_health_score; a.commHealthN++;
    a.missedFollowups += c.missed_followups_count ?? 0;
    a.openCommitments += c.open_commitments_count ?? 0;
  }

  // Office reference points for relative scoring.
  const loads = users.map((u) => { const a = agg.get(u.id)!; return a.activeLeads + a.activeBuyers + a.activeSellers + a.activeProperties; });
  const avgActiveLoad = loads.length ? loads.reduce((s, n) => s + n, 0) / loads.length : 0;
  const maxRevenue = Math.max(0, ...users.map((u) => agg.get(u.id)!.revenue));
  const maxForecastRevenue = Math.max(0, ...users.map((u) => agg.get(u.id)!.forecastRevenue));

  // Build per-agent profiles + coaching signals.
  const profileRows: DB["team_intelligence_profiles"]["Insert"][] = [];
  const signalRows: DB["agent_coaching_signals"]["Insert"][] = [];
  const rankings: { userId: string; name: string; performance: number; revenue: number; forecast: number; tier: string }[] = [];
  const workloadDist: { userId: string; name: string; load: number; workload: number }[] = [];
  // locality → agents (for territory coverage).
  const localityAgents = new Map<string, { name: string; deals: number }[]>();

  for (const u of users) {
    const a = agg.get(u.id)!;
    const activeMatches = 0; // matches are buyer↔property, not per-agent owned in this schema
    const m: AgentMetrics = {
      userId: u.id, name: u.full_name,
      activeLeads: a.activeLeads, activeBuyers: a.activeBuyers, activeSellers: a.activeSellers,
      activeProperties: a.activeProperties, activeMatches, activeTasks: a.activeTasks,
      wonDeals: a.won, lostDeals: a.lost, totalLeadsHandled: a.totalLeads, totalRevenue: a.revenue,
      avgDaysToClose: a.daysN ? Math.round(a.daysSum / a.daysN) : null, avgResponseMinutes: null,
      recentDeals90d: a.recent90, recentDealsPrev90d: a.prev90,
      forecastRevenue: a.forecastRevenue, likelyCloses: a.likely, atRiskDeals: a.atRisk,
      avgCommHealth: a.commHealthN ? Math.round(a.commHealthSum / a.commHealthN) : null,
      missedFollowups: a.missedFollowups, openCommitments: a.openCommitments,
      localityCount: a.localities.size, propertyTypeCount: a.propTypes.size,
      maxRevenue, maxForecastRevenue, avgActiveLoad,
    };
    const scores = computeTeamScores(m);
    const trend = classifyTrend(a.recent90, a.prev90);
    const tier = classifyTier(scores.performance_score, trend);
    const sw = deriveStrengthsWeaknesses(scores);
    const topSpec = [...a.propTypes.entries()].sort((x, y) => y[1] - x[1])[0];
    const topSpecialty = topSpec ? { type: topSpec[0], deals: topSpec[1] } : null;
    const signals = detectCoachingSignals(m, scores, trend, topSpecialty);
    const ai = buildTeamAi(u.full_name, scores, tier, trend, sw, m);

    profileRows.push({
      organization_id: orgId, user_id: u.id,
      performance_score: scores.performance_score, revenue_score: scores.revenue_score, conversion_score: scores.conversion_score,
      activity_score: scores.activity_score, responsiveness_score: scores.responsiveness_score, workload_score: scores.workload_score,
      forecast_score: scores.forecast_score, client_satisfaction_score: scores.client_satisfaction_score,
      reliability_score: scores.reliability_score, coaching_score: scores.coaching_score,
      active_leads: a.activeLeads, active_buyers: a.activeBuyers, active_sellers: a.activeSellers,
      active_properties: a.activeProperties, active_matches: activeMatches,
      total_revenue: a.revenue, forecast_revenue: a.forecastRevenue, won_deals: a.won, lost_deals: a.lost,
      avg_days_to_close: m.avgDaysToClose, avg_response_time: null,
      locality_count: a.localities.size, property_type_count: a.propTypes.size,
      performance_tier: tier, growth_trend: trend,
      strengths: sw.strengths as never, weaknesses: sw.weaknesses as never,
      coaching_priorities: signals.map((s) => s.recommendation).slice(0, 4) as never,
      ai_summary: ai.ai_summary, ai_growth_plan: ai.ai_growth_plan, ai_coaching_plan: ai.ai_coaching_plan,
      last_calculated_at: new Date().toISOString(),
    });
    for (const s of signals) signalRows.push({ organization_id: orgId, user_id: u.id, signal_type: s.signal_type, severity: s.severity, confidence_score: s.confidence_score, impact_score: s.impact_score, title: s.title, description: s.description, recommendation: s.recommendation, status: "open" });

    rankings.push({ userId: u.id, name: u.full_name, performance: scores.performance_score, revenue: a.revenue, forecast: a.forecastRevenue, tier });
    workloadDist.push({ userId: u.id, name: u.full_name, load: a.activeLeads + a.activeBuyers + a.activeSellers + a.activeProperties, workload: scores.workload_score });
    for (const [loc, deals] of a.localities) {
      const arr = localityAgents.get(loc) ?? []; arr.push({ name: u.full_name, deals }); localityAgents.set(loc, arr);
    }
  }

  // Persist profiles (regen) + coaching signals (regen).
  await supabase.from("team_intelligence_profiles").delete().eq("organization_id", orgId);
  for (let i = 0; i < profileRows.length; i += 500) { const c = profileRows.slice(i, i + 500); if (c.length) await supabase.from("team_intelligence_profiles").insert(c as never); }
  await supabase.from("agent_coaching_signals").delete().eq("organization_id", orgId);
  for (let i = 0; i < signalRows.length; i += 500) { const c = signalRows.slice(i, i + 500); if (c.length) await supabase.from("agent_coaching_signals").insert(c as never); }

  // Territory coverage.
  const demandByLoc = new Map<string, number>();
  for (const s of marketRes.data ?? []) { const k = cityNorm(s.locality_name); if (!demandByLoc.has(k)) demandByLoc.set(k, s.demand_score); }
  const coverage = assessTerritoryCoverage([...localityAgents.entries()].map(([loc, agents]) => ({ locality: loc, agents, demand: demandByLoc.get(loc) ?? 0 })));

  // Office health.
  const officeRevenue = profileRows.reduce((s, p) => s + (p.total_revenue ?? 0), 0);
  const officeForecast = profileRows.reduce((s, p) => s + (p.forecast_revenue ?? 0), 0);
  const conv = profileRows.map((p) => p.conversion_score ?? 0).filter((n) => n > 0);
  const avgConversion = conv.length ? conv.reduce((a, b) => a + b, 0) / conv.length : 0;
  const wl = profileRows.map((p) => p.workload_score ?? 0);
  const avgWorkloadScore = wl.length ? wl.reduce((a, b) => a + b, 0) / wl.length : 0;
  const wlMean = workloadDist.length ? workloadDist.reduce((s, w) => s + w.load, 0) / workloadDist.length : 0;
  const workloadStdev = workloadDist.length ? Math.sqrt(workloadDist.reduce((s, w) => s + (w.load - wlMean) ** 2, 0) / workloadDist.length) : 0;
  const commHealths = profileRows.map((p) => p.client_satisfaction_score ?? 0).filter((n) => n > 0);
  const avgCommHealth = commHealths.length ? commHealths.reduce((a, b) => a + b, 0) / commHealths.length : 60;
  const opportunityLeakage = profileRows.reduce((s, p) => s + (p.lost_deals ?? 0), 0) + rankings.length; // lost deals proxy
  const totalLoc = coverage.length || 1;
  const strongLoc = coverage.filter((c) => c.status === "strong").length;
  const localityCoverage = Math.round((strongLoc / totalLoc) * 100);
  const decliningRatio = rankings.length ? rankings.filter((r) => r.tier === "declining" || r.tier === "critical").length / rankings.length : 0;
  const avgPerformance = rankings.length ? rankings.reduce((s, r) => s + r.performance, 0) / rankings.length : 0;
  const office = calculateOfficeHealth({ forecastRevenue: officeForecast, totalRevenue: officeRevenue, avgConversion, avgWorkloadScore, workloadStdev, avgCommHealth, opportunityLeakage: profileRows.reduce((s, p) => s + (p.lost_deals ?? 0), 0), localityCoverage, decliningRatio, avgPerformance });

  const eliteAgents = rankings.filter((r) => r.tier === "elite").length;
  const decliningAgents = rankings.filter((r) => r.tier === "declining" || r.tier === "critical").length;
  const overloadedAgents = workloadDist.filter((w) => w.workload < 35).length;
  const underutilizedAgents = workloadDist.filter((w) => w.workload > 88).length;
  const coachingNeeded = profileRows.filter((p) => (p.coaching_score ?? 0) >= 50).length;
  const weakLocalities = coverage.filter((c) => c.status === "uncovered" || c.status === "vulnerable").length;

  await supabase.from("team_performance_snapshots").upsert({
    organization_id: orgId, date: new Date().toISOString().slice(0, 10),
    office_health_score: office.office_health_score, office_growth_score: office.growth_score, office_risk_score: office.risk_score,
    office_revenue: officeRevenue, office_forecast_revenue: officeForecast,
    total_agents: rankings.length, elite_agents: eliteAgents, declining_agents: decliningAgents,
    overloaded_agents: overloadedAgents, underutilized_agents: underutilizedAgents, coaching_needed: coachingNeeded,
    avg_conversion_rate: Math.round(avgConversion * 100) / 100, opportunity_leakage: opportunityLeakage - rankings.length, weak_localities: weakLocalities,
    agent_rankings: rankings.sort((a, b) => b.performance - a.performance).slice(0, 20) as never,
    workload_distribution: workloadDist as never,
    territory_coverage: coverage as never,
  } as never, { onConflict: "organization_id,date" });

  return { agents: profileRows.length, coachingSignals: signalRows.length, officeHealth: office.office_health_score };
}

// ── Read model ───────────────────────────────────────────────────────────────
export type TeamProfileRow = DB["team_intelligence_profiles"]["Row"] & { name: string };
export type CoachingSignalRow = DB["agent_coaching_signals"]["Row"] & { name: string };

export interface TeamBoard {
  snapshot: DB["team_performance_snapshots"]["Row"] | null;
  agents: TeamProfileRow[];
  topPerformers: TeamProfileRow[];
  revenueLeaders: TeamProfileRow[];
  forecastLeaders: TeamProfileRow[];
  needsAttention: TeamProfileRow[];
  coaching: CoachingSignalRow[];
  workload: { userId: string; name: string; load: number; workload: number }[];
  territory: LocalityCoverage[];
  leakage: { userId: string; name: string; lost: number; atRisk: number }[];
  managementActions: { title: string; reason: string; href: string }[];
}

async function namesFor(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const { data } = await supabase.from("users").select("id,full_name").in("id", ids);
  for (const u of data ?? []) m.set(u.id, u.full_name);
  return m;
}

export async function getTeamBoard(): Promise<TeamBoard> {
  const supabase = await createClient();
  const [profRes, snapRes, sigRes] = await Promise.all([
    supabase.from("team_intelligence_profiles").select("*").order("performance_score", { ascending: false }).limit(200),
    supabase.from("team_performance_snapshots").select("*").order("date", { ascending: false }).limit(1),
    supabase.from("agent_coaching_signals").select("*").eq("status", "open").order("impact_score", { ascending: false }).limit(60),
  ]);
  const profs = profRes.data ?? [];
  const sigs = sigRes.data ?? [];
  const ids = [...new Set([...profs.map((p) => p.user_id), ...sigs.map((s) => s.user_id)])];
  const names = await namesFor(supabase, ids);
  const agents: TeamProfileRow[] = profs.map((p) => ({ ...p, name: names.get(p.user_id) ?? "סוכן" }));
  const coaching: CoachingSignalRow[] = sigs.map((s) => ({ ...s, name: names.get(s.user_id) ?? "סוכן" }));
  const snapshot = (snapRes.data ?? [])[0] ?? null;

  const byRevenue = [...agents].sort((a, b) => b.total_revenue - a.total_revenue);
  const byForecast = [...agents].sort((a, b) => b.forecast_revenue - a.forecast_revenue);
  const needsAttention = agents.filter((a) => a.performance_tier === "declining" || a.performance_tier === "critical" || a.workload_score < 35 || a.coaching_score >= 55)
    .sort((a, b) => b.coaching_score - a.coaching_score);
  const workload = agents.map((a) => ({ userId: a.user_id, name: a.name, load: a.active_leads + a.active_buyers + a.active_sellers + a.active_properties, workload: a.workload_score }))
    .sort((a, b) => a.workload - b.workload);
  const leakage = agents.filter((a) => a.lost_deals > 0).map((a) => ({ userId: a.user_id, name: a.name, lost: a.lost_deals, atRisk: 0 })).sort((a, b) => b.lost - a.lost).slice(0, 8);
  const territory = ((snapshot?.territory_coverage as LocalityCoverage[] | null) ?? []);

  const managementActions: TeamBoard["managementActions"] = [];
  for (const a of needsAttention.slice(0, 4)) managementActions.push({ title: a.workload_score < 35 ? `${a.name} עמוס מדי` : `${a.name} זקוק לליווי`, reason: a.ai_coaching_plan ?? "", href: `/team/${a.user_id}` });
  for (const t of territory.filter((c) => c.status === "uncovered" || c.status === "vulnerable").slice(0, 3)) managementActions.push({ title: `${t.locality} · כיסוי חלש`, reason: t.recommendation, href: "/team" });

  return {
    snapshot, agents,
    topPerformers: agents.slice(0, 5),
    revenueLeaders: byRevenue.slice(0, 5),
    forecastLeaders: byForecast.slice(0, 5),
    needsAttention: needsAttention.slice(0, 6),
    coaching, workload, territory, leakage, managementActions,
  };
}

export interface AgentTeamProfile {
  profile: TeamProfileRow;
  coaching: CoachingSignalRow[];
  localities: { locality: string; deals: number; revenue: number; conversion: number }[];
  propertyTypes: { type: string; deals: number; conversion: number; revenue: number }[];
}

export async function getAgentTeamProfile(userId: string): Promise<AgentTeamProfile | null> {
  const supabase = await createClient();
  const { data: prof } = await supabase.from("team_intelligence_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (!prof) return null;
  const [nameRes, sigRes, locRes, ptRes] = await Promise.all([
    supabase.from("users").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("agent_coaching_signals").select("*").eq("user_id", userId).eq("status", "open").order("impact_score", { ascending: false }),
    supabase.from("agent_locality_performance").select("locality,deals_count,revenue,conversion_rate").eq("user_id", userId).order("deals_count", { ascending: false }).limit(20),
    supabase.from("agent_property_type_performance").select("property_type,deals_count,conversion_rate,revenue").eq("user_id", userId).order("deals_count", { ascending: false }).limit(20),
  ]);
  const name = nameRes.data?.full_name ?? "סוכן";
  return {
    profile: { ...prof, name },
    coaching: (sigRes.data ?? []).map((s) => ({ ...s, name })),
    localities: (locRes.data ?? []).map((l) => ({ locality: l.locality, deals: l.deals_count, revenue: l.revenue, conversion: l.conversion_rate })),
    propertyTypes: (ptRes.data ?? []).map((p) => ({ type: p.property_type, deals: p.deals_count, conversion: p.conversion_rate, revenue: p.revenue })),
  };
}
