/**
 * LOCAL-DEV-ONLY check for the Valuation Intelligence engine (Phase 4). Pure
 * builder only (no DB, no network). Verifies: dynamic explanation · strengths /
 * weaknesses gated on real data · live market insights · price position from
 * comparable distribution · negotiation analysis · weighted confidence
 * breakdown · determinism.
 *
 * Run: npx tsx scripts/valuation-intelligence-dev-check.ts
 */
import { buildValuationIntelligence, computePricePosition } from "../src/lib/valuation/intelligence";
import type { Comparable, MarketSnapshot, ValuationInput, ValuationResult, ValuationDebug } from "../src/lib/valuation/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

let seq = 0;
function comp(p: Partial<Comparable> = {}): Comparable {
  const i = seq++;
  return {
    source: p.source ?? "zono", comparableType: p.comparableType ?? "sold",
    city: "תל אביב", neighborhood: "פלורנטין", street: p.street ?? `הרצל ${i}`,
    rooms: 4, sqm: 100, floor: 3, price: p.price ?? 2_500_000, pricePerSqm: p.pricePerSqm ?? 25_000,
    distanceMeters: p.distanceMeters ?? 120, similarityScore: p.similarityScore ?? 85,
    saleDate: (p.comparableType ?? "sold") === "sold" ? "2026-03-01" : null,
    listingDate: (p.comparableType ?? "sold") === "listing" ? "2026-03-01" : null, ...p,
  };
}

const market: MarketSnapshot = {
  avgPricePerSqm: 25_000, medianPricePerSqm: 25_000, transactionCount: 12, activeListingCount: 5,
  demandLevel: "high", supplyLevel: "low", trendDirection: "up", trendPercent: 3, listingToSoldGapPercent: 4, dataQualityScore: 80,
};
const debug: ValuationDebug = {
  comparableCount: 18, soldComparableCount: 12, activeComparableCount: 6, sourcesUsed: ["zono", "govmap", "madlan", "yad2"],
  fallbackLevel: "street", avgPricePerSqm: 25_000, medianPricePerSqm: 25_000, weightedPricePerSqm: 25_100, outliersRemoved: 1, confidenceScore: 88, reasonCodes: ["ok"],
};

function result(over: Partial<ValuationResult> = {}): ValuationResult {
  return {
    estimatedValue: 2_550_000, lowValue: 2_420_000, highValue: 2_680_000,
    recommendedListingPrice: 2_650_000, targetClosingPrice: 2_530_000, minimumAcceptablePrice: 2_420_000,
    estimatedPricePerSqm: 25_500, confidenceScore: 88, confidenceLevel: "high",
    demandScore: 72, liquidityScore: 60, overpricingRiskScore: 28, daysOnMarketEstimate: 38,
    explanation: "", adjustments: [
      { label: "חניה", direction: "positive", valueImpact: 70000, percentageImpact: 3, reason: "חניה פרטית", confidence: 0.7 },
      { label: "מעלית", direction: "positive", valueImpact: 50000, percentageImpact: 2, reason: "קיום מעלית", confidence: 0.7 },
      { label: "קומה נמוכה", direction: "negative", valueImpact: -40000, percentageImpact: 2, reason: "קומה נמוכה", confidence: 0.6 },
    ],
    strategies: [
      { key: "conservative", label: "שמרני", price: 2_580_000, saleProbability: 80, daysOnMarket: 30, risk: "נמוך" },
      { key: "balanced", label: "מאוזן", price: 2_650_000, saleProbability: 70, daysOnMarket: 40, risk: "מאוזן", recommended: true },
      { key: "aggressive", label: "אגרסיבי", price: 2_780_000, saleProbability: 55, daysOnMarket: 60, risk: "גבוה" },
    ],
    market, basePpsqm: 25_000, evidenceCount: 18, valuationAvailable: true, valuationQuality: "high", debug,
    ...over,
  };
}

const INPUT: ValuationInput = { city: "תל אביב", neighborhood: "פלורנטין", street: "הרצל", propertyType: "apartment", rooms: 4, builtSqm: 100, floor: 1, buildingYear: 1980, parkingCount: 1, elevator: true };

function main(): void {
  console.log("Valuation Intelligence dev-check\n");
  seq = 0;
  const comps = [
    ...Array.from({ length: 10 }, () => comp({ comparableType: "sold" })),
    ...Array.from({ length: 6 }, () => comp({ comparableType: "listing", pricePerSqm: 27_000 })),
  ];
  const intel = buildValuationIntelligence({ input: INPUT, result: result(), comparables: comps, market, debug });

  // 1) Dynamic explanation.
  console.log("Explanation:");
  assert(intel.explanation.includes("18 נכסים") || intel.explanation.includes("ההערכה מבוססת"), "explanation references the comparable count");
  assert(/חניה|מעלית/.test(intel.explanation), "explanation mentions value-adding features");
  assert(intel.explanation.includes("2,550,000"), "explanation states the estimated value");

  // 2) Strengths / weaknesses gated on data.
  console.log("\nStrengths / weaknesses:");
  assert(intel.strengths.some((s) => s.key === "high_demand"), "high demand → strength");
  assert(intel.strengths.some((s) => s.key === "low_supply"), "low supply → strength");
  assert(intel.weaknesses.some((w) => w.key === "old_building"), "1980 building → weakness");
  assert(intel.weaknesses.some((w) => w.key === "low_floor"), "floor 1 → weakness");
  assert(intel.strengths.length > 0 && intel.weaknesses.length > 0, "both lists populated from real data");

  // 3) Market insights.
  console.log("\nMarket insights:");
  const keys = intel.marketInsights.map((m) => m.key);
  assert(keys.includes("avg_ppsqm") && keys.includes("trend") && keys.includes("absorption"), "avg ppsqm + trend + absorption present");
  assert(intel.marketInsights.find((m) => m.key === "recent_sold")?.value === "12", "recent sold count from market");

  // 4) Price position from distribution.
  console.log("\nPrice position:");
  assert(["below_market", "fair_market", "premium", "luxury_segment", "overpriced", "very_overpriced"].includes(intel.marketPosition), "valid market position");
  assert(computePricePosition(10_000, comps, market) === "below_market", "very low ppsqm → below market");
  assert(computePricePosition(99_000, comps, market) === "very_overpriced", "very high ppsqm → very overpriced");

  // 5) Negotiation analysis.
  console.log("\nNegotiation analysis:");
  const n = intel.negotiationAnalysis;
  assert(n.recommendedAsking === 2_650_000 && n.expectedSelling === 2_530_000, "asking + expected from result");
  assert(n.negotiationMargin === 120_000 && n.expectedDiscountPercent > 0, "margin + discount computed");
  assert(n.quickSalePrice < n.optimalSalePrice && n.optimalSalePrice < n.premiumPrice, "quick < optimal < premium");
  assert(typeof n.listingStrategy === "string" && n.listingStrategy.length > 0, "listing strategy text");

  // 6) Confidence breakdown.
  console.log("\nConfidence breakdown:");
  const cb = intel.confidenceBreakdown;
  assert(cb.comparableCount != null && cb.comparableSimilarity != null && cb.sourceReliability != null, "sub-scores computed");
  assert(cb.transactionQuality != null && cb.transactionQuality > 0, "transaction quality from sold share");
  assert(cb.overall === 88, "overall matches engine confidence");
  assert(cb.missingInformation === 100, "all 6 inputs present → 100% completeness");

  // 7) Insufficient data path.
  console.log("\nInsufficient data:");
  const empty = buildValuationIntelligence({ input: { city: "x" }, result: result({ valuationAvailable: false, estimatedValue: 0, adjustments: [] }), comparables: [], market: { ...market, transactionCount: 0, activeListingCount: 0 }, debug: { ...debug, comparableCount: 0 } });
  assert(empty.explanation.includes("לא נמצאו מספיק"), "no-data explanation is honest");
  assert(empty.confidenceBreakdown.comparableCount === null, "no comparables → null sub-score (not 0)");

  // 8) Determinism.
  console.log("\nDeterminism:");
  seq = 0; const a = buildValuationIntelligence({ input: INPUT, result: result(), comparables: [comp(), comp(), comp(), comp()], market, debug });
  seq = 0; const b = buildValuationIntelligence({ input: INPUT, result: result(), comparables: [comp(), comp(), comp(), comp()], market, debug });
  assert(JSON.stringify(a) === JSON.stringify(b), "identical input → identical report");

  console.log(`\n${failures === 0 ? "✅ ALL VALUATION INTELLIGENCE CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
