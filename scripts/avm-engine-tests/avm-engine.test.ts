/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO AVM 3.0 — engine integration (runs under tsx: `node --import tsx --test`).
// Proves the engine-level behaviors that need the full valuation-engine (which
// uses @/ path aliases): dedupe preserves distinct sales, no asking-price leakage,
// property type down-ranks dissimilar comps, no demo comparable, sold anchors.
// Run: node --import tsx --test scripts/avm-engine-tests/avm-engine.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { runValuation, dedupeComparables, computeSimilarity } from "@/lib/valuation/valuation-engine";
import { isTraceableComparable } from "@/lib/valuation/types";

const mk = (over: Record<string, unknown>) => ({
  source: "govmap", comparableType: "sold", externalId: "x", city: "קרית ביאליק",
  neighborhood: null, street: null, propertyType: "דירה", rooms: 4, sqm: 100, floor: 2,
  price: 1_400_000, pricePerSqm: 14000, saleDate: "2025-06-01", sourceTable: "property_transactions",
  isDemo: false, ...over,
} as any);

test("dedupe PRESERVES distinct sold deals sharing features (only true dupes removed)", () => {
  // 3 DIFFERENT deals: same rooms/sqm/floor/neighborhood, different price+date, null street.
  const distinct = [
    mk({ externalId: "a", price: 1_300_000, pricePerSqm: 13000, saleDate: "2025-01-01" }),
    mk({ externalId: "b", price: 1_400_000, pricePerSqm: 14000, saleDate: "2025-03-01" }),
    mk({ externalId: "c", price: 1_500_000, pricePerSqm: 15000, saleDate: "2025-06-01" }),
  ];
  assert.equal(dedupeComparables(distinct).length, 3, "distinct deals must survive");
  // A genuine duplicate (identical fingerprint) collapses to one.
  const withDup = [...distinct, mk({ externalId: "b2", price: 1_400_000, pricePerSqm: 14000, saleDate: "2025-03-01" })];
  assert.equal(dedupeComparables(withDup).length, 3, "true duplicate removed once");
});

test("no asking-price leakage — engine has no channel for the seller's price", () => {
  const comps = Array.from({ length: 10 }, (_, i) => mk({ externalId: `s${i}`, pricePerSqm: 14000 + i * 50 }));
  const input: any = { city: "קרית ביאליק", propertyType: "apartment", rooms: 4, builtSqm: 100, floor: 2 };
  const a = runValuation({ input: { ...input }, comparables: comps, brokerSold: [] }).estimatedValue;
  const b = runValuation({ input: { ...input, price: 9_999_999 }, comparables: comps, brokerSold: [] }).estimatedValue;
  assert.equal(a, b, "injecting an asking price must not change the valuation");
});

test("property type down-ranks a fundamentally different comparable", () => {
  const input: any = { city: "x", propertyType: "apartment", rooms: 4, builtSqm: 100, floor: 2 };
  const sameType = computeSimilarity(input, mk({ propertyType: "דירה" }));
  const diffType = computeSimilarity(input, mk({ propertyType: "מגרש" })); // land
  assert.ok(diffType < sameType, `land ${diffType} must score below apartment ${sameType}`);
});

test("no demo comparable can pass the anti-fake gate", () => {
  assert.ok(!isTraceableComparable(mk({ isDemo: true })), "demo row must be blocked");
  assert.ok(isTraceableComparable(mk({ isDemo: false })), "real traceable row passes");
  assert.ok(!isTraceableComparable(mk({ externalId: null })), "untraceable row blocked");
});

test("no-evidence stays honestly unavailable (never a fabricated value)", () => {
  const r = runValuation({ input: { city: "x", propertyType: "apartment", rooms: 4, builtSqm: 100 } as any, comparables: [], brokerSold: [] });
  assert.equal(r.valuationAvailable, false);
  assert.equal(r.estimatedValue, 0);
  assert.ok((r.unavailableReason ?? "").length > 0);
});

test("deterministic: same inputs → identical result", () => {
  const comps = Array.from({ length: 12 }, (_, i) => mk({ externalId: `d${i}`, pricePerSqm: 14000 + i * 30 }));
  const input: any = { city: "קרית ביאליק", propertyType: "apartment", rooms: 4, builtSqm: 100, floor: 2 };
  const r1 = runValuation({ input, comparables: comps.map((c) => ({ ...c })), brokerSold: [] });
  const r2 = runValuation({ input, comparables: comps.map((c) => ({ ...c })), brokerSold: [] });
  assert.equal(r1.estimatedValue, r2.estimatedValue);
  assert.equal(r1.confidenceScore, r2.confidenceScore);
});

test("sold anchors: a flood of higher asking listings cannot dominate sold", () => {
  const sold = Array.from({ length: 8 }, (_, i) => mk({ externalId: `sold${i}`, pricePerSqm: 14000 + i * 20, comparableType: "sold" }));
  const askingHigh = Array.from({ length: 200 }, (_, i) => mk({ externalId: `ask${i}`, source: "yad2", comparableType: "listing", pricePerSqm: 20000, saleDate: null, listingDate: "2026-06-01", sourceTable: "external_listings" }));
  const input: any = { city: "קרית ביאליק", propertyType: "apartment", rooms: 4, builtSqm: 100, floor: 2 };
  const soldOnly = runValuation({ input, comparables: sold, brokerSold: [] }).estimatedPricePerSqm;
  const mixed = runValuation({ input, comparables: [...sold, ...askingHigh], brokerSold: [] }).estimatedPricePerSqm;
  // Mixed may rise toward asking but must stay far below the pure-asking level (20000).
  assert.ok(mixed < (soldOnly + 20000) / 2, `mixed ppsqm ${mixed} must stay anchored to sold ${soldOnly}, not asking 20000`);
});
