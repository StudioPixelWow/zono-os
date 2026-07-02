// ============================================================================
// ✅ Office Growth Agent — self-tests (pure, offline). 29.7. Part 11.
// Scenarios: Growing / Declining / No Inventory / Too Many Listings / Strong
// Competition / Weak Competition / Missing Brokers / Strong Territory / Weak
// Territory / Luxury Expansion / Commercial Expansion — plus the agent emitting
// strategy + decision proposals (nothing auto-executes).
// ============================================================================
import { buildOfficeScorecard } from "./scorecard";
import { officeGrowthAgent } from "./agent";
import type { OfficeSignals } from "./types";

export interface OACheck { name: string; pass: boolean; detail: string }
export interface OASelfCheck { ok: boolean; total: number; passed: number; checks: OACheck[] }

const sig = (over: Partial<OfficeSignals> = {}): OfficeSignals => ({
  id: "ORG1", name: "תיווך זונו",
  offices: 3, brokers: 12, activeListings: 60, activeCities: 4, brands: 1,
  agentsWithOffice: 12, dataQualityScore: 70,
  businessScore: 62, executionScore: 60, aiConfidence: 65,
  avgBusinessScore: 60, avgConfidence: 62, citiesAnalyzed: 4, decliningCities: 0,
  missions: { active: 20, completed: 40, cancelled: 3, blocked: 2, waiting: 2, inProgress: 6, executionScore: 60, completionRatePct: 65 },
  buyerPipeline: { total: 30, hot: 8, cold: 5, closing: 4, withMatches: 12 },
  sellerPipeline: { total: 20, hot: 6, atRisk: 3, readyToSign: 5, priceIssues: 2, withBuyers: 7 },
  leadPipeline: { total: 40, hot: 10, duplicates: 3, convertReady: 9, nurture: 6, humanReview: 2 },
  listingPipeline: { total: 60, healthy: 40, critical: 4, luxury: 10, stale: 6, highOpportunity: 8 },
  cityInventory: [{ city: "תל אביב", listings: 30 }, { city: "רמת גן", listings: 18 }, { city: "גבעתיים", listings: 10 }, { city: "בת ים", listings: 2 }],
  commercialListings: 3,
  brokerCards: [
    { name: "דנה", status: "ACTIVE", activeListings: 12, recentListings: 4, office: "ראשי" },
    { name: "יוסי", status: "ACTIVE", activeListings: 9, recentListings: 3, office: "ראשי" },
    { name: "מאיה", status: "LOW_ACTIVITY", activeListings: 3, recentListings: 0, office: "ראשי" },
    { name: "רון", status: "INACTIVE", activeListings: 0, recentListings: 0, office: "צפון" },
  ],
  competitive: { growingCompetitors: [], decliningCompetitors: [], inventoryTrendPct: 4, emergingAreas: [], topOfficeSharePct: 22, marketConcentration: 1800 },
  strongAreas: ["מרכז העיר"], weakAreas: ["דרום"], truthScore: 68, ...over,
});

export function runSelfCheck(): OASelfCheck {
  const checks: OACheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const card = (o: Partial<OfficeSignals>) => buildOfficeScorecard(sig(o));
  const hasInv = (c: ReturnType<typeof card>, t: string) => c.inventory.some((f) => f.type === t);
  const hasBroker = (c: ReturnType<typeof card>, t: string) => c.brokerFindings.some((f) => f.type === t);
  const hasComp = (c: ReturnType<typeof card>, t: string) => c.competitive.some((f) => f.type === t);
  const hasDec = (c: ReturnType<typeof card>, t: string) => c.decisions.some((d) => d.type === t);

  const base = card({});
  add("scorecard full model", typeof base.health.businessHealth === "number" && !!base.strategy.recommendedStrategy && base.aiRecommendation.length > 0 && base.pipeline.stages.length === 5, "");
  add("health has 10 metrics", ["businessHealth", "growthHealth", "inventoryHealth", "buyerPipelineHealth", "sellerPipelineHealth", "leadPipelineHealth", "brokerProductivity", "marketPosition", "expansionReadiness", "businessConfidence"].every((k) => typeof (base.health as unknown as Record<string, number>)[k] === "number"), "");

  // 1. Growing office.
  const growing = card({ businessScore: 78, avgBusinessScore: 75, competitive: { ...sig().competitive, inventoryTrendPct: 15 } });
  add("growing → healthy + growthHealth high", ["מצוינת", "בריאה"].includes(growing.health.label) && growing.growthScore >= 60, growing.health.label);

  // 2. Declining office.
  const declining = card({ businessScore: 38, avgBusinessScore: 35, decliningCities: 3, competitive: { ...sig().competitive, inventoryTrendPct: -14, growingCompetitors: [{ name: "רימקס", city: "תל אביב", growthPct: 35 }] } });
  add("declining → lost share + defend", hasComp(declining, "lost_market_share") && (declining.strategy.recommendedStrategy === "DEFEND_TERRITORY"), declining.strategy.recommendedStrategy);

  // 3. No inventory.
  const noInv = card({ activeListings: 4, listingPipeline: { total: 4, healthy: 2, critical: 0, luxury: 0, stale: 0, highOpportunity: 1 }, cityInventory: [{ city: "תל אביב", listings: 4 }], commercialListings: 0 });
  add("no inventory → shortage + acquire", hasInv(noInv, "inventory_shortage") && (noInv.strategy.recommendedStrategy === "ACQUIRE_INVENTORY" || hasDec(noInv, "EXPAND") || hasInv(noInv, "missing_luxury")), noInv.strategy.recommendedStrategy);

  // 4. Too many listings (overload).
  const overloaded = card({ brokers: 4, activeListings: 80, listingPipeline: { total: 80, healthy: 30, critical: 8, luxury: 10, stale: 30, highOpportunity: 5 } });
  add("too many listings → surplus/recruit", (hasInv(overloaded, "inventory_surplus") || hasBroker(overloaded, "recruitment_need")) && (overloaded.strategy.recommendedStrategy === "RECRUIT_BROKERS" || hasDec(overloaded, "RECRUIT")), overloaded.strategy.recommendedStrategy);

  // 5. Strong competition.
  const strongComp = card({ competitive: { growingCompetitors: [{ name: "אנגלו", city: "תל אביב", growthPct: 40 }, { name: "רימקס", city: "רמת גן", growthPct: 32 }], decliningCompetitors: [], inventoryTrendPct: -3, emergingAreas: [], topOfficeSharePct: 15, marketConcentration: 3000 } });
  add("strong competition → growing competitor + threat", hasComp(strongComp, "growing_competitor") && hasComp(strongComp, "competitive_threat"), "");

  // 6. Weak competition.
  const weakComp = card({ competitive: { growingCompetitors: [], decliningCompetitors: [{ name: "מתחרה חלש", city: "תל אביב", growthPct: -20 }], inventoryTrendPct: 6, emergingAreas: [{ title: "פלורנטין", area: "פלורנטין", evidence: "מומנטום גבוה" }], topOfficeSharePct: 30, marketConcentration: 1500 } });
  add("weak competition → weak_competitor + expansion opp", hasComp(weakComp, "weak_competitor") && hasComp(weakComp, "expansion_opportunity"), "");

  // 7. Missing brokers.
  const missingBrokers = card({ brokers: 0, agentsWithOffice: 0, brokerCards: [], activeListings: 20, listingPipeline: { total: 20, healthy: 10, critical: 2, luxury: 3, stale: 3, highOpportunity: 3 } });
  add("missing brokers → recruitment need + RECRUIT decision", hasBroker(missingBrokers, "recruitment_need") && hasDec(missingBrokers, "RECRUIT"), "");

  // 8. Strong territory.
  const strongTerr = card({ strongAreas: ["מרכז", "צפון ישן", "לב העיר"], weakAreas: [], cityInventory: [{ city: "תל אביב", listings: 50 }, { city: "רמת גן", listings: 8 }] });
  add("strong territory → strong_neighborhood", hasInv(strongTerr, "strong_neighborhood"), "");

  // 9. Weak territory.
  const weakTerr = card({ strongAreas: [], weakAreas: ["דרום", "מזרח", "פאתי העיר"] });
  add("weak territory → weak area + territory opportunity", hasInv(weakTerr, "weak_neighborhood") && hasComp(weakTerr, "territory_opportunity"), "");

  // 10. Luxury expansion.
  const luxury = card({ businessScore: 66, listingPipeline: { total: 40, healthy: 28, critical: 2, luxury: 0, stale: 4, highOpportunity: 6 } });
  add("luxury expansion → missing luxury + strategy/invest", hasInv(luxury, "missing_luxury") && (luxury.strategy.recommendedStrategy === "LUXURY_EXPANSION" || luxury.strategy.alternatives.includes("LUXURY_EXPANSION") || hasDec(luxury, "INVEST")), luxury.strategy.recommendedStrategy);

  // 11. Commercial expansion.
  const commercial = card({ businessScore: 66, commercialListings: 0, listingPipeline: { total: 40, healthy: 28, critical: 2, luxury: 8, stale: 4, highOpportunity: 6 } });
  add("commercial expansion → missing commercial + strategy/invest", hasInv(commercial, "missing_commercial") && (commercial.strategy.recommendedStrategy === "COMMERCIAL_EXPANSION" || commercial.strategy.alternatives.includes("COMMERCIAL_EXPANSION") || hasDec(commercial, "INVEST")), commercial.strategy.recommendedStrategy);

  // Broker performance detection on the base (has ACTIVE/LOW/INACTIVE cards).
  add("broker performance detected", hasBroker(base, "top_performer") && (hasBroker(base, "declining_broker") || hasBroker(base, "inactive_broker")), "");

  // Pipeline + playbook + meta.
  add("pipeline 5 stages + overallHealth", base.pipeline.stages.length === 5 && typeof base.pipeline.overallHealth === "number", "");
  add("playbook ordered + mission mapped", base.strategy.playbook.every((a, i) => a.order === i + 1 && !!a.missionType), "");
  add("decisions explain why", base.decisions.every((d) => d.why.length > 0 && d.evidence.length > 0), "");
  add("expansion strategies require approval", base.strategy.recommendedStrategy in { GROW_TERRITORY: 1, RECRUIT_BROKERS: 1, LUXURY_EXPANSION: 1, COMMERCIAL_EXPANSION: 1, ACQUIRE_INVENTORY: 1 } ? base.strategy.requiredApprovals.length > 0 : true, "");

  // Agent proposals — recommendation-only.
  const proposals = officeGrowthAgent.run({ now: Date.now(), orgId: "o", data: { offices: [sig({})] } });
  add("agent emits strategy mission proposal", proposals.some((p) => p.kind === "mission" && p.entityType === "office" && !!p.missionType), "");
  add("agent emits decision recommendations", proposals.some((p) => p.kind === "recommendation" && p.entityType === "office"), "");
  add("agent no auto-exec", officeGrowthAgent.permissions.includes("REQUEST_APPROVAL") && !officeGrowthAgent.permissions.includes("AUTO_EXECUTE"), "");
  add("empty offices → no proposals", officeGrowthAgent.run({ now: Date.now(), orgId: "o", data: {} }).length === 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
