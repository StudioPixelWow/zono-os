/**
 * LOCAL-DEV-ONLY check for the valuation PDF/report wiring (Phase 3). Pure HTML
 * builder only (no DB, no network). Verifies the exported report reflects the
 * real AVM result: estimated value + range + confidence + quality, ppsqm stats,
 * sources, full comparable table (incl. weight), explanation/methodology, and —
 * critically — NEVER prints ₪0 when no valuation is available.
 *
 * Run: npx tsx scripts/valuation-pdf-dev-check.ts
 */
import { renderReportHtml, buildReportPayload, type ReportBrand } from "../src/lib/valuation/report";
import type { ValuationRecord, ValuationResult, Comparable } from "../src/lib/valuation/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const BRAND: ReportBrand = { orgName: "ZONO", brokerName: "דנה", brokerPhone: "0500000000", brokerEmail: "a@b.c", logoUrl: null, propertyImageUrl: null, brandColor: "#7c3aed", publicUrl: null };

function comp(p: Partial<Comparable>): Comparable {
  return {
    source: p.source ?? "zono", comparableType: p.comparableType ?? "sold",
    city: "תל אביב", neighborhood: "פלורנטין", street: p.street ?? "הרצל",
    rooms: 4, sqm: 100, floor: 3, price: p.price ?? 2_500_000, pricePerSqm: p.pricePerSqm ?? 25_000,
    distanceMeters: p.distanceMeters ?? 120, similarityScore: p.similarityScore ?? 88,
    saleDate: p.comparableType === "listing" ? null : "2026-03-01",
    listingDate: p.comparableType === "listing" ? "2026-03-01" : null,
    ...p,
  };
}

function record(over: Partial<ValuationResult>, comps: Comparable[]): ValuationRecord {
  const result: Partial<ValuationResult> = {
    estimatedValue: 2_550_000, lowValue: 2_400_000, highValue: 2_700_000,
    recommendedListingPrice: 2_650_000, targetClosingPrice: 2_530_000, minimumAcceptablePrice: 2_420_000,
    estimatedPricePerSqm: 25_500, confidenceScore: 78, confidenceLevel: "high",
    demandScore: 70, liquidityScore: 60, overpricingRiskScore: 30, daysOnMarketEstimate: 40,
    explanation: "הערכה מבוססת עסקאות באזור.", adjustments: [], strategies: [],
    market: { avgPricePerSqm: 25_000, medianPricePerSqm: 25_200, transactionCount: 6, activeListingCount: 4, demandLevel: "high", supplyLevel: "medium", trendDirection: "up", trendPercent: 2.1, listingToSoldGapPercent: 4, dataQualityScore: 70 },
    basePpsqm: 25_000, evidenceCount: comps.length,
    valuationAvailable: true, valuationQuality: "high",
    debug: { comparableCount: comps.length, soldComparableCount: comps.filter((c) => c.comparableType === "sold").length, activeComparableCount: comps.filter((c) => c.comparableType === "listing").length, sourcesUsed: [...new Set(comps.map((c) => c.source))], fallbackLevel: "street", avgPricePerSqm: 25_000, medianPricePerSqm: 25_200, weightedPricePerSqm: 25_300, outliersRemoved: 1, confidenceScore: 78, reasonCodes: ["ok"] },
    ...over,
  };
  return {
    id: "v1", organizationId: "o1", propertyId: null, status: "completed",
    input: { city: "תל אביב", neighborhood: "פלורנטין", street: "הרצל", rooms: 4, builtSqm: 100, floor: 3 },
    result, comparables: comps, brokerSold: [], adjustments: [], market: result.market ?? null, createdAt: "2026-06-26",
  };
}

const html = (r: ValuationRecord) => renderReportHtml(buildReportPayload(r, BRAND));

function main(): void {
  console.log("Valuation PDF/report dev-check\n");

  // 1) Full valuation (internal sold).
  console.log("Full valuation:");
  const full = html(record({}, [comp({ source: "zono", comparableType: "sold", street: "הרצל 1" }), comp({ source: "zono", comparableType: "sold", street: "הרצל 2" }), comp({ source: "govmap", comparableType: "sold", street: "הרצל 3" })]));
  assert(full.includes("₪2,550,000"), "shows estimated value");
  assert(full.includes("טווח: ₪2,400,000 – ₪2,700,000"), "shows low–high range");
  assert(full.includes("רמת ביטחון") && full.includes("78%"), "shows confidence score");
  assert(full.includes("איכות נתונים") && full.includes("גבוהה"), "shows valuation quality level");
  assert(full.includes("בסיס החישוב (AVM)"), "AVM stats section present");
  assert(full.includes("מחיר ממוצע למ\"ר") && full.includes("מחיר חציוני למ\"ר") && full.includes("מחיר משוקלל למ\"ר"), "avg/median/weighted ppsqm");
  assert(full.includes("מקורות הנתונים"), "sources section present");
  assert(full.includes("עסקאות פנימיות (ZONO)") && full.includes("GovMap (עסקאות רשמיות)"), "internal + GovMap sources listed");
  assert(full.includes("<th>משקל</th>") && full.includes("<th>מרחק</th>") && full.includes("<th>קומה</th>"), "comparable table has weight/distance/floor columns");
  assert(full.includes("איך חושבה ההערכה"), "explanation/methodology present");
  assert(!full.includes("לא נמצאו מספיק נתונים"), "does NOT show the no-data panel");

  // 2) Mixed sources.
  console.log("\nMixed sources:");
  const mixed = html(record({}, [comp({ source: "zono", comparableType: "sold", street: "א" }), comp({ source: "madlan", comparableType: "listing", street: "ב" }), comp({ source: "yad2", comparableType: "listing", street: "ג" }), comp({ source: "govmap", comparableType: "sold", street: "ד" })]));
  assert(mixed.includes("Madlan") && mixed.includes("יד2") && mixed.includes("GovMap (עסקאות רשמיות)"), "all mixed sources listed");

  // 3) Active listings only.
  console.log("\nActive listings only:");
  const active = html(record({ debug: { comparableCount: 3, soldComparableCount: 0, activeComparableCount: 3, sourcesUsed: ["madlan", "yad2"], fallbackLevel: "neighborhood", avgPricePerSqm: 26000, medianPricePerSqm: 26000, weightedPricePerSqm: 26000, outliersRemoved: 0, confidenceScore: 55, reasonCodes: ["ok", "only_active_listings"] } }, [comp({ source: "madlan", comparableType: "listing", street: "א" }), comp({ source: "yad2", comparableType: "listing", street: "ב" }), comp({ source: "madlan", comparableType: "listing", street: "ג" })]));
  assert(active.includes("₪2,550,000") && active.includes("בסיס החישוב (AVM)"), "active-only still produces a full report");

  // 4) No valuation available — never ₪0.
  console.log("\nNo valuation available:");
  const none = html(record({
    estimatedValue: 0, lowValue: 0, highValue: 0, recommendedListingPrice: 0, targetClosingPrice: 0, minimumAcceptablePrice: 0, estimatedPricePerSqm: 0,
    confidenceScore: 15, confidenceLevel: "low", strategies: [],
    valuationAvailable: false, valuationQuality: "insufficient",
    unavailableReason: "לא נמצאו עסקאות או מודעות עם מחיר להשוואה אמינה.",
    missingData: ["עסקאות/מודעות להשוואה באזור"], recommendedAction: "להריץ סריקת עסקאות לאזור ולחשב מחדש.",
    debug: { comparableCount: 0, soldComparableCount: 0, activeComparableCount: 0, sourcesUsed: [], fallbackLevel: "city", avgPricePerSqm: null, medianPricePerSqm: null, weightedPricePerSqm: null, outliersRemoved: 0, confidenceScore: 15, reasonCodes: ["no_priced_comparables"] },
  }, []));
  assert(none.includes("לא נמצאו מספיק נתונים להערכת שווי אמינה"), "shows honest no-data message");
  assert(none.includes("מדוע לא הופקה הערכת שווי"), "no-data explanation section present");
  assert(none.includes("עסקאות/מודעות להשוואה באזור"), "lists missing data");
  assert(none.includes("להריץ סריקת עסקאות"), "shows recommended next action");
  assert(!none.includes("₪0"), "NEVER prints ₪0 when no valuation is available");
  assert(!none.includes("בסיס החישוב (AVM)") && !none.includes("אסטרטגיית תמחור"), "value-dependent sections hidden when unavailable");

  // 5) RTL + branding preserved.
  console.log("\nRTL + branding:");
  assert(full.includes('dir="rtl"') && full.includes('lang="he"'), "document is RTL Hebrew");
  assert(full.includes("ZONO") && full.includes("--brand:#7c3aed"), "branding (org + brand color) preserved");

  console.log(`\n${failures === 0 ? "✅ ALL VALUATION PDF CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
