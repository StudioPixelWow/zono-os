// ============================================================================
// ZONO AVM 3.0 — evidence-quality + property-type models (pure, offline). Proves
// the confidence/range/recency/type behaviors the live QA demanded: CITY-tier and
// stale and dispersed evidence lower confidence; dispersion widens the range;
// recency decays gracefully; a penthouse is not an apartment.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/avm-evidence-quality.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeConfidence, computeRange, recencyDecay, robustDispersion,
  confidenceBand, confidenceLabelHe, type ConfidenceInputs,
} from "../../src/lib/valuation/evidence-quality.ts";
import { propertyTypeFamily, typeRelation } from "../../src/lib/valuation/property-type.ts";

const baseC: ConfidenceInputs = {
  tier: "neighborhood", comparableCount: 20, strongCount: 10, medianAgeMonths: 4,
  avgSimilarity: 75, typeMatchShare: 1, sourceDiversity: 2, relIQR: 0.15, hasGeo: true,
};

test("CITY tier yields lower confidence than NEIGHBORHOOD tier", () => {
  const near = computeConfidence({ ...baseC, tier: "neighborhood" });
  const city = computeConfidence({ ...baseC, tier: "city" });
  assert.ok(city < near, `city ${city} should be < neighborhood ${near}`);
});

test("stale evidence lowers confidence vs fresh", () => {
  const fresh = computeConfidence({ ...baseC, medianAgeMonths: 4 });
  const stale = computeConfidence({ ...baseC, medianAgeMonths: 60 });
  assert.ok(stale < fresh - 10, `stale ${stale} should be well below fresh ${fresh}`);
});

test("high dispersion lowers confidence AND widens range", () => {
  const tight = computeConfidence({ ...baseC, relIQR: 0.1 });
  const wide = computeConfidence({ ...baseC, relIQR: 0.6 });
  assert.ok(wide < tight);
  const rTight = computeRange(1_000_000, 70, 0.1);
  const rWide = computeRange(1_000_000, 70, 0.6);
  assert.ok(rWide.spreadPct > rTight.spreadPct, `wide ${rWide.spreadPct} > tight ${rTight.spreadPct}`);
});

test("HIGH confidence + CITY + big dispersion can NEVER be ±5%", () => {
  const r = computeRange(1_000_000, 90, 0.5);
  assert.ok(r.spreadPct > 5, `spread ${r.spreadPct}% must exceed cosmetic 5%`);
});

test("thin same-type evidence lowers confidence", () => {
  const same = computeConfidence({ ...baseC, typeMatchShare: 1 });
  const mixed = computeConfidence({ ...baseC, typeMatchShare: 0 });
  assert.ok(mixed < same, `mixed-type ${mixed} < same-type ${same}`);
});

test("recency decays gracefully and monotonically, never below floor", () => {
  assert.ok(recencyDecay(0) >= recencyDecay(12));
  assert.ok(recencyDecay(12) > recencyDecay(60));
  assert.ok(recencyDecay(240) >= 0.2);
  assert.ok(recencyDecay(1) <= 1);
});

test("robustDispersion computes relative IQR", () => {
  const d = robustDispersion([10000, 12000, 14000, 16000, 18000, 20000]);
  assert.ok(d.median! > 0 && d.relIQR > 0);
  assert.equal(robustDispersion([]).relIQR, 0);
});

test("confidence bands + Hebrew labels", () => {
  assert.equal(confidenceBand(80), "high");
  assert.equal(confidenceBand(60), "medium");
  assert.equal(confidenceBand(30), "low");
  assert.equal(confidenceLabelHe(80), "גבוהה");
  assert.equal(confidenceLabelHe(60), "בינונית");
  assert.equal(confidenceLabelHe(30), "מוגבלת");
});

test("penthouse is NOT the same family as apartment; different types flagged", () => {
  assert.equal(propertyTypeFamily("penthouse"), "penthouse");
  assert.equal(propertyTypeFamily("פנטהאוז"), "penthouse");
  assert.equal(propertyTypeFamily("דירה בבית קומות"), "apartment");
  assert.equal(propertyTypeFamily("דירת גן"), "garden");
  assert.notEqual(propertyTypeFamily("penthouse"), propertyTypeFamily("apartment"));
  assert.equal(typeRelation("apartment", "land"), "different");
  assert.equal(typeRelation("apartment", "apartment"), "same");
  assert.equal(typeRelation("penthouse", "other"), "unknown");
});
