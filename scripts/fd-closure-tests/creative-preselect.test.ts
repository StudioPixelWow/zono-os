// ============================================================================
// ZONO — Creative Studio 2.2: deterministic PURE coverage for URL preselection,
// the canonical goal/format enums, opportunity→preselect mapping, and the
// distribution handoff eligibility. Generation + rendering are HUMAN_E2E.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/creative-preselect.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePreselect, isCreativeGoal, isCreativeFormat, distributionHandoffHref,
  CREATIVE_GOALS, CREATIVE_FORMATS, GOAL_LABEL_HE, FORMAT_LABEL_HE,
} from "../../src/lib/creative-studio/creative-preselect.ts";
import { deriveCreativeOpportunities } from "../../src/lib/creative-studio/creative-opportunities.ts";

// ── A/C valid preselect ───────────────────────────────────────────────────────
test("A/C: valid goal + format preselect are returned", () => {
  const r = parsePreselect({ goal: "property_ad_post", format: "story_9_16" });
  assert.equal(r.goal, "property_ad_post");
  assert.equal(r.format, "story_9_16");
});

// ── B/D invalid ignored ───────────────────────────────────────────────────────
test("B/D: invalid goal/format are ignored (null), never passed through", () => {
  assert.deepEqual(parsePreselect({ goal: "hack", format: "square" }), { goal: null, format: null });
  assert.deepEqual(parsePreselect({ goal: null, format: undefined }), { goal: null, format: null });
  assert.equal(isCreativeGoal("property_ad"), false); // shorthand is NOT a real goal
  assert.equal(isCreativeFormat("feed"), false);
});

// ── J: canonical enums are exactly the real engine's values ───────────────────
test("J: canonical goal/format enums match the real engine", () => {
  assert.deepEqual([...CREATIVE_GOALS], ["property_ad_post", "sold_post", "testimonial_post"]);
  assert.deepEqual([...CREATIVE_FORMATS], ["feed_1_1", "feed_4_5", "story_9_16"]);
  for (const g of CREATIVE_GOALS) assert.ok(GOAL_LABEL_HE[g]?.length);
  for (const f of CREATIVE_FORMATS) assert.ok(FORMAT_LABEL_HE[f]?.length);
});

// ── E: MISSING_STORY → story preselection ONLY ────────────────────────────────
test("E: a MISSING_STORY opportunity deep-links format=story_9_16", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  const [opp] = deriveCreativeOpportunities({
    properties: [{ id: "p1", title: "נכס", city: "חיפה", neighborhood: null, image: null, status: "active" }],
    outputs: [{ propertyId: "p1", format: "feed_1_1", createdAtMs: now - 86_400_000 }],
    nowMs: now,
  });
  assert.equal(opp.type, "MISSING_STORY");
  assert.equal(opp.studioHref, "/creative-studio/property/p1?format=story_9_16");
});
test("NO_CREATIVE does not fabricate a goal/format in the href", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  const [opp] = deriveCreativeOpportunities({
    properties: [{ id: "p9", title: "נכס", city: "חיפה", neighborhood: null, image: null, status: "active" }],
    outputs: [], nowMs: now,
  });
  assert.equal(opp.type, "NO_CREATIVE");
  assert.equal(opp.studioHref, "/creative-studio/property/p9"); // no ?goal/?format
});

// ── G/H: distribution handoff eligibility ─────────────────────────────────────
test("G: an APPROVED property creative gets the marketing-plan handoff", () => {
  assert.equal(distributionHandoffHref({ entityType: "property", entityId: "p1", isApproved: true }), "/distribution/marketing-plan/p1");
});
test("H: non-property or non-approved → NO fake distribution CTA", () => {
  assert.equal(distributionHandoffHref({ entityType: "property", entityId: "p1", isApproved: false }), null);
  assert.equal(distributionHandoffHref({ entityType: "agent", entityId: "a1", isApproved: true }), null);
});
