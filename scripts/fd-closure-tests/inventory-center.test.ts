// ============================================================================
// ZONO — Properties Inventory Command Center: PURE derivation coverage. Encodes
// the honest-signal invariants: attention reasons come only from real fields and
// priority-order correctly; terminal/priced properties don't raise attention; the
// ZONO brief is evidence-gated (≤3, never a zero-count observation); KPIs count
// honestly; sort/paginate are bounded & deterministic.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/inventory-center.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attentionFor, inventoryKpis, inventoryBrief, sortRows, paginate,
  isSortKey, PAGE_SIZE, isTerminal, type InvProp,
} from "../../src/lib/properties/inventory-center.ts";

const NOW = Date.parse("2026-08-22T12:00:00Z");
const P = (o: Partial<InvProp> & { id: string }): InvProp => ({
  status: "active", price: 1_000_000, monthly_rent: null, listing_kind: "sale",
  primary_image_url: "img.jpg", rooms: 4, size_sqm: 90, updated_at: "2026-08-21T12:00:00Z",
  has_exclusivity: false, ...o,
});
const coverAll = () => true;
const coverNone = () => false;

test("attention priority: image → price → unpublished → details → stale", () => {
  // no cover wins even if everything else is fine
  assert.equal(attentionFor(P({ id: "a" }), false, NOW)?.key, "no_image");
  // has cover, no price
  assert.equal(attentionFor(P({ id: "b", price: null }), true, NOW)?.key, "no_price");
  // rent with no monthly_rent → no_price
  assert.equal(attentionFor(P({ id: "b2", listing_kind: "rent", price: null, monthly_rent: null }), true, NOW)?.key, "no_price");
  // priced draft → unpublished
  assert.equal(attentionFor(P({ id: "c", status: "draft" }), true, NOW)?.key, "unpublished");
  // missing details
  assert.equal(attentionFor(P({ id: "d", rooms: null }), true, NOW)?.key, "missing_details");
  // stale (updated 30d ago)
  assert.equal(attentionFor(P({ id: "e", updated_at: "2026-07-20T12:00:00Z" }), true, NOW)?.key, "stale");
  // fully healthy → null
  assert.equal(attentionFor(P({ id: "f" }), true, NOW), null);
});

test("terminal properties never raise attention or count as active", () => {
  for (const s of ["sold", "rented", "archived", "withdrawn"]) {
    assert.ok(isTerminal(s));
    assert.equal(attentionFor(P({ id: "t", status: s, primary_image_url: null }), false, NOW), null);
  }
});

test("KPIs count honestly (active / exclusive / sale / rent / attention)", () => {
  const rows = [
    P({ id: "1", has_exclusivity: true }),
    P({ id: "2", listing_kind: "rent", monthly_rent: 5000, price: null }),
    P({ id: "3", status: "sold" }),                 // terminal — excluded
    P({ id: "4", primary_image_url: null }),        // needs attention (no image)
  ];
  const k = inventoryKpis(rows, (id) => id !== "4", NOW); // #4 has no cover
  assert.equal(k.active, 3);
  assert.equal(k.exclusive, 1);
  assert.equal(k.forRent, 1);
  assert.equal(k.forSale, 2);
  assert.equal(k.needsAttention, 1);
});

test("ZONO brief is evidence-gated: ≤3, no zero-count observation", () => {
  const rows = [
    P({ id: "a", primary_image_url: null }),
    P({ id: "b", primary_image_url: null }),
    P({ id: "c", price: null }),
    P({ id: "d", status: "draft" }),
  ];
  const brief = inventoryBrief(rows, coverAll, NOW); // coverAll → image never the reason
  // With covers present: #a/#b become healthy, #c=no_price, #d=unpublished
  assert.ok(brief.length <= 3);
  for (const b of brief) assert.ok(b.count > 0);
  const keys = brief.map((b) => b.key);
  assert.ok(keys.includes("no_price"));
  assert.ok(keys.includes("unpublished"));
  assert.ok(!keys.includes("no_image")); // zero count → omitted
});

test("empty inventory → empty brief, zero KPIs", () => {
  assert.deepEqual(inventoryBrief([], coverAll, NOW), []);
  assert.deepEqual(inventoryKpis([], coverAll, NOW), { active: 0, exclusive: 0, forSale: 0, forRent: 0, needsAttention: 0 });
});

test("sort is deterministic and bounded; isSortKey guards input", () => {
  assert.equal(isSortKey("price_desc"), true);
  assert.equal(isSortKey("bogus"), false);
  const rows = [P({ id: "lo", price: 100 }), P({ id: "hi", price: 900 }), P({ id: "mid", price: 500 })];
  assert.deepEqual(sortRows(rows, "price_desc", coverAll, NOW).map((r) => r.id), ["hi", "mid", "lo"]);
  assert.deepEqual(sortRows(rows, "price_asc", coverAll, NOW).map((r) => r.id), ["lo", "mid", "hi"]);
});

test("paginate is cumulative (load-more) and never exceeds bounds", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i) }));
  const p1 = paginate(rows, 1);
  assert.equal(p1.items.length, PAGE_SIZE);
  assert.equal(p1.pages, 3);
  const p2 = paginate(rows, 2);
  assert.equal(p2.items.length, PAGE_SIZE * 2);
  const p9 = paginate(rows, 9); // clamps
  assert.equal(p9.items.length, 30);
  assert.equal(p9.page, 3);
  assert.deepEqual(paginate([], 1).items, []);
});
