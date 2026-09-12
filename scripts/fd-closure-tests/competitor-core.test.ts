// ZONO — Competitor Intelligence core tests. Proves the engine is activity-based
// (not name-based), self-excluding, territory-gated, and that false-competitor
// pairs (different cities, no shared neighborhoods) score ~0.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distributionOverlap, scoreCompetitor, rankCompetitors, computeMomentum,
  COMPETITOR_WEIGHTS, type OfficeFootprint,
} from "../../src/lib/office-intel/competitor-core.ts";

const fp = (id: string, p: Partial<OfficeFootprint>): OfficeFootprint => ({
  officeId: id, neighborhoods: {}, cities: {}, propertyTypes: {}, total: 0, new30d: 0, brokers: 0, ...p,
});

test("weights sum to 1.0 (documented, no hidden bias)", () => {
  const s = Object.values(COMPETITOR_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s - 1) < 1e-9);
});

test("distributionOverlap: identical → 1, disjoint → 0", () => {
  assert.equal(distributionOverlap({ a: 5, b: 5 }, { a: 5, b: 5 }), 1);
  assert.equal(distributionOverlap({ a: 1 }, { z: 1 }), 0);
  assert.equal(distributionOverlap({}, { a: 1 }), 0);
});

test("self can never be its own competitor", () => {
  const a = fp("O1", { neighborhoods: { גליל: 10 }, cities: { חיפה: 10 }, total: 10 });
  assert.equal(scoreCompetitor(a, a), null);
  assert.equal(scoreCompetitor(a, fp("O1", { neighborhoods: { אחר: 3 } })), null);
});

test("true competitors: same city + overlapping neighborhoods score high", () => {
  const target = fp("A", {
    neighborhoods: { "קרית ביאליק מרכז": 20, צורן: 10 }, cities: { "קרית ביאליק": 30 },
    propertyTypes: { apartment: 25, house: 5 }, total: 30, new30d: 8, brokers: 4,
  });
  const rival = fp("B", {
    neighborhoods: { "קרית ביאליק מרכז": 18, צורן: 8 }, cities: { "קרית ביאליק": 26 },
    propertyTypes: { apartment: 22, house: 4 }, total: 26, new30d: 7, brokers: 3,
  });
  const s = scoreCompetitor(target, rival);
  assert.ok(s && s.score >= 70, `expected strong competitor, got ${s?.score}`);
  assert.ok(s!.sharedNeighborhoods.includes("קרית ביאליק מרכז"));
  assert.ok(s!.sharesCity);
});

test("FALSE competitor: different city, no shared neighborhood → territory gate forces ~0", () => {
  const target = fp("A", { neighborhoods: { "קרית ביאליק מרכז": 30 }, cities: { "קרית ביאליק": 30 }, total: 30, new30d: 9, brokers: 5 });
  // Big, fast, broker-rich office — but in a different city with no shared pond.
  const farRival = fp("Z", { neighborhoods: { "רחובות מערב": 40 }, cities: { רחובות: 40 }, total: 40, new30d: 12, brokers: 6 });
  const s = scoreCompetitor(target, farRival);
  assert.ok(s && s.score === 0, `territory gate must zero a non-overlapping office, got ${s?.score}`);
  assert.ok(s!.reasons.some((r) => r.includes("אין חפיפה")));
});

test("name similarity is irrelevant — same brand, different territory ≠ competitor", () => {
  // Two RE/MAX branches with identical names but disjoint neighborhoods & cities.
  const remaxHaifa = fp("RX1", { neighborhoods: { חיפה1: 15 }, cities: { חיפה: 15 }, total: 15, new30d: 4, brokers: 2 });
  const remaxEilat = fp("RX2", { neighborhoods: { אילת1: 15 }, cities: { אילת: 15 }, total: 15, new30d: 4, brokers: 2 });
  const s = scoreCompetitor(remaxHaifa, remaxEilat);
  assert.ok(s && s.score === 0, "same name but no shared territory must not be a competitor");
});

test("rankCompetitors: self dropped, ordered by score, below-threshold filtered", () => {
  const target = fp("A", { neighborhoods: { N1: 20, N2: 10 }, cities: { C: 30 }, total: 30, new30d: 6, brokers: 3 });
  const strong = fp("B", { neighborhoods: { N1: 18, N2: 9 }, cities: { C: 27 }, total: 27, new30d: 6, brokers: 3 });
  const weak = fp("D", { neighborhoods: { N2: 2 }, cities: { C: 2 }, total: 2, new30d: 0, brokers: 1 });
  const far = fp("E", { neighborhoods: { X: 50 }, cities: { OTHER: 50 }, total: 50, new30d: 20, brokers: 8 });
  const ranked = rankCompetitors(target, [target, strong, weak, far], { limit: 5 });
  assert.ok(!ranked.some((r) => r.officeId === "A"), "self excluded");
  assert.ok(!ranked.some((r) => r.officeId === "E"), "far office below threshold / gated out");
  assert.equal(ranked[0].officeId, "B", "strongest competitor first");
});

test("momentum: hot office scores higher than a dormant one; breakdown present", () => {
  const hot = computeMomentum({ new7d: 6, new30d: 18, total: 24, neighborhoods: 8, activeBrokers: 6 });
  const cold = computeMomentum({ new7d: 0, new30d: 1, total: 30, neighborhoods: 2, activeBrokers: 1 });
  assert.ok(hot.score > cold.score);
  assert.ok(hot.score >= 0 && hot.score <= 100);
  assert.equal(hot.breakdown.length, 4);
});
