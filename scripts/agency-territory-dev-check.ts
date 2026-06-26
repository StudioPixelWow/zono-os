/**
 * LOCAL-DEV-ONLY check for the Agency Territory Dominance Engine (Phase 26.4).
 * Pure layers only (no DB, no network). Verifies: city/neighborhood/street
 * dominance calculation · missing-data → null (never fake 0) · dominance score
 * weighting · momentum score + trend · opportunity detection · idempotent
 * (deterministic) recompute.
 *
 * Run: npx tsx scripts/agency-territory-dev-check.ts
 */
import {
  computeTerritoryStats, detectTerritoryOpportunities,
} from "../src/lib/agencies/territory/agencyTerritoryCalculator";
import { scoreDominance, scoreMomentum, scoreConfidence } from "../src/lib/agencies/territory/agencyDominanceScoring";
import { territoryKey } from "../src/lib/agencies/territory/agencyTerritoryTypes";
import type { TerritoryCalcInput, TerritoryListingRow, TerritoryType } from "../src/lib/agencies/territory/agencyTerritoryTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const NOW = Date.now();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();
const periodStart = iso(90), periodEnd = iso(0);

function listing(p: Partial<TerritoryListingRow>): TerritoryListingRow {
  return {
    price: p.price ?? null, sqm: p.sqm ?? null, status: p.status ?? "active",
    daysOnMarket: p.daysOnMarket ?? null, isExclusive: p.isExclusive ?? false,
    firstSeenAt: p.firstSeenAt ?? null, saleDate: p.saleDate ?? null, priceDropped: p.priceDropped ?? null,
  };
}

function input(over: Partial<TerritoryCalcInput>): TerritoryCalcInput {
  return {
    agencyId: "ag1", territoryType: "city", city: "תל אביב", neighborhood: null, street: null,
    periodDays: 90, periodStart, periodEnd, listings: [], totals: { activeAll: null, soldAll: null, luxuryAll: null, medianPrice: null }, previous: null,
    ...over,
  };
}

function main(): void {
  console.log("Agency Territory Dominance dev-check\n");

  // 1) City dominance from real listings + totals.
  console.log("City dominance:");
  const city = computeTerritoryStats(input({
    territoryType: "city",
    listings: [
      listing({ price: 3_000_000, sqm: 100, status: "active", firstSeenAt: iso(20) }),
      listing({ price: 3_200_000, sqm: 110, status: "active", firstSeenAt: iso(10) }),
      listing({ price: 2_800_000, sqm: 95, status: "sold", saleDate: iso(15), firstSeenAt: iso(60) }),
    ],
    totals: { activeAll: 4, soldAll: 2, luxuryAll: 0, medianPrice: 3_000_000 },
    previous: { newListings: 1, sold: 0, activeInventory: 2 },
  }));
  assert(city.activeListingsCount === 2 && city.soldCount === 1, "counts active/sold");
  assert(city.inventoryShare === 0.5 && city.salesShare === 0.5, "inventory + sales share vs totals");
  assert(city.avgPricePerSqm != null && city.avgPricePerSqm > 0, "avg price per sqm computed");
  assert(city.dominanceScore != null && city.dominanceScore > 0 && city.dominanceScore <= 100, "dominance score in range");

  // 2) Neighborhood + street dominance.
  console.log("\nNeighborhood + street dominance:");
  const nbhd = computeTerritoryStats(input({
    territoryType: "neighborhood", neighborhood: "פלורנטין",
    listings: [listing({ price: 2_500_000, sqm: 80, status: "active", firstSeenAt: iso(5), isExclusive: true })],
    totals: { activeAll: 2, soldAll: null, luxuryAll: 0, medianPrice: 2_500_000 },
  }));
  assert(nbhd.inventoryShare === 0.5, "neighborhood inventory share");
  assert(nbhd.exclusiveShare === 1, "exclusive share (1 of 1 exclusive)");
  const street = computeTerritoryStats(input({
    territoryType: "street", neighborhood: "פלורנטין", street: "הרצל",
    listings: [listing({ price: 2_400_000, sqm: 75, status: "active", firstSeenAt: iso(3) })],
    totals: { activeAll: 1, soldAll: null, luxuryAll: null, medianPrice: 2_400_000 },
  }));
  assert(street.inventoryShare === 1, "street inventory share = 1 (sole active)");

  // 3) Missing data → null (never fake 0).
  console.log("\nMissing data → null:");
  const sparse = computeTerritoryStats(input({
    listings: [listing({ price: null, sqm: null, status: "active", firstSeenAt: null })],
    totals: { activeAll: null, soldAll: null, luxuryAll: null, medianPrice: null },
  }));
  assert(sparse.avgPrice === null, "avgPrice null when no prices (not 0)");
  assert(sparse.avgPricePerSqm === null, "avgPricePerSqm null when no data");
  assert(sparse.avgDaysOnMarket === null, "avgDaysOnMarket null when no data");
  assert(sparse.inventoryShare === null, "inventoryShare null when total unknown");
  assert(sparse.luxuryShare === null, "luxuryShare null when median unknown");
  assert(sparse.listingVelocity === null, "listingVelocity null when no dated listings");
  assert(sparse.priceDropCount === null, "priceDropCount null when no history data");

  // 4) Dominance score weighting (pure).
  console.log("\nDominance score weighting:");
  const high = scoreDominance({ inventoryShare: 1, salesShare: 1, listingVelocity: 100, salesVelocity: 100, luxuryShare: 1, exclusiveShare: 1, momentumScore: 100 });
  const low = scoreDominance({ inventoryShare: 0, salesShare: 0, listingVelocity: 0, salesVelocity: 0, luxuryShare: 0, exclusiveShare: 0, momentumScore: 0 });
  assert(high != null && high >= 95, "all-max components → ~100");
  assert(low === 0, "all-min components → 0");
  assert(scoreDominance({ inventoryShare: null, salesShare: null, listingVelocity: null, salesVelocity: null, luxuryShare: null, exclusiveShare: null, momentumScore: null }) === null, "no components → null (not 0)");
  const partial = scoreDominance({ inventoryShare: 0.8, salesShare: null, listingVelocity: null, salesVelocity: null, luxuryShare: null, exclusiveShare: null, momentumScore: null });
  assert(partial != null && Math.round(partial) === 80, "single available component renormalizes to its own value");

  // 5) Momentum score + trend.
  console.log("\nMomentum score + trend:");
  const growing = scoreMomentum({ newListings: 10, sold: 5, activeInventory: 12 }, { newListings: 2, sold: 1, activeInventory: 4 });
  assert(growing.trend === "growing" && (growing.momentumScore ?? 0) > 60, "growth → growing trend");
  const declining = scoreMomentum({ newListings: 1, sold: 0, activeInventory: 2 }, { newListings: 8, sold: 4, activeInventory: 10 });
  assert(declining.trend === "declining" && (declining.momentumScore ?? 100) < 40, "shrink → declining trend");
  assert(scoreMomentum({ newListings: 1, sold: 1, activeInventory: 1 }, null).trend === "unknown", "no previous → unknown");

  // 6) Confidence reflects completeness, not dominance.
  console.log("\nConfidence:");
  const fullConf = scoreConfidence({ listingCount: 10, hasTotals: true, hasPrevious: true, pricedCount: 8, datedCount: 8 });
  const lowConf = scoreConfidence({ listingCount: 1, hasTotals: false, hasPrevious: false, pricedCount: 0, datedCount: 0 });
  assert(fullConf > 0.8 && lowConf < 0.2, "rich data → high confidence, sparse → low");

  // 7) Opportunity detection.
  console.log("\nOpportunity detection:");
  const userWeak = computeTerritoryStats(input({
    listings: [listing({ price: 2_000_000, sqm: 80, status: "active", firstSeenAt: iso(10) })],
    totals: { activeAll: 12, soldAll: 2, luxuryAll: 0, medianPrice: 2_000_000 },
  }));
  const ops = detectTerritoryOpportunities(
    userWeak,
    { dominanceScore: 75, trend: "declining", momentumScore: 30 },
    { territoryType: "city" as TerritoryType, city: "תל אביב", neighborhood: null, street: null, totalActive: 12, totalSold: 2, medianPrice: 2_000_000, luxuryAll: 0 },
  );
  assert(ops.some((o) => o.type === "territory_opportunity"), "high demand + low presence → territory_opportunity");
  assert(ops.some((o) => o.type === "competitor_dominance"), "strong competitor → competitor_dominance");
  assert(ops.some((o) => o.type === "competitor_momentum"), "declining competitor → competitor_momentum");

  // 8) Determinism / idempotency: same input → identical output.
  console.log("\nDeterminism:");
  const a = JSON.stringify(computeTerritoryStats(input({ listings: [listing({ price: 3_000_000, sqm: 100, status: "active", firstSeenAt: iso(10) })], totals: { activeAll: 2, soldAll: 1, luxuryAll: 0, medianPrice: 3_000_000 } })));
  const b = JSON.stringify(computeTerritoryStats(input({ listings: [listing({ price: 3_000_000, sqm: 100, status: "active", firstSeenAt: iso(10) })], totals: { activeAll: 2, soldAll: 1, luxuryAll: 0, medianPrice: 3_000_000 } })));
  assert(a === b, "identical input → identical stats (idempotent recompute)");
  assert(territoryKey("city", "תל אביב") === territoryKey("city", " תל אביב "), "territory key normalizes whitespace");

  console.log(`\n${failures === 0 ? "✅ ALL AGENCY TERRITORY CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
