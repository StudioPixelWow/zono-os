/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO AVM 3.1 — proximity-ladder READINESS (runs under tsx). Proves the engine
// already prefers nearer geographic evidence WHEN coordinates exist, and honestly
// falls back to CITY when they don't. i.e. the CITY-tier result on the live org is
// a DATA limitation (coordless transactions / un-geocoded subjects), not an engine
// defect — geocoding real coordinates would let the ladder tighten automatically.
// Run: node --import tsx --test scripts/avm-engine-tests/avm-proximity.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { proximityTier, selectByProximityLadder } from "@/lib/valuation/valuation-engine";

const subj: any = { city: "קרית ביאליק", neighborhood: "רמות", street: "הרצל", propertyType: "apartment", rooms: 4, builtSqm: 95, floor: 3, latitude: 32.83, longitude: 35.08 };
// Default ROOFTOP precision so distance tiers apply (AVM 3.2 caps tiers by precision).
const comp = (over: Record<string, unknown>) => ({ source: "govmap", comparableType: "sold", city: "קרית ביאליק", pricePerSqm: 15000, sqm: 95, geocodeResolution: "ROOFTOP", ...over } as any);

test("coordless comparable with no text match → CITY (honest fallback, not faked)", () => {
  assert.equal(proximityTier(subj, comp({ distanceMeters: null, neighborhood: "אחר", street: "אחר" })), "city");
});

test("engine tightens the tier automatically when real coordinates exist", () => {
  assert.equal(proximityTier(subj, comp({ distanceMeters: 20 })), "building");
  assert.equal(proximityTier(subj, comp({ distanceMeters: 100 })), "street");
  assert.equal(proximityTier(subj, comp({ distanceMeters: 250 })), "r300");
  assert.equal(proximityTier(subj, comp({ distanceMeters: 600 })), "r700");
});

test("same neighborhood text reaches the neighborhood tier without coordinates", () => {
  assert.equal(proximityTier(subj, comp({ distanceMeters: null, neighborhood: "רמות", street: "אחר" })), "neighborhood");
});

test("ladder records the tier it actually used (CITY when only city-level evidence)", () => {
  const cityOnly = Array.from({ length: 10 }, (_, i) => comp({ distanceMeters: null, neighborhood: "אחר", externalId: `c${i}`, saleDate: "2025-01-01" }));
  const r = selectByProximityLadder(subj, cityOnly, 6);
  assert.equal(r.tier, "city");
});

test("ladder prefers the nearer tier when nearby coordinated evidence exists", () => {
  const near = Array.from({ length: 8 }, (_, i) => comp({ distanceMeters: 25, externalId: `b${i}`, saleDate: "2025-01-01" }));
  const far = Array.from({ length: 8 }, (_, i) => comp({ distanceMeters: null, neighborhood: "אחר", externalId: `f${i}`, saleDate: "2025-01-01" }));
  const r = selectByProximityLadder(subj, [...near, ...far], 6);
  assert.equal(r.tier, "building");
});
