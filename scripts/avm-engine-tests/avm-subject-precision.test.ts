/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO AVM 3.3 — SUBJECT-side precision safety (tsx). A subject with a coarse or
// unknown-precision coordinate must never unlock distance tiers, even against a
// perfectly precise comparable — its own distance would be meaningless.
// Run: node --import tsx --test scripts/avm-engine-tests/avm-subject-precision.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { proximityTier } from "@/lib/valuation/valuation-engine";

const rooftopComp = (over: Record<string, unknown>) => ({
  source: "govmap", comparableType: "sold", city: "קרית ביאליק", neighborhood: "אחר", street: "אחר",
  pricePerSqm: 15000, sqm: 95, distanceMeters: 20, geocodeResolution: "ROOFTOP", ...over,
} as any);
const subj = (res: string | null) => ({ city: "קרית ביאליק", neighborhood: "רמות", street: "שדרות", latitude: 32.83, longitude: 35.08, locationResolution: res } as any);

test("CITY-resolution subject → distance tiers blocked (falls to city)", () => {
  assert.equal(proximityTier(subj("CITY"), rooftopComp({ distanceMeters: 20 })), "city");
  assert.equal(proximityTier(subj("CITY"), rooftopComp({ distanceMeters: 250 })), "city");
});

test("NEIGHBORHOOD-resolution subject → no ≤300m/≤700m (text neighborhood still ok)", () => {
  assert.equal(proximityTier(subj("NEIGHBORHOOD"), rooftopComp({ distanceMeters: 250, neighborhood: "אחר" })), "city");
  assert.equal(proximityTier(subj("NEIGHBORHOOD"), rooftopComp({ distanceMeters: 250, neighborhood: "רמות" })), "neighborhood");
});

test("unknown-precision subject (null resolution) → distance tiers blocked", () => {
  assert.equal(proximityTier(subj(null), rooftopComp({ distanceMeters: 20 })), "city");
});

test("STREET subject → street/≤300m/≤700m allowed, but never building", () => {
  assert.equal(proximityTier(subj("STREET"), rooftopComp({ distanceMeters: 20 })), "street"); // capped below building
  assert.equal(proximityTier(subj("STREET"), rooftopComp({ distanceMeters: 250 })), "r300");
  assert.equal(proximityTier(subj("STREET"), rooftopComp({ distanceMeters: 600 })), "r700");
});

test("ROOFTOP subject + ROOFTOP comp → building", () => {
  assert.equal(proximityTier(subj("ROOFTOP"), rooftopComp({ distanceMeters: 20 })), "building");
});
