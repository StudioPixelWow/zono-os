/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO AVM 3.2 acceptance — sold-anchor safety (tsx). Regression for the proven
// defect: when the proximity working set has NO closed transactions (a geocoded
// subject whose nearest tier holds only active listings), the estimate must NOT
// read as high confidence — asking evidence can never present as authoritative.
// Run: node --import tsx --test scripts/avm-engine-tests/avm-sold-anchor.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { runValuation } from "@/lib/valuation/valuation-engine";

const ask = (i: number) => ({
  source: "yad2", comparableType: "listing", externalId: `a${i}`, city: "קרית ביאליק",
  neighborhood: "דרום", street: "הרצל", distanceMeters: 120, geocodeResolution: "STREET",
  propertyType: "דירה", rooms: 4, sqm: 95, floor: 3, price: 1_900_000, pricePerSqm: 20000,
  listingDate: "2026-06-01", sourceTable: "external_listings", isDemo: false,
} as any);

test("asking-only working set → confidence capped to medium (never high)", () => {
  const comps = Array.from({ length: 30 }, (_, i) => ask(i));
  const input: any = { city: "קרית ביאליק", neighborhood: "דרום", propertyType: "apartment", rooms: 4, builtSqm: 95, floor: 3, latitude: 32.8279, longitude: 35.0850 };
  const r = runValuation({ input, comparables: comps, brokerSold: [] });
  assert.ok(r.valuationAvailable, "still produces a valuation");
  assert.ok(r.confidenceScore <= 55, `asking-only confidence ${r.confidenceScore} must be ≤55 (medium)`);
  assert.notEqual(r.confidenceLevel, "high", "asking-only must never be HIGH confidence");
  assert.ok(r.debug?.reasonCodes?.includes("asking_only_no_sold_anchor"), "reason code surfaced");
});

test("adding real sold comps restores a proper anchor + can raise confidence", () => {
  const sold = Array.from({ length: 12 }, (_, i) => ({
    source: "govmap", comparableType: "sold", externalId: `s${i}`, city: "קרית ביאליק", neighborhood: "דרום",
    street: "הרצל", distanceMeters: 100, geocodeResolution: "STREET", propertyType: "דירה", rooms: 4, sqm: 95,
    floor: 3, price: 1_500_000, pricePerSqm: 15800 + i * 20, saleDate: "2026-03-01", sourceTable: "property_transactions", isDemo: false,
  } as any));
  const input: any = { city: "קרית ביאליק", neighborhood: "דרום", propertyType: "apartment", rooms: 4, builtSqm: 95, floor: 3, latitude: 32.8279, longitude: 35.0850 };
  const r = runValuation({ input, comparables: sold, brokerSold: [] });
  assert.ok(!r.debug?.reasonCodes?.includes("asking_only_no_sold_anchor"), "sold present → no asking-only flag");
});
