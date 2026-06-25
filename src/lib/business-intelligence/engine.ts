// ============================================================================
// ZONO — Executive BI engine (server-only). Composes the executive dashboard by
// CONSUMING the deterministic engines: Office Intelligence (KPIs, agents,
// forecast, benchmarks, market share, map), Journey Automation (ROI/metrics) and
// Competitor Intelligence (market-share trend). It never recomputes their scores.
// All BI math is deterministic; AI summarizes only.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { composeOfficeDashboard } from "@/lib/office-intelligence/engine";
import { createJourneyRepository } from "@/lib/journey-automation/repository";
import { computeMetrics as computeJourneyMetrics } from "@/lib/journey-automation/metrics";
import { clamp, round, direction, PERIOD_DAYS } from "./analytics";
import { forecastExecutive } from "./forecasting";
import { buildPipeline } from "./pipeline";
import { computeRoi } from "./roi";
import { computeAgentProductivity } from "./productivity";
import { computeRevenue, type RevenueShareInput } from "./commissions";
import { computeHealthScore } from "./health";
import { forecastRisks } from "./predictions";
import type {
  AgentProductivity, Benchmark, ExecKpi, ExecMapPoint, ExecutiveDashboard, KpiFormat, Period, TimelineEvent,
} from "./types";

const PERIODS: Period[] = ["today", "week", "month", "quarter", "year"];

/** A base KPI carries a daily value + whether it's a flow (scales w/ period). */
interface BaseKpi { key: string; label: string; value: number; format: KpiFormat; flow: boolean; changePercent: number | null }

function expandKpis(base: BaseKpi[]): Record<Period, ExecKpi[]> {
  const out = {} as Record<Period, ExecKpi[]>;
  for (const p of PERIODS) {
    const factor = base.some((b) => b.flow) ? PERIOD_DAYS[p]! / PERIOD_DAYS.today! : 1;
    out[p] = base.map((b) => {
      const value = b.flow ? Math.round(b.value * factor) : Math.round(b.value);
      const changePercent = p === "month" ? b.changePercent : null;
      return { key: b.key, label: b.label, value, format: b.format, changePercent, direction: direction(changePercent) };
    });
  }
  return out;
}

export async function composeExecutiveDashboard(): Promise<ExecutiveDashboard> {
  const db = createServiceRoleClient();
  const office = await composeOfficeDashboard();           // deterministic source of truth
  const k = office.kpis;
  const agents = office.leaderboard.ranked;
  const fc = office.forecast;

  // Journey Automation ROI/metrics (best-effort; org inferred from office session).
  let journey = { tasksAutomated: 0, callsSaved: 0, whatsappsGenerated: 0, hoursSaved: 0, automationSuccessPct: 0 };
  try {
    // office is already org-scoped; reuse its org by reading journey aggregates per same session.
    const { getJourneyAccess } = await import("@/lib/journey-automation/permissions");
    const acc = await getJourneyAccess();
    const repo = createJourneyRepository(db);
    const [counts, rows] = await Promise.all([repo.doneActionStepCounts(acc.orgId), repo.executionRows(acc.orgId, 400)]);
    const m = computeJourneyMetrics({ actionCounts: counts, executionsTotal: rows.length, executionsSucceeded: rows.filter((r) => r.status === "completed").length });
    journey = { tasksAutomated: m.tasksAutomated, callsSaved: m.callsSaved, whatsappsGenerated: m.whatsappsGenerated, hoursSaved: m.hoursSaved, automationSuccessPct: m.automationSuccessPct };
  } catch { /* journey metrics optional */ }

  // Competitor market-share trend (best-effort).
  let marketShareTrend = office.marketShare[0]?.sharePercent ?? 0;
  try {
    const { getCompetitorOfficeWidget } = await import("@/lib/competitor-intelligence/engine");
    const w = await getCompetitorOfficeWidget();
    if (w && w.topCompetitors.length) marketShareTrend = round(clamp(100 - w.topCompetitors.reduce((s, c) => s + c.estimatedSharePercent, 0), 0, 100), 1);
  } catch { /* competitor data optional */ }

  // ── KPIs (benchmarks → change %) ─────────────────────────────────────────--
  const bm = new Map(office.benchmarks.map((b) => [b.metric, b.deltaPct]));
  const base: BaseKpi[] = [
    { key: "expected_revenue", label: "הכנסה צפויה", value: fc.pipelineValue, format: "currency", flow: false, changePercent: bm.get("revenue") ?? null },
    { key: "expected_commission", label: "עמלה צפויה", value: fc.estimatedCommission, format: "currency", flow: false, changePercent: bm.get("revenue") ?? null },
    { key: "pipeline_value", label: "ערך פייפליין", value: k.estimatedPipeline, format: "currency", flow: false, changePercent: bm.get("opportunities") ?? null },
    { key: "forecast_confidence", label: "ודאות תחזית", value: fc.confidencePct, format: "percent", flow: false, changePercent: null },
    { key: "health_score", label: "בריאות משרד", value: 0, format: "int", flow: false, changePercent: null }, // filled after health
    { key: "growth_rate", label: "קצב צמיחה", value: bm.get("opportunities") ?? 0, format: "percent", flow: false, changePercent: null },
    { key: "conversion_rate", label: "שיעור המרה", value: round((agents.reduce((s, a) => s + a.conversionRate, 0) / Math.max(1, agents.length)) * 100, 0), format: "percent", flow: false, changePercent: null },
    { key: "exclusive_growth", label: "צמיחת בלעדיות", value: bm.get("exclusives") ?? 0, format: "percent", flow: false, changePercent: bm.get("exclusives") ?? null },
    { key: "buyer_growth", label: "צמיחת קונים", value: bm.get("buyerMatches") ?? 0, format: "percent", flow: false, changePercent: bm.get("buyerMatches") ?? null },
    { key: "seller_growth", label: "צמיחת מוכרים", value: bm.get("opportunities") ?? 0, format: "percent", flow: false, changePercent: null },
    { key: "market_share_trend", label: "מגמת נתח שוק", value: marketShareTrend, format: "percent", flow: false, changePercent: null },
    { key: "credits_saved", label: "קרדיטים שנחסכו", value: k.creditsSaved, format: "int", flow: true, changePercent: null },
    { key: "automation_savings", label: "חיסכון אוטומציה (שעות)", value: journey.hoursSaved, format: "int", flow: false, changePercent: null },
    { key: "ai_time_saved", label: "זמן AI נחסך (שעות)", value: round(journey.callsSaved * 0.2, 1), format: "int", flow: false, changePercent: null },
  ];

  // ── Pipeline (derived from current aggregates) ───────────────────────────--
  const pipeline = buildPipeline({
    opportunity: k.sellerOpportunities, contact: k.callsToday + k.whatsappsToday, meeting: k.meetingsToday,
    negotiation: k.dealsInProgress, exclusive: k.exclusiveListings, marketing: k.activeListings,
    buyerMatch: k.buyerMatchesToday, showing: k.perfectMatches, offer: k.hotDeals, deal: k.dealsInProgress, closed: 0,
    pipelineValue: k.estimatedPipeline,
  });

  // ── Forecast (executive) ─────────────────────────────────────────────────--
  const forecast = forecastExecutive({
    likelyExclusives: fc.likelyExclusives, likelyDeals: fc.likelyDeals, likelyMeetings: fc.likelyMeetings,
    pipelineValue: fc.pipelineValue, estimatedCommission: fc.estimatedCommission, officeConfidencePct: fc.confidencePct,
    baseAssumptions: fc.assumptions, newListingsThisWeek: k.newListingsToday * 7, sellerOpportunities: k.sellerOpportunities,
    buyerMatchesToday: k.buyerMatchesToday, monitoredListings: k.externalListingsMonitored, marketEventsToday: k.priceDropsToday + k.backOnMarket + k.hotDeals,
  });

  // ── Revenue ──────────────────────────────────────────────────────────────--
  const ignoredHot = agents.reduce((s, a) => s + a.ignoredHotOpportunities, 0);
  const avgDealValue = k.dealsInProgress > 0 ? k.estimatedPipeline / k.dealsInProgress : k.estimatedPipeline / 10;
  const byAgent: RevenueShareInput[] = agents.slice(0, 25).map((a) => ({ key: a.agentId, label: a.name, pipelineValue: a.estimatedPipeline }));
  const byArea: RevenueShareInput[] = office.marketShare.slice(0, 15).map((m) => ({ key: m.city, label: m.city, pipelineValue: m.officeListings * (avgDealValue || 1) }));
  const bySource: RevenueShareInput[] = [
    { key: "private", label: "פרטי", pipelineValue: k.privateListings * (avgDealValue || 1) },
    { key: "external", label: "מודעות חיצוניות", pipelineValue: Math.max(0, k.activeListings - k.privateListings) * (avgDealValue || 1) },
  ];
  const revenue = computeRevenue({
    expectedRevenue: fc.pipelineValue, lostOpportunityValue: ignoredHot * avgDealValue,
    atRiskValue: office.risks.filter((r) => r.severity === "high" || r.severity === "urgent").length * avgDealValue,
    byAgent, byArea, byPropertyType: [], bySource,
  });

  // ── ROI ──────────────────────────────────────────────────────────────────--
  const roi = computeRoi({ counts: {
    calls: k.callsToday, meetings: k.meetingsToday, whatsapps: k.whatsappsToday,
    ai_copilot: journey.callsSaved, journey_automation: journey.tasksAutomated, property_radar: k.duplicateScansAvoided,
    marketing: 0, lead_sources: k.buyerMatchesToday, office_time: k.tasksDue,
  } });

  // ── Productivity (per agent) ─────────────────────────────────────────────--
  const productivity: AgentProductivity[] = agents.slice(0, 30).map((a) => computeAgentProductivity({
    agentId: a.agentId, name: a.name, calls: a.calls, whatsapps: a.whatsapps, meetings: a.meetings,
    tasksCompleted: a.tasksCompleted, exclusivesSigned: a.exclusivesSigned, automationSteps: 0, aiGenerations: 0,
    totalActions: a.calls + a.whatsapps + a.meetings + a.tasksCompleted,
  }));

  // ── Health ───────────────────────────────────────────────────────────────--
  const avgResp = agents.map((a) => a.avgResponseHours).filter((x): x is number => x != null);
  const avgRespHours = avgResp.length ? avgResp.reduce((s, h) => s + h, 0) / avgResp.length : null;
  const health = computeHealthScore({
    pipeline_health: clamp(k.dealsInProgress * 12, 0, 100),
    task_discipline: clamp(100 - k.overdueTasks * 5, 0, 100),
    response_time: avgRespHours == null ? 50 : clamp(100 - (avgRespHours - 1) * 6, 0, 100),
    buyer_activity: clamp(k.buyerMatchesToday * 8, 0, 100),
    seller_activity: clamp(k.sellerOpportunities * 4, 0, 100),
    exclusive_growth: clamp(k.exclusiveListings * 6, 0, 100),
    opportunity_handling: clamp(100 - ignoredHot * 12, 0, 100),
    automation_usage: clamp(journey.automationSuccessPct, 0, 100),
    provider_quality: clamp(k.providerQualityScore, 0, 100),
  });
  base.find((b) => b.key === "health_score")!.value = health.total;

  // ── Risk forecast ────────────────────────────────────────────────────────--
  const risks = forecastRisks({
    pipelineValue: k.estimatedPipeline, atRiskValue: revenue.revenueAtRisk, dealsInProgress: k.dealsInProgress,
    stuckDeals: office.risks.filter((r) => r.type === "deal_stuck").length, ignoredHotOpportunities: ignoredHot,
    sellersNotContacted: office.risks.filter((r) => r.type === "seller_not_contacted").length,
    sellersLikelyLost: office.risks.filter((r) => r.type === "seller_likely_lost").length,
    buyersGoingCold: office.risks.filter((r) => r.type === "buyer_cold").length,
    inactiveAgents: agents.filter((a) => a.calls + a.whatsapps + a.meetings === 0).length,
    overdueTasks: k.overdueTasks, agentsCount: Math.max(1, agents.length),
    providerDegraded: k.providerQualityScore < 60, creditsRemaining: Math.max(0, 1000 - k.creditsUsed), creditsBudget: 1000,
  });

  // ── Benchmarks ───────────────────────────────────────────────────────────--
  const benchmarks: Benchmark[] = office.benchmarks.map((b) => ({
    metric: b.metric, label: b.label, current: b.current, baseline: b.previous, deltaPct: b.deltaPct,
    direction: b.direction === "flat" ? "flat" : b.direction,
  }));

  // ── Timeline ─────────────────────────────────────────────────────────────--
  const timeline: TimelineEvent[] = buildTimeline(benchmarks, health.total, journey, k);

  // ── Map points ───────────────────────────────────────────────────────────--
  const mapPoints: ExecMapPoint[] = office.mapPoints.slice(0, 250).map((p) => ({
    id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone,
    weightByLayer: { opportunity: 1, revenue: avgDealValue > 0 ? 1 : 0, buyer: k.buyerMatchesToday > 0 ? 1 : 0, seller: 1 },
  }));

  const summary = [
    `הכנסה צפויה: ₪${Math.round(fc.pipelineValue).toLocaleString("he-IL")} · עמלה: ₪${Math.round(fc.estimatedCommission).toLocaleString("he-IL")} (ודאות ${fc.confidencePct}%).`,
    `בריאות המשרד: ${health.total}/100 (${health.band}).`,
    risks[0] ? `סיכון מוביל: ${risks[0].label} (${risks[0].scorePercent}%).` : "אין סיכונים מהותיים פעילים.",
    `חיסכון אוטומציה: ${journey.hoursSaved} שעות · ${roi.totalHoursSaved} שעות סה״כ ROI.`,
  ];

  return {
    role: office.role === "manager" ? "manager" : office.role === "office_owner" ? "office_owner" : "enterprise_admin",
    generatedAt: new Date().toISOString(),
    kpis: expandKpis(base), pipeline, forecast, revenue, roi, productivity, health, risks, timeline, benchmarks, mapPoints, summary,
  };
}

function buildTimeline(benchmarks: Benchmark[], health: number, journey: { hoursSaved: number }, k: { priceDropsToday: number }): TimelineEvent[] {
  const now = new Date().toISOString();
  const out: TimelineEvent[] = [];
  const rev = benchmarks.find((b) => b.metric === "revenue");
  if (rev?.deltaPct != null) out.push({ kind: "revenue", title: rev.deltaPct >= 0 ? "תחזית ההכנסות עלתה" : "תחזית ההכנסות ירדה", direction: rev.direction, detail: `${rev.deltaPct}% מול התקופה הקודמת`, at: now });
  const deals = benchmarks.find((b) => b.metric === "deals");
  if (deals?.deltaPct != null && deals.deltaPct < 0) out.push({ kind: "pipeline", title: "הפייפליין נחלש", direction: "down", detail: `${deals.deltaPct}% עסקאות`, at: now });
  if (journey.hoursSaved > 0) out.push({ kind: "automation", title: "זינוק באוטומציה", direction: "up", detail: `${journey.hoursSaved} שעות נחסכו`, at: now });
  if (k.priceDropsToday >= 3) out.push({ kind: "market", title: "תזוזת שוק", direction: "flat", detail: `${k.priceDropsToday} ירידות מחיר היום`, at: now });
  out.push({ kind: "health", title: health >= 70 ? "המשרד במצב בריא" : "בריאות המשרד דורשת תשומת לב", direction: health >= 70 ? "up" : "down", detail: `ציון ${health}/100`, at: now });
  return out;
}

/** Sanitized context for the AI executive brief (numbers only — no PII). */
export async function buildExecutiveContext(): Promise<Record<string, unknown>> {
  const d = await composeExecutiveDashboard();
  return {
    kpis: Object.fromEntries(d.kpis.month.map((x) => [x.key, x.value])),
    forecast: d.forecast, health: { total: d.health.total, band: d.health.band },
    revenue: { expected: d.revenue.expectedRevenue, commission: d.revenue.expectedCommission, atRisk: d.revenue.revenueAtRisk, lost: d.revenue.lostRevenue },
    topRisks: d.risks.slice(0, 5).map((r) => ({ label: r.label, score: r.scorePercent })),
    roiHours: d.roi.totalHoursSaved,
  };
}

export { composeExecutiveDashboard as default };

/** Daily snapshot job. */
export async function runBiSnapshotJob(): Promise<{ ok: boolean }> {
  const { getExecAccess } = await import("./permissions");
  const { createBiRepository } = await import("./repository");
  const { buildSnapshotPayload } = await import("./snapshots");
  const access = await getExecAccess();
  const d = await composeExecutiveDashboard();
  await createBiRepository(access.db).saveSnapshot(access.orgId, buildSnapshotPayload(d));
  return { ok: true };
}
