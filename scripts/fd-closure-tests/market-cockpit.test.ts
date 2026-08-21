// ============================================================================
// ZONO — Market Intelligence COCKPIT: deterministic PURE coverage for the honest
// intelligence model — filter scope, real period-over-period comparison, series
// that stay DATA_REQUIRED when history can't support them (no fabricated trend),
// neighbourhood aggregation, bounded Top-3 opportunities, evidence-gated ZONO
// insights (≤3, hidden without evidence), DOM buckets, price histogram, bounded
// geo aggregation, and correct ₪/m² derivation. Server reads + org isolation are
// HUMAN_E2E / RLS (not pure-testable here).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/market-cockpit.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketCockpit, applyFilters, computeFacets, buildDailySeries, periodCompare,
  domBuckets, buildPriceHistogram, buildZonoInsights, countOpportunities,
  type MiListing, type CockpitFilters, type CockpitInput, type PriceEvent,
} from "../../src/lib/market-intelligence/command-center.ts";

const NOW = Date.parse("2026-08-21T12:00:00Z");
const DAY = 86_400_000;
const F = (o: Partial<CockpitFilters> = {}): CockpitFilters => ({ city: null, neighborhood: null, propertyType: null, deal: null, roomsMin: null, priceMin: null, priceMax: null, period: 30, ...o });

function L(p: Partial<MiListing> & { id: string }): MiListing {
  return {
    id: p.id, title: p.title ?? "נכס", city: p.city ?? "חיפה", neighborhood: p.neighborhood ?? "כרמל",
    propertyType: p.propertyType ?? "דירה", dealType: p.dealType ?? "sale", price: p.price ?? null, sqm: p.sqm ?? null,
    rooms: p.rooms ?? null, hasAgent: p.hasAgent ?? null, contactPhone: p.contactPhone ?? null,
    opportunityScore: p.opportunityScore ?? null, status: p.status ?? "active", firstSeenMs: p.firstSeenMs ?? null,
    image: p.image ?? null, source: p.source ?? "yad2", lat: p.lat ?? null, lng: p.lng ?? null,
  };
}
function input(over: Partial<CockpitInput>): CockpitInput {
  return { listings: [], priceEvents: [], snapshots: [], filters: F(), nowMs: NOW, ...over };
}

// ── 1: filter scope narrows the workspace ─────────────────────────────────────
test("1: applyFilters scopes by city/deal/rooms/price", () => {
  const ls = [
    L({ id: "a", city: "חיפה", dealType: "sale", rooms: 4, price: 2e6 }),
    L({ id: "b", city: "עכו", dealType: "sale", rooms: 3, price: 1e6 }),
    L({ id: "c", city: "חיפה", dealType: "rent", rooms: 4, price: 5000 }),
  ];
  assert.deepEqual(applyFilters(ls, F({ city: "חיפה" })).map((l) => l.id), ["a", "c"]);
  assert.deepEqual(applyFilters(ls, F({ deal: "sale" })).map((l) => l.id), ["a", "b"]);
  assert.deepEqual(applyFilters(ls, F({ roomsMin: 4 })).map((l) => l.id), ["a", "c"]);
  assert.deepEqual(applyFilters(ls, F({ priceMin: 1_500_000 })).map((l) => l.id), ["a"]);
});

// ── 2: facets come from the FULL set (options never vanish) ───────────────────
test("2: computeFacets enumerates real dimensions from all rows", () => {
  const f = computeFacets([L({ id: "a", city: "חיפה", neighborhood: "כרמל", propertyType: "דירה", rooms: 4, price: 2e6 }), L({ id: "b", city: "עכו", neighborhood: "העתיקה", propertyType: "בית", rooms: 5, price: 3e6 })]);
  assert.deepEqual(f.cities.sort(), ["חיפה", "עכו"].sort());
  assert.deepEqual(f.roomsOptions, [4, 5]);
  assert.equal(f.priceMin, 2e6); assert.equal(f.priceMax, 3e6);
});

// ── 3: daily series buckets timestamps into the window (oldest→newest) ────────
test("3: buildDailySeries produces windowDays points and buckets by day", () => {
  const pts = buildDailySeries([NOW - 1 * DAY, NOW - 1 * DAY, NOW - 5 * DAY], NOW, 30);
  assert.equal(pts.length, 30);
  assert.equal(pts[pts.length - 1].value, 0);   // today has no events
  assert.equal(pts[pts.length - 2].value, 2);   // yesterday's two land together
  assert.equal(pts.reduce((a, p) => a + p.value, 0), 3);
});

// ── 4: period comparison is real (current vs immediately-prior period) ────────
test("4: periodCompare compares the last N days to the preceding N days", () => {
  const pts = buildDailySeries(
    [...Array(6)].map(() => NOW - 2 * DAY).concat([...Array(2)].map(() => NOW - 40 * DAY)), NOW, 90);
  const c = periodCompare(pts, 30);
  assert.equal(c.current, 6); assert.equal(c.previous, 2);
  assert.equal(c.deltaPct, 200); // (6-2)/2
});

// ── 5/6: series stay DATA_REQUIRED with NO points when history can't support ──
test("5: inventory & median-₪/m² series are DATA_REQUIRED with zero fabricated points", () => {
  const cc = buildMarketCockpit(input({ listings: [L({ id: "x", firstSeenMs: NOW - 3 * DAY })] }));
  const inv = cc.series.find((s) => s.key === "inventory")!;
  const med = cc.series.find((s) => s.key === "median_ppsqm")!;
  assert.equal(inv.status, "data_required"); assert.equal(inv.points.length, 0); assert.ok(inv.note);
  assert.equal(med.status, "data_required"); assert.equal(med.points.length, 0);
  const nl = cc.series.find((s) => s.key === "new_listings")!;
  assert.equal(nl.status, "ready"); assert.equal(nl.points.length, 90); // real, from first_seen
  // no series is ever labelled "demand"
  assert.ok(cc.series.every((s) => !/demand|ביקוש/i.test(s.label)));
});

// ── 7: DOM bucket boundaries (ותק מודעה, not time-to-sale) ────────────────────
test("7: domBuckets place ages on correct boundaries", () => {
  const ls = [
    L({ id: "a", firstSeenMs: NOW - 5 * DAY }),   // 0–14
    L({ id: "b", firstSeenMs: NOW - 14 * DAY }),  // 0–14 (edge)
    L({ id: "c", firstSeenMs: NOW - 20 * DAY }),  // 15–30
    L({ id: "d", firstSeenMs: NOW - 45 * DAY }),  // 31–60
    L({ id: "e", firstSeenMs: NOW - 90 * DAY }),  // 60+
  ];
  const { buckets, total } = domBuckets(ls, NOW);
  assert.equal(total, 5);
  assert.equal(buckets.find((b) => b.key === "0_14")!.count, 2);
  assert.equal(buckets.find((b) => b.key === "15_30")!.count, 1);
  assert.equal(buckets.find((b) => b.key === "31_60")!.count, 1);
  assert.equal(buckets.find((b) => b.key === "60_plus")!.count, 1);
});

// ── 8: price histogram needs enough real listings, else DATA_REQUIRED ─────────
test("8: histogram is DATA_REQUIRED under the minimum, ready above it", () => {
  assert.equal(buildPriceHistogram([1e6, 2e6, 3e6]).status, "data_required");
  const many = Array.from({ length: 40 }, (_, i) => 1_000_000 + i * 50_000);
  const h = buildPriceHistogram(many);
  assert.equal(h.status, "ready");
  assert.equal(h.bands.reduce((a, b) => a + b.count, 0), 40);
  assert.ok(h.bands.some((b) => b.isMedianBand));
});

// ── 9: bounded Top-3 opportunities + honest total ─────────────────────────────
test("9: opportunities are capped at 3 while the total reflects every qualifier", () => {
  const ls = Array.from({ length: 6 }, (_, i) => L({ id: `o${i}`, opportunityScore: 80, price: 2e6, sqm: 100 }));
  const cc = buildMarketCockpit(input({ listings: ls }));
  assert.equal(cc.opportunities.length, 3);
  assert.equal(cc.opportunitiesTotal, 6);
  assert.equal(countOpportunities(ls, new Set()), 6);
});

// ── 10: opportunity ranking preserved (high score first) ──────────────────────
test("10: a high-score opportunity outranks a low-score one", () => {
  const cc = buildMarketCockpit(input({ listings: [L({ id: "lo", opportunityScore: 72, price: 2e6, sqm: 100 }), L({ id: "hi", opportunityScore: 95, price: 2e6, sqm: 100 })] }));
  assert.equal(cc.opportunities[0].id, "hi");
});

// ── 11/12: ZONO insights are evidence-gated and capped at 3 ───────────────────
test("11: no ZONO insight without evidence", () => {
  const cc = buildMarketCockpit(input({ listings: [L({ id: "x", price: 2e6, sqm: 100, firstSeenMs: NOW - 3 * DAY })] }));
  assert.equal(cc.zonoInsights.length, 0); // nothing crosses an evidence threshold
});
test("12: ZONO insights never exceed 3 and each carries evidence", () => {
  // area with many reductions (concentration) + a deeply-below-benchmark listing
  const base = [L({ id: "m1", price: 2_000_000, sqm: 100 }), L({ id: "m2", price: 2_100_000, sqm: 100 }), L({ id: "m3", price: 1_900_000, sqm: 100 })];
  const cheap = L({ id: "cheap", price: 1_400_000, sqm: 100 }); // 30% below ~20k median
  const events: PriceEvent[] = ["m1", "m2", "m3", "cheap"].flatMap((id) => [0, 1, 2].map((k) => ({ tsMs: NOW - (k + 1) * DAY, listingId: id, oldPrice: 2e6, newPrice: 1.9e6 })));
  const cc = buildMarketCockpit(input({ listings: [...base, cheap], priceEvents: events }));
  assert.ok(cc.zonoInsights.length >= 1 && cc.zonoInsights.length <= 3);
  assert.ok(cc.zonoInsights.every((i) => i.what.length > 0 && i.why.length > 0));
  assert.ok(cc.zonoInsights.some((i) => i.kind === "reductions_concentration" || i.kind === "below_benchmark"));
});

// ── 13: correct ₪/m² derivation drives below-benchmark evidence ───────────────
test("13: below-benchmark insight uses real ₪/m² vs the area median", () => {
  const ls = [L({ id: "a", price: 2e6, sqm: 100 }), L({ id: "b", price: 2e6, sqm: 100 }), L({ id: "c", price: 2e6, sqm: 100 }), L({ id: "cheap", price: 1_500_000, sqm: 100 })];
  const ins = buildZonoInsights(ls, [], NOW, F());
  const below = ins.find((i) => i.kind === "below_benchmark");
  assert.ok(below, "a 25%-below listing yields a below-benchmark insight");
  assert.ok(/25% מתחת/.test(below!.what));
});

// ── 14: geo aggregation is bounded to areas and averages real centroids ───────
test("14: geo aggregates by neighbourhood with averaged centroids, bounded", () => {
  const ls = [
    L({ id: "a", neighborhood: "כרמל", lat: 32.80, lng: 34.98, price: 2e6, sqm: 100 }),
    L({ id: "b", neighborhood: "כרמל", lat: 32.82, lng: 35.00, price: 2e6, sqm: 100 }),
    L({ id: "c", neighborhood: "הדר", lat: 32.81, lng: 34.99 }),
  ];
  const cc = buildMarketCockpit(input({ listings: ls }));
  assert.ok(cc.geo.length <= new Set(ls.map((l) => l.neighborhood)).size);
  const carmel = cc.geo.find((g) => g.name === "כרמל")!;
  assert.equal(carmel.inventory, 2);
  assert.ok(Math.abs(carmel.lat! - 32.81) < 0.001); // averaged centroid
});

// ── 15: pulse reports REAL period change, never invents inventory delta ───────
test("15: pulse carries real new-listing counts and a hottest area", () => {
  const ls = [
    ...Array.from({ length: 4 }, (_, i) => L({ id: `n${i}`, neighborhood: "כרמל", firstSeenMs: NOW - 2 * DAY })),
    L({ id: "o", neighborhood: "הדר", firstSeenMs: NOW - 3 * DAY }),
  ];
  const cc = buildMarketCockpit(input({ listings: ls, filters: F({ period: 30 }) }));
  assert.equal(cc.pulse.newThisPeriod, 5);
  assert.equal(cc.pulse.hottestArea?.name, "כרמל");
  assert.equal(cc.pulse.hottestArea?.count, 4);
});

// ── 16: empty input → calm honest empty cockpit (no fabricated anything) ──────
test("16: empty listings yield hasData=false and empty modules", () => {
  const cc = buildMarketCockpit(input({}));
  assert.equal(cc.hasData, false);
  assert.equal(cc.scopedCount, 0);
  assert.equal(cc.opportunities.length, 0);
  assert.equal(cc.zonoInsights.length, 0);
  assert.equal(cc.priceHistogram.status, "data_required");
  assert.equal(cc.geo.length, 0);
});
