// ============================================================================
// 🧠 ZONO AI Chief of Staff™ — service / orchestration (server-only). 27.6.
// Loads EVERY existing context package (offices index · brokerage data quality ·
// Action Center · per-city Decision briefings · Competitive dashboards) into ONE
// Global Context, then produces the Organization Score, CEO Dashboard, Executive
// Briefing, ranked recommendations, cross-module insights, execution-coordinator
// interventions and organizational memory. READ-ONLY over every engine — nothing
// is modified and nothing auto-executes. Evidence-only; no fabrication.
// ============================================================================
import "server-only";
import { getBrokerageOfficesIndex } from "../brokerage-data/office-profile";
import { getBrokerageDataOverview } from "../brokerage-data/overview";
import { getActionCenter, type ActionCenter, type Mission } from "../mission-engine";
import { getCityDecisionBriefing } from "../decision-engine";
import { getCityCompetitiveDashboard } from "../brokerage-data/competitive-intelligence";
import { computeOrganizationScore, computeDashboard, clamp } from "./score";
import {
  crossModuleInsights, buildExecutiveRecommendations, buildInterventions, buildBusinessMemory,
  type ReasoningInput, type MissionLite, type CityPriority, type CityRisk, type CityOpportunity, type MemoryInput,
} from "./reasoning";
import {
  CHIEF_OF_STAFF_VERSION,
  type OrgSignals, type GlobalContext, type CityContext, type ChiefOfStaffReport,
  type ExecutiveBriefing,
} from "./types";

const MAX_CITIES = 6;
const uniq = (xs: string[]): string[] => [...new Set(xs.filter(Boolean))];

const missionEntity = (m: Mission): string =>
  m.entityName ?? (m.entityId ? `${m.entityType}:${m.entityId}` : m.entityType);
const toLite = (m: Mission): MissionLite => ({
  missionType: m.missionType, goal: m.goal, entity: missionEntity(m), priority: m.priority, status: m.status,
});

export interface GlobalContextBundle {
  context: GlobalContext; signals: OrgSignals; reasoning: ReasoningInput; actionCenter: ActionCenter;
  openMissions: Mission[]; completedMissions: Mission[]; cancelledMissions: Mission[];
}

/** Part 1 — assemble the unified Global Context from every engine (read-only). */
export async function buildGlobalContext(orgId: string | null): Promise<GlobalContextBundle> {
  const [idx, overview, actionCenter] = await Promise.all([
    getBrokerageOfficesIndex().catch(() => ({ offices: [], cities: [], brands: [], totals: { offices: 0, agents: 0, listings: 0 } })),
    getBrokerageDataOverview(orgId).catch(() => null),
    getActionCenter(orgId).catch(() => null),
  ]);

  const cities = idx.cities.slice(0, MAX_CITIES);
  const [briefings, dashboards] = await Promise.all([
    Promise.all(cities.map((c) => getCityDecisionBriefing(c).catch(() => null))),
    Promise.all(cities.map((c) => getCityCompetitiveDashboard(c).catch(() => null))),
  ]);

  const sources = ["Offices Index"];
  if (overview) sources.push("Brokerage Data Quality");
  if (actionCenter) sources.push("Mission Action Center");

  // ── Per-city context + reasoning inputs ─────────────────────────────────────
  const cityContexts: CityContext[] = [];
  const priorities: CityPriority[] = [];
  const risks: CityRisk[] = [];
  const opportunities: CityOpportunity[] = [];
  const decliningCities: { city: string; trendPct: number }[] = [];
  const growingCompetitors: ReasoningInput["growingCompetitors"] = [];
  const decliningCompetitors: ReasoningInput["decliningCompetitors"] = [];
  const emergingAreas: CityOpportunity[] = [];
  const weakCoverageCities: { city: string; businessScore: number }[] = [];
  const competitiveAlerts: string[] = [];
  const brokerAlerts: string[] = [];
  const marketAlerts: string[] = [];
  const valuationAlerts: string[] = [];
  const officeAlerts: string[] = [];

  let analyzed = 0, sumBiz = 0, sumConf = 0;
  cities.forEach((city, i) => {
    const b = briefings[i]; const d = dashboards[i];
    if (b) {
      analyzed += 1; sumBiz += b.businessScore; sumConf += b.aiConfidence;
      cityContexts.push({
        city: b.city, cityNormalized: b.cityNormalized,
        businessScore: b.businessScore, aiConfidence: b.aiConfidence,
        priorities: b.todaysPriorities.length, risks: b.topRisks.length, opportunities: b.topOpportunities.length,
        competitorAlerts: b.competitorAlerts, marketAlerts: b.marketAlerts, brokerAlerts: b.brokerAlerts,
      });
      for (const p of b.todaysPriorities) priorities.push({ city: b.city, category: p.category, title: p.title, why: p.why, evidence: p.evidence[0] ?? "", priority: p.priorityScore, readiness: p.executionReadiness });
      for (const r of b.topRisks) risks.push({ city: b.city, title: r.title, evidence: r.evidence, severity: r.severity });
      for (const o of b.topOpportunities) opportunities.push({ city: b.city, title: o.title, evidence: o.evidence, area: o.area });
      competitiveAlerts.push(...b.competitorAlerts);
      brokerAlerts.push(...b.brokerAlerts);
      marketAlerts.push(...b.marketAlerts.map((a) => `${b.city}: ${a}`));
      valuationAlerts.push(...b.valuationAlerts);
      if (b.businessScore < 45) weakCoverageCities.push({ city: b.city, businessScore: b.businessScore });
    }
    if (d) {
      if (d.snapshot.inventoryTrendPct < 0) decliningCities.push({ city: d.city, trendPct: d.snapshot.inventoryTrendPct });
      for (const g of d.topGrowing.slice(0, 3)) growingCompetitors.push({ city: d.city, name: g.officeName, growthPct: g.growthPct });
      for (const g of d.topDeclining.slice(0, 3)) { decliningCompetitors.push({ city: d.city, name: g.officeName, growthPct: g.growthPct }); officeAlerts.push(`${g.officeName} בירידה ${g.growthPct}% (${d.city})`); }
      for (const a of d.emergingAreas.slice(0, 3)) emergingAreas.push({ city: d.city, title: a.title, evidence: a.evidence, area: a.area });
    }
  });
  if (analyzed > 0) sources.push("Decision Engine", "Competitive Intelligence");
  growingCompetitors.sort((a, b) => b.growthPct - a.growthPct);

  const avgBusinessScore = analyzed ? Math.round(sumBiz / analyzed) : 0;
  const avgConfidence = analyzed ? Math.round(sumConf / analyzed) : 0;

  // ── Missions (Action Center) ────────────────────────────────────────────────
  const ac = actionCenter;
  const openMissions: Mission[] = ac
    ? [...ac.critical, ...ac.highPriority, ...ac.inProgress, ...ac.todaysMissions].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
    : [];
  const blockedMissions = (ac?.blocked ?? []).map(toLite);
  const waitingMissions = (ac?.waiting ?? []).map(toLite);
  const cancelledMissions = (ac?.recentlyCreated ?? []).filter((m) => m.status === "CANCELLED");

  // ── Normalized org signals ──────────────────────────────────────────────────
  const signals: OrgSignals = {
    offices: idx.totals.offices, brokers: idx.totals.agents, activeListings: idx.totals.listings,
    activeCities: idx.cities.length, brands: idx.brands.length,
    agentsWithOffice: overview?.agentsWithOffice ?? 0,
    linkCoveragePct: overview?.dataQuality.linkCoverage ?? 0,
    resolutionRatePct: overview?.dataQuality.resolutionRate ?? 0,
    dataQualityScore: overview?.dataQuality.score ?? 0,
    missions: {
      active: ac?.totals.active ?? 0, completed: ac?.totals.completed ?? 0, cancelled: cancelledMissions.length,
      blocked: ac?.totals.blocked ?? 0, waiting: ac?.totals.waiting ?? 0, inProgress: ac?.totals.inProgress ?? 0,
      executionScore: ac?.executionScore ?? 0, completionRatePct: ac?.completionRatePct ?? 0,
    },
    market: {
      citiesAnalyzed: analyzed, avgBusinessScore, avgConfidence,
      decliningCities: decliningCities.length,
      riskCount: risks.length, opportunityCount: opportunities.length, competitiveAlerts: growingCompetitors.length,
    },
    sourcesUsed: sources.length,
  };

  const notes: string[] = [];
  if (signals.offices === 0) notes.push("אין משרדים מקושרים — הפעל גילוי/שיוך לפני קבלת המלצות. אין המלצות ספקולטיביות.");
  if (analyzed === 0) notes.push("לא נותחו ערים — חסר ניתוח שוק/תחרות. הציונים נגזרים מכיסוי בלבד.");
  if (ac?.notes?.length) notes.push(...ac.notes);

  const context: GlobalContext = {
    orgId, generatedAt: new Date().toISOString(),
    organization: { offices: idx.totals.offices, brokers: idx.totals.agents, activeListings: idx.totals.listings, activeCities: idx.cities.length, brands: idx.brands.length },
    dataQuality: {
      linkCoveragePct: overview?.dataQuality.linkCoverage ?? 0, resolutionRatePct: overview?.dataQuality.resolutionRate ?? 0,
      score: overview?.dataQuality.score ?? 0, label: overview?.dataQuality.label ?? "ריק",
    },
    missions: { ...signals.missions, todaysTasks: ac?.todaysTasks.length ?? 0, upcoming: ac?.upcoming.length ?? 0 },
    market: { cities: cityContexts, avgBusinessScore, avgConfidence, decliningCities: decliningCities.length },
    decisions: { priorities: priorities.length, risks: risks.length, opportunities: opportunities.length },
    sources, notes,
  };

  const reasoning: ReasoningInput = {
    signals, decliningCities, growingCompetitors, decliningCompetitors, emergingAreas, weakCoverageCities,
    priorities, risks, opportunities,
    blockedMissions, waitingMissions,
  };

  return {
    context, signals, reasoning, actionCenter: ac ?? emptyActionCenter(orgId),
    openMissions, completedMissions: ac?.completed ?? [], cancelledMissions,
  };
}

function emptyActionCenter(orgId: string | null): ActionCenter {
  return {
    organizationId: orgId, totals: { active: 0, blocked: 0, waiting: 0, inProgress: 0, completed: 0, today: 0 },
    todaysMissions: [], critical: [], highPriority: [], blocked: [], waiting: [], inProgress: [],
    upcoming: [], recentlyCreated: [], completed: [], todaysTasks: [], executionScore: 0, completionRatePct: 0,
    notes: [], version: "27.5",
  };
}

/** The single unified Chief-of-Staff report (Parts 1–9). */
export async function getChiefOfStaff(orgId: string | null): Promise<ChiefOfStaffReport> {
  const { context, signals, reasoning, actionCenter, openMissions, completedMissions: completed, cancelledMissions: cancelled } = await buildGlobalContext(orgId);

  const organizationScore = computeOrganizationScore(signals);
  const dashboard = computeDashboard(signals, organizationScore);

  const openLite: MissionLite[] = openMissions.map(toLite);
  const recommendations = buildExecutiveRecommendations(reasoning, openLite);
  const insights = crossModuleInsights(reasoning);
  const interventions = buildInterventions(reasoning);

  const memInput: MemoryInput = {
    completed: completed.map((m) => ({ missionType: m.missionType, goal: m.goal })),
    cancelled: cancelled.map((m) => ({ missionType: m.missionType, goal: m.goal })),
    active: openMissions.map((m) => ({ missionType: m.missionType })),
  };
  const businessMemory = buildBusinessMemory(memInput);

  const briefing = buildBriefing(context, organizationScore, actionCenter, recommendations, reasoning);

  const notes = [...context.notes];
  if (!openMissions.length && signals.offices > 0) notes.push("אין משימות פעילות — צור משימות מההחלטות במרכז הפעולות.");

  return {
    version: CHIEF_OF_STAFF_VERSION, orgId, generatedAt: context.generatedAt,
    globalContext: context, organizationScore, dashboard, briefing,
    recommendations, crossModuleInsights: insights, interventions, businessMemory, notes,
  };
}

// ── Part 2 — assemble the Executive Briefing from ranked recommendations ──────
function buildBriefing(
  ctx: GlobalContext,
  score: ReturnType<typeof computeOrganizationScore>,
  ac: ActionCenter,
  recs: ReturnType<typeof buildExecutiveRecommendations>,
  reasoning: ReasoningInput,
): ExecutiveBriefing {
  const competitiveAlerts = uniq(ctx.market.cities.flatMap((c) => c.competitorAlerts)).slice(0, 8);
  const brokerAlerts = uniq(ctx.market.cities.flatMap((c) => c.brokerAlerts)).slice(0, 8);
  const marketAlerts = uniq(ctx.market.cities.flatMap((c) => c.marketAlerts.map((a) => `${c.city}: ${a}`))).slice(0, 8);
  const officeAlerts = uniq(reasoning.decliningCompetitors.map((d) => `${d.name} בירידה ${d.growthPct}% (${d.city})`)).slice(0, 8);
  const missionBlockers = [
    ...reasoning.blockedMissions.map((m) => `חסום: ${m.goal || m.missionType} (${m.entity})`),
    ...reasoning.waitingMissions.map((m) => `ממתין לאישור: ${m.goal || m.missionType} (${m.entity})`),
  ].slice(0, 10);

  const notes: string[] = [];
  if (!competitiveAlerts.length && !ctx.market.cities.length) notes.push("אין התרעות שוק — לא נותחו ערים.");

  return {
    businessScore: score.overall, executionScore: ac.executionScore, aiConfidence: score.confidence,
    todaysPriorities: recs.topPriorities.slice(0, 10),
    criticalRisks: recs.topRisks.slice(0, 10),
    urgentMissions: recs.topMissions.slice(0, 10),
    importantOpportunities: recs.topOpportunities.slice(0, 10),
    competitiveAlerts, valuationAlerts: [], brokerAlerts, officeAlerts, marketAlerts,
    missionBlockers, notes,
  };
}

export { clamp };
