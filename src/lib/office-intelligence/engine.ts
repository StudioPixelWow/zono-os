// ============================================================================
// ZONO — Office Intelligence engine (server-only orchestration).
// Composes the executive dashboard by READING the existing deterministic engines
// (Property Radar live, Exclusive Acquisition, Provider QA) + aggregated org
// metrics, then applying the pure office engines. It never recomputes their
// scores. Also exposes the daily snapshot job + a sanitized AI context.
// ============================================================================
import "server-only";
import { getPropertyRadarLiveData } from "@/lib/property-radar/live/service";
import { getExclusiveDashboard } from "@/lib/exclusive-acquisition/engine";
import { assertOfficeIntelligenceAccess } from "./permissions";
import { createOfficeRepository } from "./repository";
import { buildKpiCards } from "./kpis";
import { rankLeaderboard } from "./leaderboards";
import { forecastOffice } from "./forecasting";
import { buildBenchmarks } from "./benchmarks";
import { deriveCoachingItems } from "./coaching";
import { detectOfficeRisks } from "./risk";
import { computeGoalProgress } from "./goals";
import { toOfficeMapPoints, computeMarketShareEstimates, type RawPoint } from "./map";
import type {
  ActivityItem, AgentMetrics, OfficeDashboard, OfficeKpis, OpportunityCard, OfficeSnapshotPayload,
} from "./types";

const fmtCur = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

async function providerQualityScore(db: ReturnType<typeof createOfficeRepository>["db"]): Promise<number> {
  const { data } = await db.from("provider_qa_daily_metrics" as never)
    .select("avg_quality_score, day").order("day", { ascending: false }).limit(10);
  const rows = (data ?? []) as unknown as { avg_quality_score: number }[];
  if (rows.length === 0) return 100;
  return Math.round(rows.reduce((a, r) => a + Number(r.avg_quality_score ?? 0), 0) / rows.length);
}

async function taskTotals(db: ReturnType<typeof createOfficeRepository>["db"], orgId: string): Promise<{ due: number; overdue: number }> {
  const nowIso = new Date().toISOString();
  const [{ count: due }, { count: overdue }] = await Promise.all([
    db.from("tasks" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["todo", "in_progress"] as never),
    db.from("tasks" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["todo", "in_progress"] as never).lt("due_at", nowIso),
  ]);
  return { due: due ?? 0, overdue: overdue ?? 0 };
}

/** Compose the full Office Intelligence dashboard for the current manager's org. */
export async function composeOfficeDashboard(): Promise<OfficeDashboard> {
  const access = await assertOfficeIntelligenceAccess();
  const { db, orgId, managerName, role } = access;
  const repo = createOfficeRepository(db);
  const today = new Date().toISOString().slice(0, 10);

  const [live, excl, agents, marketRows, deals, goalRows, prevSnap, providerQ, tasks] = await Promise.all([
    getPropertyRadarLiveData(), getExclusiveDashboard(), repo.getAgentMetrics(orgId), repo.getMarketShareRows(orgId),
    repo.dealsInProgress(orgId), repo.listGoals(orgId), repo.getLatestSnapshot(orgId, "daily", today), providerQualityScore(db), taskTotals(db, orgId),
  ]);

  const perfectMatches = live.buyerStream.reduce((a, s) => a + s.buyers.filter((b) => b.matchLevel === "perfect").length, 0);
  const callsToday = agents.reduce((a, m) => a + m.calls, 0);
  const whatsappsToday = agents.reduce((a, m) => a + m.whatsapps, 0);
  const meetingsToday = agents.reduce((a, m) => a + m.meetings, 0);

  // Forecast (deterministic, labeled assumptions).
  const highProb = excl.totals.veryHigh + excl.totals.high;
  const probabilitySum = excl.totals.veryHigh * 0.9 + excl.totals.high * 0.75;
  const pipelineValue = excl.topOpportunities.reduce((a, p) => a + (p.price ?? 0) * (p.exclusiveProbability / 100), 0);
  const forecast = forecastOffice({
    probabilitySum, highProbabilityCount: highProb, totalOpportunities: excl.totals.profiles, dealsInProgress: deals,
    pipelineValue, meetingsLast30: null, historicalConversion: null,
  });

  const kpis: OfficeKpis = {
    activeListings: marketRows.reduce((a, r) => a + r.officeListings, 0),
    externalListingsMonitored: marketRows.reduce((a, r) => a + r.monitoredListings, 0),
    privateListings: live.kpis.privateListings,
    exclusiveListings: excl.totals.signed,
    newListingsToday: live.kpis.newListings,
    priceDropsToday: live.kpis.priceDrops,
    hotDeals: live.kpis.hotDeals,
    backOnMarket: live.kpis.backOnMarket,
    buyerMatchesToday: live.kpis.buyerMatchesCreated,
    perfectMatches,
    sellerOpportunities: excl.totals.profiles,
    highExclusiveProbability: highProb,
    callsToday, whatsappsToday, meetingsToday,
    tasksDue: tasks.due, overdueTasks: tasks.overdue,
    dealsInProgress: deals,
    estimatedPipeline: forecast.pipelineValue,
    estimatedCommission: forecast.estimatedCommission,
    creditsUsed: live.creditMonitor.usedToday, creditsSaved: live.creditMonitor.savedToday,
    duplicateScansAvoided: live.kpis.duplicateScansAvoided,
    providerQualityScore: providerQ,
  };

  // Leaderboard + coaching from agent metrics.
  const leaderboard = rankLeaderboard(agents);
  const coaching = deriveCoachingItems(leaderboard.ranked).map((c, i) => ({ ...c, id: `${c.id}-${i}` }));

  // Risks (deterministic).
  const ignoredHot = excl.todaysPriorities.filter((p) => p.exclusiveBand === "very_high" || p.exclusiveBand === "high").length;
  const funnelCount = (stage: string) => excl.funnel.find((f) => f.stage === stage)?.count ?? 0;
  const creditsBudget = live.creditMonitor.usedToday + live.creditMonitor.remainingToday;
  const risks = detectOfficeRisks({
    ignoredHotOpportunities: ignoredHot, sellersNotContacted: funnelCount("new_opportunity"),
    perfectMatchesUnhandled: perfectMatches, overdueFollowups: kpis.overdueTasks, dealsStuck: 0, staleListings: 0,
    providerDegraded: providerQ < 60, creditsRemaining: live.creditMonitor.remainingToday, creditsBudget,
    inactiveAgents: agents.filter((m) => m.calls + m.whatsapps + m.meetings === 0).length,
    buyersGoingCold: 0, sellersLikelyLost: funnelCount("lost"),
  });

  // Opportunities board (reuse exclusive + live).
  const opportunities: OpportunityCard[] = [
    ...excl.topOpportunities.map((p): OpportunityCard => ({
      id: `excl-${p.id}`, marketPropertySourceId: p.marketPropertySourceId, tab: "exclusive",
      addressText: p.addressText, city: p.city, agentOwner: null, opportunityScore: p.sellerScore,
      exclusiveProbability: p.exclusiveProbability, buyerCount: p.buyerMatchCount,
      reason: p.scoreReasons[0]?.label ?? "הזדמנות בלעדיות", recommendedAction: p.recommendedAction,
      urgency: p.exclusiveBand === "very_high" ? "urgent" : p.exclusiveBand === "high" ? "high" : "medium",
    })),
    ...live.hotDeals.map((h): OpportunityCard => ({
      id: `hot-${h.marketPropertySourceId}`, marketPropertySourceId: h.marketPropertySourceId, tab: "hot_deals",
      addressText: h.addressText, city: h.city, agentOwner: null, opportunityScore: h.opportunityScore,
      exclusiveProbability: null, buyerCount: h.buyerMatchCount, reason: "עסקה חמה", recommendedAction: "call_today", urgency: "high",
    })),
    ...live.buyerStream.map((b): OpportunityCard => ({
      id: `bm-${b.marketPropertySourceId}`, marketPropertySourceId: b.marketPropertySourceId, tab: "buyer_matches",
      addressText: b.addressText, city: b.city, agentOwner: null, opportunityScore: null, exclusiveProbability: null,
      buyerCount: b.buyers.length, reason: `${b.buyers.length} קונים מתאימים`, recommendedAction: "invite_buyer", urgency: "medium",
    })),
  ];

  // Benchmarks vs previous snapshot.
  const currentMetrics = {
    listings: kpis.newListingsToday, opportunities: kpis.sellerOpportunities, buyerMatches: kpis.buyerMatchesToday,
    contacts: callsToday + whatsappsToday, meetings: meetingsToday, exclusives: kpis.exclusiveListings,
    deals: kpis.dealsInProgress, revenue: kpis.estimatedCommission, creditsSaved: kpis.creditsSaved,
  };
  const prevKpis = prevSnap?.kpis;
  const previousMetrics = prevKpis ? {
    listings: prevKpis.newListingsToday ?? 0, opportunities: prevKpis.sellerOpportunities ?? 0, buyerMatches: prevKpis.buyerMatchesToday ?? 0,
    contacts: (prevKpis.callsToday ?? 0) + (prevKpis.whatsappsToday ?? 0), meetings: prevKpis.meetingsToday ?? 0,
    exclusives: prevKpis.exclusiveListings ?? 0, deals: prevKpis.dealsInProgress ?? 0, revenue: prevKpis.estimatedCommission ?? 0, creditsSaved: prevKpis.creditsSaved ?? 0,
  } : {};
  const benchmarks = buildBenchmarks(currentMetrics, previousMetrics as Record<string, number>);

  const goals = goalRows.map((g) => computeGoalProgress(g));
  const marketShare = computeMarketShareEstimates(marketRows);

  const mapPoints = toOfficeMapPoints(live.mapPoints.map((p): RawPoint => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone === "neutral" ? "brand" : p.tone })));
  const activity: ActivityItem[] = live.activity.map((a) => ({ id: a.id, eventType: a.eventType, title: a.title, channel: a.channel, at: a.at, actor: null }));

  // Executive pulse (deterministic).
  const pulse: string[] = [];
  pulse.push(kpis.newListingsToday > 0 ? "המשרד במגמת עלייה היום." : "יום שקט יחסית — שווה ליזום פניות.");
  if (kpis.sellerOpportunities > 0) pulse.push(`יש ${kpis.highExclusiveProbability} הזדמנויות בלעדיות בסבירות גבוהה.`);
  const attention = leaderboard.needingAttention.length;
  if (attention > 0) pulse.push(`${attention} סוכנים צריכים תשומת לב.`);
  if (creditsBudget > 0) pulse.push(`נחסכו היום ${Math.round((kpis.creditsSaved / Math.max(1, kpis.creditsSaved + kpis.creditsUsed)) * 100)}% מקריאות הסריקה בזכות המטמון המשותף.`);
  pulse.push(`צפי עמלות החודש עומד על ${fmtCur(kpis.estimatedCommission)} (ביטחון ${forecast.confidencePct}%).`);

  return {
    managerName, role, pulse, kpis, kpiCards: buildKpiCards(kpis, prevKpis ?? null, null),
    leaderboard, opportunities, risks, coaching, forecast, benchmarks, goals, marketShare, mapPoints, activity,
    generatedAt: new Date().toISOString(),
  };
}

/** Sanitized analytics context for the AI Copilot (no raw payloads / secrets / ids). */
export async function buildOfficeAnalyticsContext(): Promise<Record<string, unknown>> {
  const d = await composeOfficeDashboard();
  return {
    kpis: d.kpis,
    topAgents: d.leaderboard.topPerformers.map((a) => ({ name: a.name, score: a.leaderboardScore, meetings: a.meetings, conversion: a.conversionRate })),
    needingAttention: d.leaderboard.needingAttention.map((a) => ({ name: a.name, overdue: a.overdueTasks, ignoredHot: a.ignoredHotOpportunities })),
    risks: d.risks.slice(0, 6).map((r) => ({ title: r.title, severity: r.severity, impact: r.businessImpact })),
    coaching: d.coaching.slice(0, 6).map((c) => ({ title: c.title, action: c.recommendedAction })),
    forecast: d.forecast,
    benchmarks: d.benchmarks,
  };
}

/** Daily snapshot job — computes + persists the heavy analytics. Cron-callable. */
export async function runOfficeIntelligenceSnapshotJob(): Promise<{ ok: boolean; agents: number; risks: number }> {
  const access = await assertOfficeIntelligenceAccess();
  const repo = createOfficeRepository(access.db);
  const d = await composeOfficeDashboard();
  const payload: OfficeSnapshotPayload = {
    kpis: d.kpis, agentMetrics: d.leaderboard.ranked as AgentMetrics[], riskItems: d.risks,
    opportunities: d.opportunities, forecasts: d.forecast, benchmarks: d.benchmarks,
  };
  await repo.saveSnapshot(access.orgId, "daily", payload);
  await repo.replaceCoachingItems(access.orgId, d.coaching.map((c) => ({ agentId: c.agentId, itemType: c.itemType, severity: c.severity, title: c.title, message: c.message, recommendedAction: c.recommendedAction }))).catch(() => {});
  return { ok: true, agents: payload.agentMetrics.length, risks: payload.riskItems.length };
}
