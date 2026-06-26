/**
 * LOCAL-DEV-ONLY check for the premium seller PRESENTATION (Phase: presentation).
 * Pure HTML builder only (no DB). Verifies the luxury presentation renders every
 * required section from the real valuation record + intelligence, exposes PDF /
 * presentation / share affordances, is RTL Hebrew + ZONO-branded, and shows an
 * honest no-data slide (never fabricated ₪0) when the valuation is unavailable.
 *
 * Run: npx tsx scripts/valuation-presentation-dev-check.ts
 */
import { renderPresentationHtml } from "../src/lib/valuation/presentation";
import { buildReportPayload, type ReportBrand } from "../src/lib/valuation/report";
import { buildValuationIntelligence } from "../src/lib/valuation/intelligence";
import type { Comparable, MarketSnapshot, ValuationRecord, ValuationResult, ValuationDebug } from "../src/lib/valuation/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const BRAND: ReportBrand = { orgName: "ZONO", brokerName: "דנה כהן", brokerPhone: "0500000000", brokerEmail: "a@b.c", logoUrl: null, propertyImageUrl: null, brandColor: "#4c1d95", publicUrl: null };

let seq = 0;
function comp(p: Partial<Comparable> = {}): Comparable {
  const i = seq++;
  return {
    source: p.source ?? "zono", comparableType: p.comparableType ?? "sold", city: "תל אביב", neighborhood: "פלורנטין",
    street: p.street ?? `הרצל ${i}`, rooms: 4, sqm: 100, floor: 3, price: p.price ?? 2_500_000, pricePerSqm: p.pricePerSqm ?? 25_000,
    distanceMeters: 120, similarityScore: p.similarityScore ?? 85, saleDate: "2026-03-01", listingDate: null, ...p,
  };
}
const market: MarketSnapshot = {
  avgPricePerSqm: 25_000, medianPricePerSqm: 25_000, transactionCount: 12, activeListingCount: 5,
  demandLevel: "high", supplyLevel: "low", trendDirection: "up", trendPercent: 3, listingToSoldGapPercent: 4, dataQualityScore: 80,
};
const debug: ValuationDebug = {
  comparableCount: 18, soldComparableCount: 12, activeComparableCount: 6, sourcesUsed: ["zono", "govmap", "madlan"],
  fallbackLevel: "street", avgPricePerSqm: 25_000, medianPricePerSqm: 25_000, weightedPricePerSqm: 25_100, outliersRemoved: 1, confidenceScore: 88, reasonCodes: ["ok"],
};

function record(available = true): ValuationRecord {
  const comps = [...Array.from({ length: 10 }, () => comp({ comparableType: "sold" })), ...Array.from({ length: 6 }, () => comp({ comparableType: "listing", pricePerSqm: 27_000 }))];
  const result: ValuationResult = available ? {
    estimatedValue: 2_550_000, lowValue: 2_420_000, highValue: 2_680_000, recommendedListingPrice: 2_650_000,
    targetClosingPrice: 2_530_000, minimumAcceptablePrice: 2_420_000, estimatedPricePerSqm: 25_500, confidenceScore: 88,
    confidenceLevel: "high", demandScore: 72, liquidityScore: 60, overpricingRiskScore: 28, daysOnMarketEstimate: 38,
    explanation: "הערכה מבוססת עסקאות.", adjustments: [
      { label: "חניה", direction: "positive", valueImpact: 70000, percentageImpact: 3, reason: "חניה פרטית", confidence: 0.7 },
      { label: "קומה נמוכה", direction: "negative", valueImpact: -40000, percentageImpact: 2, reason: "קומה נמוכה", confidence: 0.6 },
    ],
    strategies: [
      { key: "conservative", label: "שמרני", price: 2_580_000, saleProbability: 80, daysOnMarket: 30, risk: "נמוך" },
      { key: "balanced", label: "מאוזן", price: 2_650_000, saleProbability: 70, daysOnMarket: 40, risk: "מאוזן", recommended: true },
      { key: "aggressive", label: "אגרסיבי", price: 2_780_000, saleProbability: 55, daysOnMarket: 60, risk: "גבוה" },
    ],
    market, basePpsqm: 25_000, evidenceCount: 18, valuationAvailable: true, valuationQuality: "high", debug,
    estimatedAccuracy: { city: "תל אביב", accuracyPercent: 93.4, sampleSize: 412, text: "מנוע הערכת השווי השיג דיוק ממוצע של 93.4% בתל אביב על בסיס 412 עסקאות שהושלמו." },
  } : {
    estimatedValue: 0, lowValue: 0, highValue: 0, recommendedListingPrice: 0, targetClosingPrice: 0, minimumAcceptablePrice: 0,
    estimatedPricePerSqm: 0, confidenceScore: 15, confidenceLevel: "low", demandScore: 0, liquidityScore: 0, overpricingRiskScore: 0,
    daysOnMarketEstimate: 0, explanation: "", adjustments: [], strategies: [], market, basePpsqm: 0, evidenceCount: 0,
    valuationAvailable: false, valuationQuality: "insufficient", unavailableReason: "לא נמצאו מספיק עסקאות.", missingData: ["עסקאות/מודעות להשוואה באזור"], recommendedAction: "להריץ סריקה.", debug: { ...debug, comparableCount: 0 },
  };
  if (available) result.intelligence = buildValuationIntelligence({ input: { city: "תל אביב", neighborhood: "פלורנטין", street: "הרצל", propertyType: "apartment", rooms: 4, builtSqm: 100, floor: 1 }, result, comparables: comps, market, debug });
  return {
    id: "v1", organizationId: "o1", propertyId: null, status: "completed",
    input: { city: "תל אביב", neighborhood: "פלורנטין", street: "הרצל", rooms: 4, builtSqm: 100, floor: 1 },
    result, comparables: comps, brokerSold: [], adjustments: [], market, createdAt: "2026-06-26",
  };
}

const html = (rec: ValuationRecord) => renderPresentationHtml(buildReportPayload(rec, BRAND));

function main(): void {
  console.log("Premium seller presentation dev-check\n");
  seq = 0;
  const h = html(record(true));

  // Required sections (Hebrew titles from the spec list).
  console.log("Sections:");
  for (const title of ["תמונת מצב", "מגמת מחירים", "סטטיסטיקת אזור", "נכסים להשוואה", "עסקאות שנסגרו לאחרונה", "היצע מול ביקוש", "ניתוח תחרות באזור", "מחיר מומלץ וצפי מכירה", "אסטרטגיית שיווק", "ניתוח סיכונים", "אסטרטגיות תמחור", "המלצות למוכר", "מדוע ההערכה אמינה"]) {
    assert(h.includes(title), `section present: ${title}`);
  }

  // Real values surfaced.
  console.log("\nReal data:");
  assert(h.includes("₪2,550,000"), "estimated value rendered");
  assert(h.includes("₪2,420,000 – ₪2,680,000") || (h.includes("2,420,000") && h.includes("2,680,000")), "low–high range rendered");
  assert(h.includes("88%"), "confidence rendered");
  assert(/חניה/.test(h), "value-adding feature surfaced");
  assert(h.includes("93.4%") && h.includes("412"), "estimated-accuracy from real deals surfaced");

  // Export affordances.
  console.log("\nExports:");
  assert(h.includes("ייצוא ל‑PDF") && h.includes("window.print()"), "PDF export (print)");
  assert(h.includes("מצב מצגת") && h.includes("present"), "presentation mode toggle");
  assert(h.includes('publicUrl') === false, "share link handled by token route (no raw URL leak in body)");

  // Luxury + branding + RTL.
  console.log("\nLuxury branding:");
  assert(h.includes('dir="rtl"') && h.includes('lang="he"'), "RTL Hebrew document");
  assert(h.includes("ZONO") && h.includes("--brand:#4c1d95") && h.includes("--gold"), "ZONO brand + gold luxury accent");
  assert(h.includes('class="slide"'), "slide-structured (presentation look, not technical report)");

  // No-data path.
  console.log("\nNo-data path:");
  const nd = html(record(false));
  assert(nd.includes("לא נמצאו מספיק נתונים להערכת שווי אמינה"), "honest no-data slide");
  assert(!nd.includes("₪0"), "never fabricates ₪0 when unavailable");
  assert(nd.includes("עסקאות/מודעות להשוואה באזור"), "lists missing data");

  // Determinism.
  console.log("\nDeterminism:");
  seq = 0; const a = html(record(true)); seq = 0; const b = html(record(true));
  assert(a === b, "identical record → identical presentation");

  console.log(`\n${failures === 0 ? "✅ ALL PRESENTATION CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
