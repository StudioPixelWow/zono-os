// ============================================================================
// ✅ Seller Intelligence Agent — self-tests (pure, offline). 29.5. Part 11.
// Scenarios: new / hot / cold / ready-to-sign / price-resistant / high-churn /
// luxury / weak-valuation / strong-demand / no-buyers — plus the agent emitting
// recommendation + mission proposals (nothing auto-executes).
// ============================================================================
import { buildSellerScorecard } from "./scorecard";
import { sellerAgent } from "./agent";
import type { SellerSignals, PropertyIntel, BuyerMatchInput } from "./types";

export interface SACheck { name: string; pass: boolean; detail: string }
export interface SASelfCheck { ok: boolean; total: number; passed: number; checks: SACheck[] }

const prop = (o: Partial<PropertyIntel> = {}): PropertyIntel => ({
  hasProperty: true, propertyId: "P1", status: "active", askingPrice: 2_000_000,
  valuationPosition: "within", valuationConfidence: "high", priceGapPct: 3,
  marketScore: 60, domBand: "normal", pricingHealth: 65, competitionPressure: 30, buyerDemandScore: 55, timeOnMarketDays: 20, campaignActive: true, ...o,
});
const buyer = (score: number): BuyerMatchInput => ({ buyerId: `B${score}`, name: `קונה ${score}`, score });

const sig = (over: Partial<SellerSignals> = {}): SellerSignals => ({
  id: "S1", name: "דוד מוכר",
  motivation: 55, trust: 60, priceExpectation: 2_000_000, priceGapPct: 3, urgency: 50, readinessToSign: 55, churnRisk: 30,
  sellerConfidence: 55, communicationHealth: 60, completeness: 70, decisionStyle: "מעורב", priceFlexibility: 55, hasSignedAgreement: false, objections: [],
  behavior: { calls: 2, meetings: 1, messages: 2, valuationsSent: 1, priceDiscussions: 0, objections: 0, documents: 0, visits: 0, agreements: 0, statusChanges: 0, followUps: 1 },
  healthScore: 60, healthLabel: "יציב", recencyScore: 70, engagementScore: 55, totalActivities: 6, lastActivityAt: "2026-06-30T00:00:00Z",
  relationshipDegree: 2, brokerConnections: ["מתווך A"], classification: ["מוכר חם"], learnings: [],
  lifecycleRoles: ["seller"], repeatSeller: false, formerBuyer: false, investor: false, lifecycleStage: "seller",
  property: prop(), matchingBuyers: [buyer(82)], truthScore: 65, ...over,
});

export function runSelfCheck(): SASelfCheck {
  const checks: SACheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const card = (o: Partial<SellerSignals>) => buildSellerScorecard(sig(o));
  const hasRisk = (c: ReturnType<typeof card>, t: string) => c.risks.some((r) => r.type === t);
  const hasOpp = (c: ReturnType<typeof card>, t: string) => c.opportunities.some((o) => o.type === t);

  const base = card({});
  add("scorecard full model", typeof base.health.sellerHealth === "number" && !!base.strategy.recommendedStrategy && Array.isArray(base.risks) && base.aiRecommendation.length > 0, "");
  add("health has 11 metrics", ["sellerHealth", "trust", "motivation", "readinessToSign", "readinessToSell", "communicationHealth", "relationshipHealth", "priceFlexibility", "churnRisk", "decisionConfidence"].every((k) => typeof (base.health as unknown as Record<string, number>)[k] === "number"), "");

  // New seller.
  const fresh = card({ totalActivities: 0, behavior: { calls: 0, meetings: 0, messages: 0, valuationsSent: 0, priceDiscussions: 0, objections: 0, documents: 0, visits: 0, agreements: 0, statusChanges: 0, followUps: 0 } });
  add("new seller → health 'חדש'", fresh.health.label === "חדש", fresh.health.label);

  // Hot / ready-to-sign.
  const ready = card({ readinessToSign: 80, matchingBuyers: [] });
  add("ready-to-sign → AGREEMENT + opportunity", ready.strategy.recommendedStrategy === "AGREEMENT" && hasOpp(ready, "ready_to_sign"), ready.strategy.recommendedStrategy);
  add("ready-to-sign high impact", ready.strategy.businessImpact === "high", "");

  // Cold seller.
  const cold = card({ motivation: 25, urgency: 25, classification: ["רדום"], recencyScore: 60, matchingBuyers: [] });
  add("cold seller → nurture", cold.strategy.recommendedStrategy === "LONG_TERM_NURTURE", cold.strategy.recommendedStrategy);

  // Price resistant (overpriced + weak market + inflexible) → PRICE_ALIGNMENT, not reduction.
  const resistant = card({ priceFlexibility: 20, property: prop({ valuationPosition: "above", valuationConfidence: "high", priceGapPct: 15, domBand: "slow", buyerDemandScore: 30 }) });
  add("price resistant → alignment not reduction", resistant.strategy.recommendedStrategy === "PRICE_ALIGNMENT" && hasRisk(resistant, "price_resistance"), resistant.strategy.recommendedStrategy);
  // Price flexible + overpriced + weak market → PRICE_REDUCTION.
  const flexible = card({ priceFlexibility: 70, matchingBuyers: [], property: prop({ valuationPosition: "above", valuationConfidence: "high", priceGapPct: 15, domBand: "slow", buyerDemandScore: 30 }) });
  add("price flexible + overpriced → PRICE_REDUCTION", flexible.strategy.recommendedStrategy === "PRICE_REDUCTION", flexible.strategy.recommendedStrategy);
  add("PRICE_REDUCTION requires seller approval", flexible.strategy.requiredApprovals.includes("מוכר"), "");

  // High churn.
  const churn = card({ churnRisk: 65, matchingBuyers: [] });
  add("high churn → SELLER_MEETING + risk", churn.strategy.recommendedStrategy === "SELLER_MEETING" && hasRisk(churn, "high_churn"), churn.strategy.recommendedStrategy);

  // Luxury.
  add("luxury → luxury opportunity", card({ classification: ["יוקרה", "מוכר חם"] }).opportunities.some((o) => o.type === "luxury_opportunity"), "");

  // Weak valuation.
  const weakVal = card({ property: prop({ valuationPosition: "unknown", valuationConfidence: "none" }) });
  add("weak valuation → risk + valuation in playbook", hasRisk(weakVal, "weak_valuation") && (weakVal.strategy.recommendedStrategy === "VALUATION_UPDATE" || weakVal.strategy.playbook.some((a) => a.missionType === "VALUATION_REVIEW")), "");

  // Strong demand.
  const demand = card({ property: prop({ buyerDemandScore: 75, domBand: "fast" }) });
  add("strong demand → high_demand + fast_sale opp", hasOpp(demand, "high_demand") && hasOpp(demand, "fast_sale"), "");

  // No buyers.
  const noBuyers = card({ matchingBuyers: [] });
  add("no buyers → connection note, no buyer_waiting", noBuyers.buyerConnection.notes.length > 0 && !hasOpp(noBuyers, "buyer_waiting"), "");
  add("buyers waiting → buyer connection + opp", base.buyerConnection.priorityBuyers.length > 0 && hasOpp(base, "buyer_waiting"), "");

  // Playbook + strategy meta.
  add("playbook ordered + mission mapped", base.strategy.playbook.every((a, i) => a.order === i + 1 && !!a.missionType), "");
  add("strategy meta complete", Array.isArray(base.strategy.alternatives) && base.strategy.expectedOutcome.length > 0 && ["working", "switch", "succeeded", "failed", "review"].includes(base.strategy.change.signal), "");

  // Agent proposals — recommendation-only.
  const proposals = sellerAgent.run({ now: Date.now(), orgId: "o", data: { sellers: [sig({ readinessToSign: 80 })] } });
  add("agent emits proposals per seller", proposals.length > 0 && proposals.every((p) => p.entityType === "seller" && p.entityId === "S1"), "");
  add("agent emits mission proposal (approval-gated)", proposals.some((p) => p.kind === "mission" && !!p.missionType), "");
  add("agent no auto-exec", sellerAgent.permissions.includes("REQUEST_APPROVAL") && !sellerAgent.permissions.includes("AUTO_EXECUTE"), "");
  add("empty sellers → no proposals", sellerAgent.run({ now: Date.now(), orgId: "o", data: {} }).length === 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
