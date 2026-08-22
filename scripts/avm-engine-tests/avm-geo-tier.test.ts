/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO AVM 3.2 — resolution-aware proximity tiers (tsx). Proves distance tiers
// respect coordinate precision: a STREET-centroid at 0m is STREET (not building),
// a ROOFTOP coordinate can be building, and a coarse coordinate (null distance)
// only reaches text/city tiers — so a city centroid is never a "300m comparable".
// Run: node --import tsx --test scripts/avm-engine-tests/avm-geo-tier.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { proximityTier } from "@/lib/valuation/valuation-engine";

const subj: any = { city: "קרית ביאליק", neighborhood: "גבעת הרקפות", street: "יקינתון", latitude: 32.8333, longitude: 35.1039 };
const c = (over: Record<string, unknown>) => ({ source: "govmap", comparableType: "sold", city: "קרית ביאליק", neighborhood: "גבעת הרקפות", pricePerSqm: 15000, sqm: 95, ...over } as any);

test("STREET-resolution coordinate at 0m → STREET tier, never building", () => {
  assert.equal(proximityTier(subj, c({ distanceMeters: 0, geocodeResolution: "STREET", street: "אחר" })), "street");
});

test("ROOFTOP-resolution coordinate at 0m → building tier", () => {
  assert.equal(proximityTier(subj, c({ distanceMeters: 0, geocodeResolution: "ROOFTOP", street: "אחר", neighborhood: "אחר" })), "building");
});

test("coarse coordinate (null distance) reaches only neighborhood/city, never ≤300m", () => {
  // provider nulls distance for NEIGHBORHOOD/CITY resolution; here it is null
  assert.equal(proximityTier(subj, c({ distanceMeters: null, geocodeResolution: "CITY", neighborhood: "אחר", street: "אחר" })), "city");
  assert.equal(proximityTier(subj, c({ distanceMeters: null, geocodeResolution: "NEIGHBORHOOD", neighborhood: "גבעת הרקפות", street: "אחר" })), "neighborhood");
});

test("STREET-resolution at 250m → r300 (allowed), at 0m capped to street", () => {
  assert.equal(proximityTier(subj, c({ distanceMeters: 250, geocodeResolution: "STREET", street: "אחר", neighborhood: "אחר" })), "r300");
});

test("same-neighborhood text match works with spelling drift", () => {
  assert.equal(proximityTier(subj, c({ distanceMeters: null, geocodeResolution: null, neighborhood: "שכונת גבעת הרקפות", street: "אחר" })), "neighborhood");
});
