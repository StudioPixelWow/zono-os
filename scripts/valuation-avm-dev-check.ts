/**
 * LOCAL-DEV-ONLY check for the Professional AVM valuation algorithm (Phase 2).
 * Pure engine only (no DB, no network). Verifies: valuation from internal SOLD
 * only · GovMap SOLD only · Madlan/Yad2 ACTIVE only · mixed sources · outlier
 * removal · no-comparables (valuationAvailable=false, never a misleading ₪0) ·
 * never numeric zero when data exists · QA debug metadata.
 *
 * Run: npx tsx scripts/valuation-avm-dev-check.ts
 */
import { runValuation } from "../src/lib/valuation/valuation-engine";
import type { Comparable, ComparableSource, ComparableType, ValuationInput } from "../src/lib/valuation/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const INPUT: ValuationInput = {
  city: "תל אביב", neighborhood: "פלורנטין", street: "הרצל",
  rooms: 4, builtSqm: 100, floor: 3, elevator: true, parkingCount: 1,
};

let seq = 0;
function comp(source: ComparableSource, type: ComparableType, ppsqm: number, extra: Partial<Comparable> = {}): Comparable {
  // Each comparable is a DISTINCT property (unique street + externalId) so the
  // engine's dedupe (which merges the same property across sources) keeps them.
  const i = seq++;
  return {
    source, comparableType: type, pricePerSqm: ppsqm, sqm: 98 + (i % 5), rooms: 4, floor: 2 + (i % 4),
    neighborhood: "פלורנטין", street: `הרצל ${i}`, externalId: `${source}-${i}`,
    saleDate: type === "sold" ? "2026-03-01" : null,
    listingDate: type === "listing" ? "2026-03-01" : null,
    ...extra,
  };
}

function run(comparables: Comparable[]) {
  return runValuation({ input: INPUT, comparables, brokerSold: [] });
}

function main(): void {
  console.log("Professional AVM valuation dev-check\n");

  // 1) Internal SOLD only.
  console.log("Internal SOLD only:");
  const r1 = run([comp("zono", "sold", 25000), comp("zono", "sold", 26000), comp("zono", "sold", 24500)]);
  assert(r1.valuationAvailable === true, "valuationAvailable = true");
  assert(r1.estimatedValue > 0, "estimatedValue > 0");
  assert((r1.debug?.soldComparableCount ?? 0) === 3, "debug counts 3 sold comparables");
  assert(r1.debug?.sourcesUsed.includes("zono") ?? false, "debug sourcesUsed includes zono");

  // 2) GovMap SOLD only.
  console.log("\nGovMap SOLD only:");
  const r2 = run([comp("govmap", "sold", 27000), comp("govmap", "sold", 26500), comp("govmap", "sold", 28000)]);
  assert(r2.valuationAvailable === true && r2.estimatedValue > 0, "available + value > 0");
  assert(r2.debug?.sourcesUsed.includes("govmap") ?? false, "sourcesUsed includes govmap");

  // 3) Madlan / Yad2 ACTIVE only.
  console.log("\nMadlan/Yad2 ACTIVE listings only:");
  const r3 = run([comp("madlan", "listing", 30000), comp("yad2", "listing", 31000), comp("madlan", "listing", 29500)]);
  assert(r3.valuationAvailable === true && r3.estimatedValue > 0, "available + value > 0 from active only");
  assert(r3.debug?.reasonCodes.includes("only_active_listings") ?? false, "reasonCodes flags only_active_listings");
  assert((r3.debug?.soldComparableCount ?? -1) === 0 && (r3.debug?.activeComparableCount ?? 0) === 3, "0 sold / 3 active in debug");

  // 4) Mixed sources — SOLD must outweigh ACTIVE.
  console.log("\nMixed sources:");
  const r4 = run([
    comp("zono", "sold", 25000), comp("govmap", "sold", 26000),
    comp("madlan", "listing", 40000), comp("yad2", "listing", 41000),
  ]);
  assert(r4.valuationAvailable === true && r4.estimatedValue > 0, "available + value > 0");
  assert((r4.debug?.sourcesUsed.length ?? 0) >= 3, "debug lists multiple sources");
  // Weighted ppsqm should sit closer to the SOLD band (~25-26k) than the active band (~40k).
  assert((r4.debug?.weightedPricePerSqm ?? 0) < 34000, "sold evidence pulls weighted ppsqm below the active midpoint");

  // 5) Outlier removal.
  console.log("\nOutlier removal:");
  const r5 = run([
    comp("zono", "sold", 25000), comp("govmap", "sold", 25500), comp("madlan", "sold", 24800),
    comp("govmap", "sold", 26000), comp("zono", "sold", 25200), comp("madlan", "sold", 24900),
    comp("yad2", "sold", 250000), // extreme outlier
  ]);
  assert((r5.debug?.outliersRemoved ?? 0) >= 1, "extreme outlier removed (outliersRemoved >= 1)");
  assert(r5.estimatedValue > 0 && r5.estimatedPricePerSqm < 40000, "outlier did not blow up the estimate");

  // 6) No comparables → never a misleading ₪0.
  console.log("\nNo comparables:");
  const r6 = run([]);
  assert(r6.valuationAvailable === false, "valuationAvailable = false");
  assert(r6.valuationQuality === "insufficient", "quality = insufficient");
  assert(typeof r6.unavailableReason === "string" && r6.unavailableReason!.length > 0, "has a Hebrew unavailableReason");
  assert((r6.missingData?.length ?? 0) > 0 && r6.missingData!.includes("עסקאות/מודעות להשוואה באזור"), "missingData lists comparables");
  assert(typeof r6.recommendedAction === "string" && r6.recommendedAction!.length > 0, "has a recommendedAction");

  // 7) Never numeric zero when data exists.
  console.log("\nNever-zero-when-data-exists invariant:");
  for (const [label, r] of [["internal", r1], ["govmap", r2], ["active", r3], ["mixed", r4], ["outlier", r5]] as const) {
    assert(r.estimatedValue > 0 && r.lowValue > 0 && r.highValue > 0 && r.estimatedPricePerSqm > 0, `${label}: estimate + range + ppsqm all > 0`);
  }
  assert(r1.lowValue < r1.estimatedValue && r1.estimatedValue < r1.highValue, "range brackets the estimate (low < est < high)");

  // 8) Missing built sqm → unavailable even with comparables.
  console.log("\nMissing built sqm:");
  const r8 = runValuation({ input: { ...INPUT, builtSqm: null }, comparables: [comp("zono", "sold", 25000)], brokerSold: [] });
  assert(r8.valuationAvailable === false && r8.estimatedValue === 0, "no built sqm → unavailable, estimate 0");
  assert(r8.missingData?.some((m) => m.includes("שטח בנוי")) ?? false, "missingData flags built sqm");

  console.log(`\n${failures === 0 ? "✅ ALL AVM VALUATION CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
