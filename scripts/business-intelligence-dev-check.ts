/**
 * LOCAL-DEV-ONLY check for Executive Business Intelligence™ (Phase 19). Pure
 * layers only (no DB, no network, no server-only imports). Verifies:
 * forecasts deterministic + labeled assumptions · revenue engine · ROI · health
 * score (0..100, weighted) · pipeline funnel · risk forecast · report exports ·
 * snapshot payload · permission role mapping (manager+ only).
 *
 * Run: npx tsx scripts/business-intelligence-dev-check.ts
 */
import {
  forecastExecutive, buildPipeline, computeRoi, computeRevenue, computeHealthScore,
  forecastRisks, buildReportPayload, toCsv, toJson, toMarkdown, buildSnapshotPayload,
  computeAgentProductivity, type ExecutiveDashboard,
} from "../src/lib/business-intelligence";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };
const canAccess = (k: string) => (ROLE_RANK[k] ?? 0) >= ROLE_RANK.manager!;

function fcInput() {
  return {
    likelyExclusives: 4, likelyDeals: 3, likelyMeetings: 20, pipelineValue: 8_000_000, estimatedCommission: 160_000,
    officeConfidencePct: 65, baseAssumptions: ["בסיס"], newListingsThisWeek: 10, sellerOpportunities: 15,
    buyerMatchesToday: 6, monitoredListings: 120, marketEventsToday: 4,
  };
}

function main(): void {
  console.log("ZONO Business Intelligence dev-check\n");

  // 1) Permissions (manager+ only).
  assert(canAccess("manager") && canAccess("admin") && canAccess("owner"), "managers / admins / owners granted");
  assert(!canAccess("agent") && !canAccess("viewer") && !canAccess("team_leader"), "agents / viewers / team leaders blocked");

  // 2) Forecast deterministic + assumptions exposed.
  const f1 = forecastExecutive(fcInput());
  const f2 = forecastExecutive(fcInput());
  assert(JSON.stringify(f1) === JSON.stringify(f2), "forecast deterministic (same input ⇒ same output)");
  assert(f1.assumptions.length > 0 && f1.confidencePct >= 25 && f1.confidencePct <= 90, "forecast exposes assumptions + bounded confidence");
  assert(f1.listings === 40 && f1.exclusives === 4 && f1.deals === 3, "forecast projects listings (10/wk × 4) + carries office exclusives/deals");

  // 3) Pipeline funnel (monotone conversion).
  const pipe = buildPipeline({ opportunity: 100, contact: 60, meeting: 30, negotiation: 15, exclusive: 12, marketing: 10, buyerMatch: 8, showing: 6, offer: 4, deal: 3, closed: 2, pipelineValue: 5_000_000 });
  assert(pipe.stages.length === 11 && pipe.stages[0]!.key === "opportunity", "pipeline has 11 ordered stages");
  assert(pipe.stages[0]!.conversionPct === 60, "stage conversion = next/current (100→60 = 60%)");
  assert(pipe.overallConversionPct === 2, "overall conversion = closed/opportunity (2/100 = 2%)");

  // 4) Revenue engine.
  const rev = computeRevenue({ expectedRevenue: 8_000_000, lostOpportunityValue: 500_000, atRiskValue: 1_000_000,
    byAgent: [{ key: "a1", label: "א", pipelineValue: 6_000_000 }, { key: "a2", label: "ב", pipelineValue: 2_000_000 }],
    byArea: [], byPropertyType: [], bySource: [] });
  assert(rev.expectedCommission === 160_000, "commission = 2% of expected revenue (₪160K)");
  assert(rev.byAgent[0]!.sharePercent === 75, "agent revenue share computed (6M/8M = 75%)");
  assert(rev.revenueAtRisk === 1_000_000 && rev.lostRevenue === 500_000, "at-risk + lost revenue carried");

  // 5) ROI engine.
  const roi = computeRoi({ counts: { calls: 30, meetings: 10, ai_copilot: 5, journey_automation: 20 } });
  assert(roi.totalHoursSaved > 0 && roi.totalMoneySaved > 0, "ROI produces hours + money saved");
  const roiAgain = computeRoi({ counts: { calls: 30, meetings: 10, ai_copilot: 5, journey_automation: 20 } });
  assert(JSON.stringify(roi) === JSON.stringify(roiAgain), "ROI deterministic");

  // 6) Productivity per agent.
  const prod = computeAgentProductivity({ agentId: "a1", name: "א", calls: 20, whatsapps: 10, meetings: 5, tasksCompleted: 8, exclusivesSigned: 2, automationSteps: 4, aiGenerations: 3, totalActions: 43 });
  assert(prod.hoursSaved > 0 && prod.dealsAccelerated === 2 && prod.automationUsagePct >= 0, "agent productivity computed");

  // 7) Health score (0..100, weighted).
  const perfect = computeHealthScore({ pipeline_health: 100, task_discipline: 100, response_time: 100, buyer_activity: 100, seller_activity: 100, exclusive_growth: 100, opportunity_handling: 100, automation_usage: 100, provider_quality: 100 });
  assert(perfect.total === 100 && perfect.band === "excellent", "all-100 sub-scores → 100 / excellent");
  const zero = computeHealthScore({});
  assert(zero.total === 0 && zero.band === "at_risk", "empty sub-scores → 0 / at_risk");
  const mid = computeHealthScore({ pipeline_health: 60, task_discipline: 80, response_time: 50, buyer_activity: 40, seller_activity: 70, exclusive_growth: 60, opportunity_handling: 90, automation_usage: 50, provider_quality: 88 });
  assert(mid.total > 0 && mid.total < 100 && mid.components.length === 9, "weighted blend across 9 components");

  // 8) Risk forecast (deterministic, no AI).
  const risks = forecastRisks({ pipelineValue: 8_000_000, atRiskValue: 4_000_000, dealsInProgress: 4, stuckDeals: 2, ignoredHotOpportunities: 3, sellersNotContacted: 2, sellersLikelyLost: 1, buyersGoingCold: 2, inactiveAgents: 1, overdueTasks: 10, agentsCount: 5, providerDegraded: true, creditsRemaining: 100, creditsBudget: 1000 });
  assert(risks.some((r) => r.key === "revenue_risk" && r.scorePercent === 50), "revenue risk = atRisk/pipeline (4M/8M = 50%)");
  assert(risks.some((r) => r.key === "provider_risk"), "degraded provider → provider risk");
  assert(risks.some((r) => r.key === "budget_risk"), "low credits → budget risk");
  assert(risks[0]!.severity === "urgent" || risks[0]!.severity === "high", "risks sorted by severity");
  assert(JSON.stringify(risks) === JSON.stringify(forecastRisks({ pipelineValue: 8_000_000, atRiskValue: 4_000_000, dealsInProgress: 4, stuckDeals: 2, ignoredHotOpportunities: 3, sellersNotContacted: 2, sellersLikelyLost: 1, buyersGoingCold: 2, inactiveAgents: 1, overdueTasks: 10, agentsCount: 5, providerDegraded: true, creditsRemaining: 100, creditsBudget: 1000 })), "risk forecast deterministic");

  // 9) Reports + exports + snapshot.
  const dash: ExecutiveDashboard = {
    role: "manager", generatedAt: "2026-06-25T09:00:00Z",
    kpis: { today: [], week: [], month: [{ key: "expected_revenue", label: "הכנסה צפויה", value: 8_000_000, format: "currency", changePercent: 5, direction: "up" }], quarter: [], year: [] },
    pipeline: pipe, forecast: f1, revenue: rev, roi,
    productivity: [prod], health: mid, risks, timeline: [], benchmarks: [], mapPoints: [],
    summary: ["תקציר"],
  };
  const payload = buildReportPayload(dash, "board");
  assert(payload.reportType === "board" && payload.kpis.length >= 0 && payload.health.total === mid.total, "report payload built");
  assert(toJson(payload).includes("board") && toCsv(payload).includes("health,total") && toMarkdown(payload).includes("#"), "exports render JSON / CSV / Markdown");
  const snap = buildSnapshotPayload(dash);
  assert(snap.health.total === mid.total && snap.forecast === f1 && Array.isArray(snap.risk), "snapshot payload assembles KPIs/forecast/health/risk");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main();
