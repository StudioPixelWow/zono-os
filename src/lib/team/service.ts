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
  assessTerritoryCoverage, buildTeamAi, calculateCommunicationScore, calculateOfficeHealth,
  calculateRelationshipScore, classifyTier, classifyTrend, computeTeamScores, deriveStrengthsWeaknesses,
  detectCoachingSignals, managementPriority, officeHealthLevel, OFFICE_LEVEL_LABEL,
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
    supabase.from("users").select("id,full_name,title,operating_city,created_at"),
    supabase.from("leads").select("id,owner_id,stage,property_id,updated_at"),
    supabase.from("deals").select("owner_id,status,value,commission_amount,property_id,closed_at,created_at"),
    supabase.from("properties").select("id,city,type,assigned_agent_id,status,updated_at"),
    supabase.from("buyers").select("id,owner_id"),
    supabase.from("sellers").select("id,owner_id"),
    supabase.from("tasks").select("assignee_id,status"),
    supabase.from("deal_forecasts").select("id,assigned_agent_id,probability_weighted_revenue,closing_probability,deal_risk_score,momentum_score,status,locality,updated_at"),
    supabase.from("communication_intelligence_profiles").select("entity_type,entity_id,communication_health_score,missed_followups_count,open_commitments_count"),
    supabase.from("market_area_snapshots").select("locality_name,demand_score,date").order("date", { ascending: false }).limit(400),
  ]);

  // Extra context for office health + opportunity leakage (best-effort, isolated).
  const [matchRes, sellerIntelRes] = await Promise.all([
    supabase.from("match_intelligence_profiles").select("id,buyer_id,property_id,match_status,match_stage,closing_probability,revenue_score,updated_at").limit(2000).then((r) => r, () => ({ data: [] as never[] })),
    supabase.from("seller_intelligence_profiles").select("seller_id,days_since_last_contact").limit(2000).then((r) => r, () => ({ data: [] as never[] })),
  ]);

  const users = usersRes.data ?? [];
  if (!users.length) return { agents: 0, coachingSignals: 0, officeHealth: 0 };

  const propMap = new Map((propsRes.data ?? []).map((p) => [p.id, { city: p.city, type: p.type, agent: p.assigned_agent_id }]));
  const buyerOwner = new Map((buyersRes.data ?? []).map((b) => [b.id, b.owner_id]));
  const sellerOwner = new Map((sellersRes.data ?? []).map((s) => [s.id, s.owner_id]));
  const usersMeta = new Map(users.map((u) => [u.id, {
    title: (u as { title?: string | null }).title ?? null,
    operatingCity: (u as { operating_city?: string | null }).operating_city ?? null,
    startDate: (u as { created_at?: string | null }).created_at ? (u as { created_at: string }).created_at.slice(0, 10) : null,
  }]));

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
    const topLoc = [...a.localities.entries()].sort((x, y) => y[1] - x[1])[0];
    const signals = detectCoachingSignals(m, scores, trend, topSpecialty);
    const ai = buildTeamAi(u.full_name, scores, tier, trend, sw, m);
    const communicationScore = calculateCommunicationScore(m);
    const relationshipScore = calculateRelationshipScore(m, null);
    const meta = usersMeta.get(u.id);

    profileRows.push({
      organization_id: orgId, user_id: u.id,
      performance_score: scores.performance_score, revenue_score: scores.revenue_score, conversion_score: scores.conversion_score,
      activity_score: scores.activity_score, responsiveness_score: scores.responsiveness_score, workload_score: scores.workload_score,
      forecast_score: scores.forecast_score, client_satisfaction_score: scores.client_satisfaction_score,
      reliability_score: scores.reliability_score, coaching_score: scores.coaching_score,
      communication_score: communicationScore, relationship_score: relationshipScore,
      active_leads: a.activeLeads, active_buyers: a.activeBuyers, active_sellers: a.activeSellers,
      active_properties: a.activeProperties, active_matches: activeMatches,
      total_revenue: a.revenue, forecast_revenue: a.forecastRevenue, won_deals: a.won, lost_deals: a.lost,
      avg_days_to_close: m.avgDaysToClose, avg_response_time: null,
      locality_count: a.localities.size, property_type_count: a.propTypes.size,
      performance_tier: tier, growth_trend: trend,
      role: meta?.title ?? null, branch: meta?.operatingCity ?? null, start_date: meta?.startDate ?? null,
      strongest_locality: topLoc?.[0] ?? null, strongest_property_type: topSpec?.[0] ?? null, strongest_customer_type: null,
      strengths: sw.strengths as never, weaknesses: sw.weaknesses as never,
      ai_strengths: sw.strengths as never, ai_weaknesses: sw.weaknesses as never,
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

  const nameById = new Map(rankings.map((r) => [r.userId, r.name]));
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  // ── Office Health components (10) ──────────────────────────────────────────
  const allLeads = leadsRes.data ?? [];
  const newLeads = allLeads.filter((l) => l.stage === "new");
  const leadHealth = allLeads.length ? clamp(100 - (newLeads.length / allLeads.length) * 100) : 60;
  const activeForecasts = (forecastRes.data ?? []).filter((f) => f.status === "active");
  const pipelineHealth = activeForecasts.length ? clamp(50 + (activeForecasts.reduce((s, f) => s + f.closing_probability, 0) / activeForecasts.length) * 0.5) : 40;
  const activeProps = (propsRes.data ?? []).filter((p) => ["active", "published", "ready", "under_offer", "in_contract"].includes(p.status as string));
  const inventoryHealth = activeProps.length ? clamp((activeProps.filter((p) => p.assigned_agent_id).length / activeProps.length) * 100) : 50;
  const forecastHealth = clamp(office.growth_score);
  const communicationHealth = clamp(avgCommHealth);
  const agentHealth = clamp(avgPerformance);
  const marketHealth = (marketRes.data ?? []).length ? clamp((marketRes.data ?? []).slice(0, 30).reduce((s, m) => s + m.demand_score, 0) / Math.min(30, (marketRes.data ?? []).length)) : 50;
  const routingHealth = clamp(avgWorkloadScore);
  const matches = (matchRes.data ?? []) as { id: string; match_status: string; match_stage: string; updated_at: string; revenue_score: number; property_id: string | null }[];
  const activeMatchesAll = matches.filter((m) => m.match_status === "active");
  const matchingHealth = activeMatchesAll.length ? clamp((activeMatchesAll.filter((m) => !["candidate", "presented"].includes(m.match_stage)).length / activeMatchesAll.length) * 100) : 50;
  const decisionHealth = clamp(office.office_health_score);
  const officeLevel = officeHealthLevel(office.office_health_score);

  await supabase.from("office_intelligence_profiles").upsert({
    organization_id: orgId, office_health_score: office.office_health_score, health_level: officeLevel,
    lead_health: leadHealth, pipeline_health: pipelineHealth, inventory_health: inventoryHealth, forecast_health: forecastHealth,
    communication_health: communicationHealth, agent_health: agentHealth, market_health: marketHealth,
    routing_health: routingHealth, matching_health: matchingHealth, decision_health: decisionHealth,
    growth_score: office.growth_score, risk_score: office.risk_score,
    ai_office_summary: `בריאות משרד ${office.office_health_score} (${OFFICE_LEVEL_LABEL[officeLevel]}) · ${rankings.length} סוכנים · ${overloadedAgents} עמוסים · ${weakLocalities} אזורים חלשים.`,
    ai_management_plan: overloadedAgents > 0 || weakLocalities > 0 ? "אזן עומסים, חזק כיסוי אזורי וטפל בעסקאות בסיכון." : "המשך מומנטום — שמר על איזון ועל איכות הצנרת.",
    last_calculated_at: new Date().toISOString(),
  } as never, { onConflict: "organization_id" });

  // ── Opportunity Leaks ──────────────────────────────────────────────────────
  const stale = (iso: string | null | undefined, days: number) => !iso || (now - new Date(iso).getTime()) > days * DAY;
  const leakRows: DB["team_opportunity_leaks"]["Insert"][] = [];

  // Leads never contacted (grouped per owner).
  const newByOwner = new Map<string, number>();
  for (const l of newLeads) { if (l.owner_id) newByOwner.set(l.owner_id, (newByOwner.get(l.owner_id) ?? 0) + 1); }
  for (const [owner, count] of newByOwner) {
    if (count < 1) continue;
    leakRows.push({ organization_id: orgId, leak_type: "lead_never_contacted", entity_type: "user", entity_id: owner, owner_user_id: owner,
      title: `${nameById.get(owner) ?? "סוכן"} · ${count} לידים ללא יצירת קשר`, reason: "לידים בסטטוס ׳חדש׳ שלא טופלו", lost_revenue_impact: count * 6000,
      severity: count >= 5 ? "high" : "medium", recommended_action: "צור קשר עם הלידים החדשים היום", status: "open" });
  }
  // Stalled matches.
  for (const mm of activeMatchesAll) {
    if (!["candidate", "presented", "viewing_scheduled"].includes(mm.match_stage) || !stale(mm.updated_at, 21)) continue;
    const owner = mm.property_id ? propMap.get(mm.property_id)?.agent ?? null : null;
    leakRows.push({ organization_id: orgId, leak_type: "match_stalled", entity_type: "match", entity_id: mm.id, owner_user_id: owner,
      title: "התאמה תקועה ללא התקדמות", reason: `בשלב ${mm.match_stage} ללא עדכון מעל 21 ימים`, lost_revenue_impact: clamp(mm.revenue_score) * 600,
      severity: "medium", recommended_action: "קדם את ההתאמה — תאם ביקור/הצעה", status: "open" });
  }
  // Sellers without touchpoint.
  for (const s of (sellerIntelRes.data ?? []) as { seller_id: string; days_since_last_contact: number | null }[]) {
    if ((s.days_since_last_contact ?? 0) < 21) continue;
    const owner = sellerOwner.get(s.seller_id) ?? null;
    leakRows.push({ organization_id: orgId, leak_type: "seller_no_touchpoint", entity_type: "seller", entity_id: s.seller_id, owner_user_id: owner,
      title: `מוכר ללא קשר ${s.days_since_last_contact} ימים`, reason: "אין נקודת מגע עדכנית עם המוכר", lost_revenue_impact: 10000,
      severity: (s.days_since_last_contact ?? 0) >= 45 ? "high" : "medium", recommended_action: "שלח דוח עדכון / קבע שיחה עם המוכר", status: "open" });
  }
  // Properties without activity.
  for (const p of activeProps) {
    if (!stale(p.updated_at, 30)) continue;
    leakRows.push({ organization_id: orgId, leak_type: "property_no_activity", entity_type: "property", entity_id: p.id, owner_user_id: p.assigned_agent_id,
      title: "נכס ללא פעילות מעל 30 ימים", reason: "אין עדכון/פעילות שיווקית", lost_revenue_impact: 8000,
      severity: "low", recommended_action: "רענן שיווק / קדם שלב במסע הנכס", status: "open" });
  }
  // Forecast at-risk / stalled.
  for (const f of (forecastRes.data ?? []) as { id: string; assigned_agent_id: string | null; probability_weighted_revenue: number; closing_probability: number; deal_risk_score: number; momentum_score: number; status: string; updated_at: string }[]) {
    if (f.status !== "active") continue;
    if (f.deal_risk_score >= 55) {
      leakRows.push({ organization_id: orgId, leak_type: "deal_at_risk", entity_type: "forecast", entity_id: f.id, owner_user_id: f.assigned_agent_id,
        title: "עסקה בסיכון", reason: `סיכון ${f.deal_risk_score}`, lost_revenue_impact: f.probability_weighted_revenue, severity: f.deal_risk_score >= 70 ? "high" : "medium",
        recommended_action: "התערב מיידית לשמירת ההכנסה", status: "open" });
    } else if ((f.momentum_score ?? 100) < 40 && f.closing_probability >= 30 && f.closing_probability < 65) {
      leakRows.push({ organization_id: orgId, leak_type: "forecast_stalled", entity_type: "forecast", entity_id: f.id, owner_user_id: f.assigned_agent_id,
        title: "עסקה תקועה בצנרת", reason: "מומנטום נמוך ללא התקדמות", lost_revenue_impact: Math.round(f.probability_weighted_revenue * 0.5), severity: "medium",
        recommended_action: "קדם את העסקה — פולואפ והסרת חסם", status: "open" });
    }
  }
  leakRows.sort((a, b) => (b.lost_revenue_impact ?? 0) - (a.lost_revenue_impact ?? 0));
  const cappedLeaks = leakRows.slice(0, 150);
  await supabase.from("team_opportunity_leaks").delete().eq("organization_id", orgId);
  for (let i = 0; i < cappedLeaks.length; i += 500) { const c = cappedLeaks.slice(i, i + 500); if (c.length) await supabase.from("team_opportunity_leaks").insert(c as never); }

  // ── Management Actions (ranked top 20) ─────────────────────────────────────
  type Act = DB["management_actions"]["Insert"];
  const acts: Act[] = [];
  const overloaded = [...workloadDist].filter((w) => w.workload < 35).sort((a, b) => a.workload - b.workload);
  const idle = [...workloadDist].filter((w) => w.workload > 88).sort((a, b) => b.workload - a.workload);

  if (overloaded.length && idle.length) {
    const from = overloaded[0], to = idle[0];
    const n = Math.max(2, Math.round((from.load - wlMean) / 2));
    acts.push({ organization_id: orgId, action_type: "rebalance_leads", title: `העבר ~${n} לידים מ-${from.name} ל-${to.name}`,
      reason: `${from.name} עמוס (${from.load} פעילים) בעוד ${to.name} פנוי`, impact_score: 82, urgency_score: 76,
      expected_revenue_impact: n * 9000, expected_conversion_lift: 8, recommended_owner_id: to.userId, entity_type: "team", entity_id: to.userId, href: "/routing", status: "open" });
  }
  for (const w of overloaded.slice(0, 3)) acts.push({ organization_id: orgId, action_type: "review_overloaded", title: `בדוק עומס: ${w.name}`, reason: `${w.load} פעילים — מעל הממוצע`, impact_score: 64, urgency_score: 66, expected_revenue_impact: 0, expected_conversion_lift: 5, recommended_owner_id: w.userId, entity_type: "team", entity_id: w.userId, href: `/team/${w.userId}`, status: "open" });
  for (const p of profileRows.filter((r) => (r.coaching_score ?? 0) >= 55).slice(0, 5)) acts.push({ organization_id: orgId, action_type: "coach_agent", title: `ליווי: ${nameById.get(p.user_id!) ?? "סוכן"}`, reason: p.ai_coaching_plan ?? "צורך בליווי", impact_score: 60, urgency_score: 58, expected_revenue_impact: 0, expected_conversion_lift: 10, recommended_owner_id: p.user_id, entity_type: "team", entity_id: p.user_id ?? null, href: `/team/${p.user_id}`, status: "open" });
  for (const c of coverage.filter((x) => x.status === "uncovered" || x.status === "vulnerable").slice(0, 4)) acts.push({ organization_id: orgId, action_type: "recruit_locality", title: `${c.locality} · חזק כיסוי`, reason: c.recommendation, impact_score: 58, urgency_score: 52, expected_revenue_impact: 0, expected_conversion_lift: 4, recommended_owner_id: null, entity_type: "locality", entity_id: c.locality, href: "/team", status: "open" });
  for (const w of idle.slice(0, 3)) acts.push({ organization_id: orgId, action_type: "give_leads", title: `הקצה לידים ל-${w.name}`, reason: "קיבולת פנויה — הזרם הזדמנויות", impact_score: 56, urgency_score: 50, expected_revenue_impact: 7000, expected_conversion_lift: 6, recommended_owner_id: w.userId, entity_type: "team", entity_id: w.userId, href: "/routing", status: "open" });
  for (const l of cappedLeaks.filter((x) => x.leak_type === "deal_at_risk" || x.leak_type === "forecast_stalled").slice(0, 5)) acts.push({ organization_id: orgId, action_type: "recover_deal", title: l.title!, reason: l.reason ?? "", impact_score: 78, urgency_score: 80, expected_revenue_impact: l.lost_revenue_impact ?? 0, expected_conversion_lift: 12, recommended_owner_id: l.owner_user_id ?? null, entity_type: "forecast", entity_id: l.entity_id ?? null, href: "/forecast", status: "open" });
  for (const l of cappedLeaks.filter((x) => x.leak_type === "match_stalled").slice(0, 4)) acts.push({ organization_id: orgId, action_type: "resolve_objection", title: l.title!, reason: l.reason ?? "", impact_score: 62, urgency_score: 60, expected_revenue_impact: l.lost_revenue_impact ?? 0, expected_conversion_lift: 9, recommended_owner_id: l.owner_user_id ?? null, entity_type: "match", entity_id: l.entity_id ?? null, href: "/matches", status: "open" });
  for (const l of cappedLeaks.filter((x) => x.leak_type === "seller_no_touchpoint").slice(0, 3)) acts.push({ organization_id: orgId, action_type: "seller_touchpoint", title: l.title!, reason: l.reason ?? "", impact_score: 54, urgency_score: 62, expected_revenue_impact: l.lost_revenue_impact ?? 0, expected_conversion_lift: 5, recommended_owner_id: l.owner_user_id ?? null, entity_type: "seller", entity_id: l.entity_id ?? null, href: l.entity_id ? `/sellers/${l.entity_id}` : "/sellers", status: "open" });

  const ranked = acts.map((a) => ({ ...a, priority_score: managementPriority(a.impact_score ?? 0, a.urgency_score ?? 0) }))
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)).slice(0, 20)
    .map((a, i) => ({ ...a, rank_position: i + 1 }));
  await supabase.from("management_actions").delete().eq("organization_id", orgId);
  for (let i = 0; i < ranked.length; i += 500) { const c = ranked.slice(i, i + 500); if (c.length) await supabase.from("management_actions").insert(c as never); }

  return { agents: profileRows.length, coachingSignals: signalRows.length, officeHealth: office.office_health_score };
}

// ── Read model ───────────────────────────────────────────────────────────────
export type TeamProfileRow = DB["team_intelligence_profiles"]["Row"] & { name: string };
export type CoachingSignalRow = DB["agent_coaching_signals"]["Row"] & { name: string };

export type ManagementActionRow = DB["management_actions"]["Row"] & { ownerName: string | null };
export type OpportunityLeakRow = DB["team_opportunity_leaks"]["Row"] & { ownerName: string | null };

export interface TeamBoard {
  snapshot: DB["team_performance_snapshots"]["Row"] | null;
  office: DB["office_intelligence_profiles"]["Row"] | null;
  agents: TeamProfileRow[];
  topPerformers: TeamProfileRow[];
  revenueLeaders: TeamProfileRow[];
  forecastLeaders: TeamProfileRow[];
  needsAttention: TeamProfileRow[];
  coaching: CoachingSignalRow[];
  workload: { userId: string; name: string; load: number; workload: number }[];
  territory: LocalityCoverage[];
  leaks: OpportunityLeakRow[];
  /** Ranked daily management actions — the core CEO output. */
  actions: ManagementActionRow[];
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
  const [profRes, snapRes, sigRes, officeRes, actRes, leakRes] = await Promise.all([
    supabase.from("team_intelligence_profiles").select("*").order("performance_score", { ascending: false }).limit(200),
    supabase.from("team_performance_snapshots").select("*").order("date", { ascending: false }).limit(1),
    supabase.from("agent_coaching_signals").select("*").eq("status", "open").order("impact_score", { ascending: false }).limit(60),
    supabase.from("office_intelligence_profiles").select("*").maybeSingle(),
    supabase.from("management_actions").select("*").eq("status", "open").order("priority_score", { ascending: false }).limit(20),
    supabase.from("team_opportunity_leaks").select("*").eq("status", "open").order("lost_revenue_impact", { ascending: false }).limit(40),
  ]);
  const profs = profRes.data ?? [];
  const sigs = sigRes.data ?? [];
  const actions0 = actRes.data ?? [];
  const leaks0 = leakRes.data ?? [];
  const ids = [...new Set([...profs.map((p) => p.user_id), ...sigs.map((s) => s.user_id), ...actions0.map((a) => a.recommended_owner_id).filter((x): x is string => !!x), ...leaks0.map((l) => l.owner_user_id).filter((x): x is string => !!x)])];
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
  const territory = ((snapshot?.territory_coverage as LocalityCoverage[] | null) ?? []);

  return {
    snapshot, office: officeRes.data ?? null, agents,
    topPerformers: agents.slice(0, 5),
    revenueLeaders: byRevenue.slice(0, 5),
    forecastLeaders: byForecast.slice(0, 5),
    needsAttention: needsAttention.slice(0, 6),
    coaching, workload, territory,
    leaks: leaks0.map((l) => ({ ...l, ownerName: l.owner_user_id ? names.get(l.owner_user_id) ?? null : null })),
    actions: actions0.map((a) => ({ ...a, ownerName: a.recommended_owner_id ? names.get(a.recommended_owner_id) ?? null : null })),
  };
}

export interface AgentTeamProfile {
  profile: TeamProfileRow;
  coaching: CoachingSignalRow[];
  localities: { locality: string; deals: number; revenue: number; conversion: number }[];
  propertyTypes: { type: string; deals: number; conversion: number; revenue: number }[];
  leaks: DB["team_opportunity_leaks"]["Row"][];
  recommendations: DB["management_actions"]["Row"][];
}

export async function getAgentTeamProfile(userId: string): Promise<AgentTeamProfile | null> {
  const supabase = await createClient();
  const { data: prof } = await supabase.from("team_intelligence_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (!prof) return null;
  const [nameRes, sigRes, locRes, ptRes, leakRes, actRes] = await Promise.all([
    supabase.from("users").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("agent_coaching_signals").select("*").eq("user_id", userId).eq("status", "open").order("impact_score", { ascending: false }),
    supabase.from("agent_locality_performance").select("locality,deals_count,revenue,conversion_rate").eq("user_id", userId).order("deals_count", { ascending: false }).limit(20),
    supabase.from("agent_property_type_performance").select("property_type,deals_count,conversion_rate,revenue").eq("user_id", userId).order("deals_count", { ascending: false }).limit(20),
    supabase.from("team_opportunity_leaks").select("*").eq("owner_user_id", userId).eq("status", "open").order("lost_revenue_impact", { ascending: false }).limit(20),
    supabase.from("management_actions").select("*").eq("recommended_owner_id", userId).eq("status", "open").order("priority_score", { ascending: false }).limit(10),
  ]);
  const name = nameRes.data?.full_name ?? "סוכן";
  return {
    profile: { ...prof, name },
    coaching: (sigRes.data ?? []).map((s) => ({ ...s, name })),
    localities: (locRes.data ?? []).map((l) => ({ locality: l.locality, deals: l.deals_count, revenue: l.revenue, conversion: l.conversion_rate })),
    propertyTypes: (ptRes.data ?? []).map((p) => ({ type: p.property_type, deals: p.deals_count, conversion: p.conversion_rate, revenue: p.revenue })),
    leaks: leakRes.data ?? [],
    recommendations: actRes.data ?? [],
  };
}
