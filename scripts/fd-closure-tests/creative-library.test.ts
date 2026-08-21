// ============================================================================
// ZONO — Creative Studio library: deterministic PURE coverage for the rebuilt
// workspace's view model. Proves bounded pagination (never fetch a whole
// history), stable Hebrew type labels, honest row→card mapping (no fabricated
// image/status), and correct studio-open routing. The consequential paths
// (org-scoped query, generation, signed previews) require the authed runtime +
// storage and are HUMAN_E2E_REQUIRED — no fake PASS here.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/creative-library.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampPageLimit, clampRecent, pageInfo, outputTypeLabel, toCreativeCardView,
  creativeStudioHref, CREATIVE_PAGE_SIZE, CREATIVE_PAGE_MAX,
} from "../../src/lib/creative-studio/library-model.ts";

// ── Bounded pagination — the P0 requirement: never load the whole history ─────
test("page limit is clamped to [1, MAX] and defaults on garbage", () => {
  assert.equal(clampPageLimit(undefined), CREATIVE_PAGE_SIZE);
  assert.equal(clampPageLimit(0), 1);
  assert.equal(clampPageLimit(-5), 1);
  assert.equal(clampPageLimit(9999), CREATIVE_PAGE_MAX);
  assert.equal(clampPageLimit(18), 18);
  assert.equal(clampPageLimit(Number.NaN), CREATIVE_PAGE_SIZE);
});
test("recent is clamped to [1, 12]", () => {
  assert.equal(clampRecent(6), 6);
  assert.equal(clampRecent(100), 12);
  assert.equal(clampRecent(0), 1);
});
test("pageInfo derives nextOffset + hasMore honestly", () => {
  // 18 returned from offset 0 out of 50 total → more remain, next=18
  assert.deepEqual(pageInfo(0, 18, 50), { nextOffset: 18, hasMore: true });
  // last page: offset 36, 14 returned, total 50 → next=50, no more
  assert.deepEqual(pageInfo(36, 14, 50), { nextOffset: 50, hasMore: false });
  // empty result never claims more
  assert.deepEqual(pageInfo(0, 0, 0), { nextOffset: 0, hasMore: false });
});

// ── Labels are stable + product-facing (no forked strings) ────────────────────
test("output type labels map real engine types; unknown → generic", () => {
  assert.equal(outputTypeLabel("property_ad_post"), "פוסט נכס");
  assert.equal(outputTypeLabel("sold_post"), "נמכר");
  assert.equal(outputTypeLabel("testimonial_post"), "המלצת לקוח");
  assert.equal(outputTypeLabel("something_new"), "קריאייטיב");
  assert.equal(outputTypeLabel(null), "קריאייטיב");
});

// ── Row → card mapping is honest: no fabricated image/status ──────────────────
test("card view reflects a real image when present", () => {
  const c = toCreativeCardView({ id: "o1", output_type: "property_ad_post", image_url: "https://x/y.png", status: "generated", property_id: "p1", is_favorite: true, created_at: "2026-01-01" });
  assert.equal(c.id, "o1");
  assert.equal(c.hasImage, true);
  assert.equal(c.imageUrl, "https://x/y.png");
  assert.equal(c.isFavorite, true);
  assert.equal(c.isFailed, false);
  assert.equal(c.typeLabel, "פוסט נכס");
});
test("no image url ⇒ hasImage false (placeholder, never a fake preview)", () => {
  const c = toCreativeCardView({ id: "o2", output_type: "sold_post", image_status: "no_provider", status: "generated" });
  assert.equal(c.hasImage, false);
  assert.equal(c.imageUrl, null);
  assert.equal(c.isFailed, false); // no_provider is "waiting", not a red failure
});
test("failure surfaces only on a real failed status", () => {
  assert.equal(toCreativeCardView({ id: "a", image_status: "failed" }).isFailed, true);
  assert.equal(toCreativeCardView({ id: "b", status: "failed" }).isFailed, true);
  assert.equal(toCreativeCardView({ id: "c", status: "generated" }).isFailed, false);
});

// ── Routing: a card opens its property studio, else its agent studio ──────────
test("studio href prefers property, falls back to agent, else null", () => {
  assert.equal(creativeStudioHref({ propertyId: "p1", agentId: "a1" }), "/creative-studio/property/p1");
  assert.equal(creativeStudioHref({ propertyId: null, agentId: "a1" }), "/creative-studio/agent/a1");
  assert.equal(creativeStudioHref({ propertyId: null, agentId: null }), null);
});
