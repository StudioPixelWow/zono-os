/**
 * LOCAL-DEV-ONLY check for Office Intelligence™ (Phase 16). Pure layers only
 * (no DB, no network, no server-only imports). Verifies the deterministic
 * executive operating system: KPI cards · quality-weighted leaderboard (stable,
 * deterministic) · risk detection (ignored hot opportunities) · coaching items ·
 * deterministic forecasting with labeled assumptions · period benchmarks · goal
 * progress + pace · market-share estimate labeling · role-rank gating logic.
 * The AI layer NEVER replaces these calculations — it only summarizes them.
 *
 * Run: npx tsx scripts/office-intelligence-dev-check.ts
 */
import {
  buildKpiCards, computeLeaderboardScore, scoreAgent, responseRateScore, rankLeaderboard,
  forecastOffice, buildBenchmarks, deriveCoachingItems, detectOfficeRisks, computeGoalProgress,
  computeMarketShareEstimates,
} from "../src/lib/office-intelligence";
import type { AgentMetrics, OfficeKpis } from "../src/lib/office-intelligence/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

// Mirror of permissions.ts rank table (server-only module can't be imported under tsx).
const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };
const MIN_RANK = ROLE_RANK.manager!;
const canAccess = (key: string) => (ROLE_RANK[key] ?? 0) >= MIN_RANK;

function agent(over: Partial<AgentMetrics> = {}): AgentMetrics {
  return {
    agentId: "a1", name: "סוכן", activeListings: 5, listingsContacted: 4, privateListingsContacted: 1,
    exclusiveOpportunitiesHandled: 2, exclusivesSigned: 1, buyerMatchesCreated: 3, perfectMatchesHandled: 1,
    calls: 8, whatsapps: 5, meetings: 2, tasksCompleted: 6, overdueTasks: 0, avgResponseHours: 2,
    conversionRate: 0.3, followUpDiscipline: 0.7, avgOpportunityScore: 60, avgExclusiveProbability: 55,
    estimatedPipeline: 2_000_000, estimatedCommission: 40_000, trendVsLastWeek: 0.2, ignoredHotOpportunities: 0,
    leaderboardScore: 0, ...over,
  };
}

function kpis(over: Partial<OfficeKpis> = {}): OfficeKpis {
  return {
    activeListings: 40, externalListingsMonitored: 120, privateListings: 18, exclusiveListings: 12, newListingsToday: 6,
    priceDropsToday: 3, hotDeals: 4, backOnMarket: 1, buyerMatchesToday: 9, perfectMatches: 2, sellerOpportunities: 15,
    highExclusiveProbability: 5, callsToday: 30, whatsappsToday: 22, meetingsToday: 7, tasksDue: 12, overdueTasks: 4,
    dealsInProgress: 3, estimatedPipeline: 9_000_000, estimatedCommission: 180_000, creditsUsed: 200, creditsSaved: 60,
    duplicateScansAvoided: 14, providerQualityScore: 88, ...over,
  };
}

function main(): void {
  console.log("ZONO Office Intelligence dev-check\n");

  // 1) Role gating (managers+ only) — mirrors assertOfficeIntelligenceAccess.
  assert(!canAccess("agent") && !canAccess("viewer") && !canAccess("team_leader"), "agents / viewers / team_leaders are blocked");
  assert(canAccess("manager") && canAccess("admin") && canAccess("owner"), "managers and above are granted access");

  // 2) KPI cards build with labels + order + change %.
  const cards = buildKpiCards(kpis(), kpis({ activeListings: 32 }));
  assert(cards.length >= 12 && cards.every((c) => c.label.length > 0), "KPI cards built with Hebrew labels");
  const listingsCard = cards.find((c) => c.key === "activeListings")!;
  assert(listingsCard.value === 40 && listingsCard.changeVsYesterday === 25, "KPI change vs yesterday computed (32→40 = +25%)");

  // 3) Leaderboard scoring is deterministic + quality-weighted.
  const s1 = scoreAgent(agent()), s2 = scoreAgent(agent());
  assert(s1 === s2, "scoreAgent deterministic (same input ⇒ same score)");
  const signer = scoreAgent(agent({ exclusivesSigned: 2 }));
  const caller = scoreAgent(agent({ exclusivesSigned: 0, calls: 40 }));
  assert(signer > caller, "quality (signed exclusives) outranks raw call volume");
  assert(responseRateScore(1) === 1 && responseRateScore(24) === 0 && responseRateScore(null) === 0.5, "responseRateScore bounds (fast=1, slow=0, unknown=0.5)");
  const penalized = computeLeaderboardScore({ exclusivesSigned: 1, meetings: 2, sellerContacts: 4, perfectMatchesHandled: 1, tasksCompleted: 6, responseRateScore: 0.9, conversionRate: 0.3, overdueTasks: 10, ignoredHotOpportunities: 3 });
  const clean = computeLeaderboardScore({ exclusivesSigned: 1, meetings: 2, sellerContacts: 4, perfectMatchesHandled: 1, tasksCompleted: 6, responseRateScore: 0.9, conversionRate: 0.3, overdueTasks: 0, ignoredHotOpportunities: 0 });
  assert(penalized < clean, "overdue tasks + ignored hot opportunities penalize the score");

  // 4) Ranking + buckets.
  const board = rankLeaderboard([
    agent({ agentId: "a1", name: "טובה", exclusivesSigned: 3, trendVsLastWeek: 0.4 }),
    agent({ agentId: "a2", name: "באמצע", exclusivesSigned: 1 }),
    agent({ agentId: "a3", name: "בסיכון", exclusivesSigned: 0, calls: 0, whatsapps: 0, meetings: 0, overdueTasks: 7, ignoredHotOpportunities: 2 }),
  ]);
  assert(board.ranked[0]!.agentId === "a1", "top of leaderboard is the best performer");
  assert(board.topPerformers.length === 3 && board.risingAgents.some((a) => a.agentId === "a1"), "buckets: top performers + rising agents");
  assert(board.needingAttention.some((a) => a.agentId === "a3"), "needingAttention surfaces inactive/overdue agent");

  // 5) Risk center detects ignored hot opportunities (the money leak).
  const risks = detectOfficeRisks({
    ignoredHotOpportunities: 6, sellersNotContacted: 12, perfectMatchesUnhandled: 2, overdueFollowups: 4, dealsStuck: 1,
    staleListings: 3, providerDegraded: false, creditsRemaining: 100, creditsBudget: 1000, inactiveAgents: 1, buyersGoingCold: 2, sellersLikelyLost: 1,
  });
  const hot = risks.find((r) => r.type === "hot_opportunity_ignored");
  assert(!!hot && hot.severity === "urgent", "ignored hot opportunities → urgent risk");
  assert(risks[0]!.severity === "urgent", "risks sorted by severity (urgent first)");
  assert(detectOfficeRisks({ ignoredHotOpportunities: 0, sellersNotContacted: 0, perfectMatchesUnhandled: 0, overdueFollowups: 0, dealsStuck: 0, staleListings: 0, providerDegraded: false, creditsRemaining: 1000, creditsBudget: 1000, inactiveAgents: 0, buyersGoingCold: 0, sellersLikelyLost: 0 }).length === 0, "healthy office → zero risks");

  // 6) Coaching engine creates specific items.
  const coaching = deriveCoachingItems([
    agent({ agentId: "c1", name: "עומס", overdueTasks: 13 }),
    agent({ agentId: "c2", name: "פספוס", ignoredHotOpportunities: 6 }),
    agent({ agentId: "c3", name: "כוכב", conversionRate: 0.5, exclusivesSigned: 2 }),
  ]);
  assert(coaching.some((c) => c.itemType === "overdue_tasks" && c.severity === "high"), "coaching: high-severity overdue tasks");
  assert(coaching.some((c) => c.itemType === "missed_opportunity" && c.severity === "urgent"), "coaching: urgent missed opportunity");
  assert(coaching.some((c) => c.itemType === "high_potential"), "coaching: high-potential agent recognized");
  assert(coaching[0]!.severity === "urgent", "coaching sorted by severity");

  // 7) Deterministic forecasting with labeled assumptions (no fabricated certainty).
  const fThin = forecastOffice({ probabilitySum: 4.2, highProbabilityCount: 3, totalOpportunities: 10, dealsInProgress: 2, pipelineValue: 8_000_000, meetingsLast30: null, historicalConversion: null });
  assert(fThin.likelyExclusives === 4 && fThin.assumptions.length > 0, "forecast computes likely exclusives + labels assumptions");
  assert(fThin.confidencePct >= 25 && fThin.confidencePct <= 90, "forecast confidence within [25, 90]");
  const fRich = forecastOffice({ probabilitySum: 4.2, highProbabilityCount: 3, totalOpportunities: 30, dealsInProgress: 2, pipelineValue: 8_000_000, meetingsLast30: 40, historicalConversion: 0.3 });
  assert(fRich.confidencePct > fThin.confidencePct, "more data + history → higher confidence");
  const fA = forecastOffice({ probabilitySum: 4.2, highProbabilityCount: 3, totalOpportunities: 10, dealsInProgress: 2, pipelineValue: 8_000_000, meetingsLast30: null, historicalConversion: null });
  assert(JSON.stringify(fA) === JSON.stringify(fThin), "forecast deterministic for identical input");

  // 8) Benchmarks compare current vs previous period.
  const bm = buildBenchmarks({ deals: 12, revenue: 200000 }, { deals: 10, revenue: 250000 });
  const deals = bm.find((b) => b.metric === "deals")!;
  const revenue = bm.find((b) => b.metric === "revenue")!;
  assert(deals.direction === "up" && deals.deltaPct === 20, "benchmark up (deals 10→12 = +20%)");
  assert(revenue.direction === "down", "benchmark down (revenue dropped)");

  // 9) Goal progress + pace.
  const now = Date.parse("2026-06-15T00:00:00Z");
  const ahead = computeGoalProgress({ id: "g1", goalType: "exclusives", period: "monthly", target: 10, current: 8, startsAt: "2026-06-01T00:00:00Z", endsAt: "2026-06-30T00:00:00Z", ownerName: null }, now);
  assert(ahead.percent === 80 && ahead.status === "ahead", "goal ahead of pace (80% with ~half month elapsed)");
  const behind = computeGoalProgress({ id: "g2", goalType: "meetings", period: "monthly", target: 10, current: 1, startsAt: "2026-06-01T00:00:00Z", endsAt: "2026-06-30T00:00:00Z", ownerName: null }, now);
  assert(behind.status === "behind", "goal behind pace");
  assert(computeGoalProgress({ id: "g3", goalType: "calls", period: "daily", target: 0, current: 0, startsAt: null, endsAt: null, ownerName: null }).status === "no_target", "no target → no_target status");

  // 10) Market share is an honest estimate with completeness/confidence.
  const share = computeMarketShareEstimates([
    { city: "חיפה", officeListings: 20, monitoredListings: 80 },
    { city: "עכו", officeListings: 2, monitoredListings: 10 },
  ]);
  assert(share[0]!.city === "חיפה" && share[0]!.sharePercent === 25, "market share = office / monitored (25%)");
  assert(share[0]!.confidence === "high" && share[1]!.confidence === "low", "market-share confidence reflects data completeness");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main();
