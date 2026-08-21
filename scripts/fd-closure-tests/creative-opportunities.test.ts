// ============================================================================
// ZONO — Creative Studio 2.1: deterministic PURE coverage for the REAL creative-
// opportunity engine. Proves each signal fires only on provable evidence, no
// false positives on well-covered properties, one opportunity per property,
// priority ordering, and honest routing. The org-scoped fetch + generation are
// HUMAN_E2E_REQUIRED — not faked here.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/creative-opportunities.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCreativeOpportunities, DEFAULT_STALE_DAYS } from "../../src/lib/creative-studio/creative-opportunities.ts";

const NOW = Date.parse("2026-06-01T00:00:00Z");
const daysAgo = (d: number) => NOW - d * 86_400_000;
const prop = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `נכס ${id}`, city: "קריית ביאליק", neighborhood: null, image: null, status: "active", ...extra });

test("NO_CREATIVE fires for an active property with zero creatives", () => {
  const r = deriveCreativeOpportunities({ properties: [prop("p1")], outputs: [], nowMs: NOW });
  assert.equal(r.length, 1);
  assert.equal(r[0].type, "NO_CREATIVE");
  assert.equal(r[0].studioHref, "/creative-studio/property/p1");
  assert.match(r[0].reasonHe, /אין עדיין קריאייטיב/);
});

test("STALE_CREATIVE fires when the newest creative is older than the window", () => {
  const r = deriveCreativeOpportunities({
    properties: [prop("p1")],
    outputs: [{ propertyId: "p1", format: "feed_1_1", createdAtMs: daysAgo(DEFAULT_STALE_DAYS + 5) }],
    nowMs: NOW,
  });
  assert.equal(r[0].type, "STALE_CREATIVE");
  assert.equal(r[0].evidence.ageDays, DEFAULT_STALE_DAYS + 5);
});

test("MISSING_STORY fires when there are creatives but none in story format", () => {
  const r = deriveCreativeOpportunities({
    properties: [prop("p1")],
    outputs: [{ propertyId: "p1", format: "feed_1_1", createdAtMs: daysAgo(2) }, { propertyId: "p1", format: "feed_4_5", createdAtMs: daysAgo(1) }],
    nowMs: NOW,
  });
  assert.equal(r[0].type, "MISSING_STORY");
});

test("NO false positive: a fresh, story-covered property yields nothing", () => {
  const r = deriveCreativeOpportunities({
    properties: [prop("p1")],
    outputs: [{ propertyId: "p1", format: "story_9_16", createdAtMs: daysAgo(1) }],
    nowMs: NOW,
  });
  assert.equal(r.length, 0);
});

test("at most one opportunity per property (most urgent wins)", () => {
  // has an old feed creative → STALE takes precedence over MISSING_STORY
  const r = deriveCreativeOpportunities({
    properties: [prop("p1")],
    outputs: [{ propertyId: "p1", format: "feed_1_1", createdAtMs: daysAgo(DEFAULT_STALE_DAYS + 1) }],
    nowMs: NOW,
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].type, "STALE_CREATIVE");
});

test("priority order: NO_CREATIVE > STALE > MISSING_STORY", () => {
  const r = deriveCreativeOpportunities({
    properties: [prop("empty"), prop("stale"), prop("nostory")],
    outputs: [
      { propertyId: "stale", format: "feed_1_1", createdAtMs: daysAgo(DEFAULT_STALE_DAYS + 3) },
      { propertyId: "nostory", format: "feed_1_1", createdAtMs: daysAgo(1) },
    ],
    nowMs: NOW,
  });
  assert.deepEqual(r.map((o) => o.type), ["NO_CREATIVE", "STALE_CREATIVE", "MISSING_STORY"]);
});

test("outputs for other properties never leak across properties (isolation shape)", () => {
  const r = deriveCreativeOpportunities({
    properties: [prop("p1")],
    outputs: [{ propertyId: "OTHER", format: "story_9_16", createdAtMs: daysAgo(1) }],
    nowMs: NOW,
  });
  // p1 has no creatives of its own → NO_CREATIVE (the other property's output is ignored)
  assert.equal(r[0].type, "NO_CREATIVE");
});
