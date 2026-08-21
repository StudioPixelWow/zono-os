// ============================================================================
// ZONO — Market Intelligence COMMAND CENTER: deterministic PURE coverage that the
// synthesized view model is honest — real deltas, prioritized opportunities with
// disclosed reasons, below-market detection vs the AREA median, a real price-drop
// trend, and DATA_REQUIRED gating for the long-horizon locality trend (never a
// fabricated line). Server reads + rendering are HUMAN_E2E.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/market-command-center.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCommandCenter, dealKind, pricePerSqm, median, TREND_MIN_POINTS,
  type MiListing, type CommandCenterInput,
} from "../../src/lib/market-intelligence/command-center.ts";

const NOW = Date.parse("2026-08-21T12:00:00Z");
const DAY = 86_400_000;

function L(p: Partial<MiListing> & { id: string }): MiListing {
  return {
    id: p.id, title: p.title ?? "נכס", city: p.city ?? "חיפה", neighborhood: p.neighborhood ?? "כרמל",
    propertyType: p.propertyType ?? "apartment", dealType: p.dealType ?? "sale",
    price: p.price ?? null, sqm: p.sqm ?? null, rooms: p.rooms ?? null,
    hasAgent: p.hasAgent ?? null, contactPhone: p.contactPhone ?? null,
    opportunityScore: p.opportunityScore ?? null, status: p.status ?? "active",
    firstSeenMs: p.firstSeenMs ?? null, image: p.image ?? null, source: p.source ?? "yad2",
  };
}
function input(over: Partial<CommandCenterInput>): CommandCenterInput {
  return { listings: [], priceEventMs: [], droppedListingIds: [], snapshots: [], nowMs: NOW, ...over };
}

// ── A: sale/rent normalization (never guesses from price) ─────────────────────
test("A: dealKind maps aliases and rejects junk", () => {
  for (const s of ["sale", "project_sale", "sell", "buy"]) assert.equal(dealKind(s), "sale");
  for (const r of ["rent", "rental", "lease"]) assert.equal(dealKind(r), "rent");
  for (const x of [null, undefined, "", "sold", "foo"]) assert.equal(dealKind(x as string), null);
});

// ── B: ₪/m² null-safety ───────────────────────────────────────────────────────
test("B: pricePerSqm needs a positive price AND sqm", () => {
  assert.equal(pricePerSqm({ price: 2_000_000, sqm: 100 }), 20_000);
  for (const bad of [{ price: null, sqm: 100 }, { price: 0, sqm: 100 }, { price: 2e6, sqm: null }, { price: 2e6, sqm: 0 }])
    assert.equal(pricePerSqm(bad), null);
});

// ── C: median even/odd/empty ──────────────────────────────────────────────────
test("C: median handles odd, even and empty", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

// ── D: empty input → no data, zero primary, safe shape ────────────────────────
test("D: empty input yields hasData=false and a zeroed primary", () => {
  const cc = buildCommandCenter(input({}));
  assert.equal(cc.hasData, false);
  assert.equal(cc.primary.value, 0);
  assert.equal(cc.opportunities.length, 0);
  assert.equal(cc.priceDropTrend, null);
  assert.equal(cc.localityTrend.status, "data_required");
});

// ── E: below-market is measured vs the AREA median, and surfaces a reason ─────
test("E: a listing ≤90% of its area ₪/m² median is flagged below-market with a % reason", () => {
  // Carmel median ₪/m² ≈ 20k (three normal), one priced at 15k/m² = 75% → below.
  const listings = [
    L({ id: "a", price: 2_000_000, sqm: 100 }), // 20k
    L({ id: "b", price: 2_100_000, sqm: 100 }), // 21k
    L({ id: "c", price: 1_900_000, sqm: 100 }), // 19k
    L({ id: "d", price: 1_500_000, sqm: 100 }), // 15k → below
  ];
  const cc = buildCommandCenter(input({ listings }));
  const belowKpi = cc.kpis.find((k) => k.key === "below_avg");
  assert.equal(belowKpi?.value, 1);
  const opp = cc.opportunities.find((o) => o.id === "d");
  assert.ok(opp, "below-market listing must appear in the opportunity queue");
  assert.ok(opp!.reasons.some((r) => r.includes("מתחת")), "reason discloses % below area");
});

// ── F: new-today KPI carries a real day-over-day delta ────────────────────────
test("F: new-today delta compares the last 24h to the prior 24h", () => {
  const listings = [
    L({ id: "t1", firstSeenMs: NOW - 2 * 3600_000 }),      // today
    L({ id: "t2", firstSeenMs: NOW - 5 * 3600_000 }),      // today
    L({ id: "y1", firstSeenMs: NOW - DAY - 3600_000 }),    // yesterday
  ];
  const cc = buildCommandCenter(input({ listings }));
  const k = cc.kpis.find((x) => x.key === "new_today");
  assert.equal(k?.value, 2);
  assert.equal(k?.delta, 1); // 2 today − 1 yesterday
  assert.ok(k?.deltaLabel?.includes("+1"));
});

// ── G: private-owner sale targets (no agent + phone + sale), not rent/agented ─
test("G: private-owner recruitment counts sale + no-agent + phone only", () => {
  const listings = [
    L({ id: "p1", dealType: "sale", hasAgent: false, contactPhone: "050-1", price: 2e6, sqm: 100 }),
    L({ id: "p2", dealType: "sale", hasAgent: true, contactPhone: "050-2" }),  // agented → no
    L({ id: "p3", dealType: "rent", hasAgent: false, contactPhone: "050-3" }), // rental → no
    L({ id: "p4", dealType: "sale", hasAgent: false, contactPhone: "" }),      // no phone → no
  ];
  const cc = buildCommandCenter(input({ listings }));
  assert.equal(cc.kpis.find((k) => k.key === "private")?.value, 1);
  assert.ok(cc.opportunities.find((o) => o.id === "p1")?.reasons.some((r) => r.includes("בעלים פרטי")));
});

// ── H: opportunity queue is reasons-only, ranked, and price-drop tagged ───────
test("H: only listings with a real reason qualify; drops are tagged; ranked desc", () => {
  const listings = [
    L({ id: "plain", price: 2e6, sqm: 100, opportunityScore: 10 }),           // no reason
    L({ id: "hi", price: 2e6, sqm: 100, opportunityScore: 85 }),              // high score reason
    L({ id: "drop", price: 2e6, sqm: 100, opportunityScore: 20 }),            // price-drop reason
  ];
  const cc = buildCommandCenter(input({ listings, droppedListingIds: ["drop"] }));
  const ids = cc.opportunities.map((o) => o.id);
  assert.ok(!ids.includes("plain"), "a listing with no signal is not an 'opportunity'");
  assert.ok(ids.includes("hi") && ids.includes("drop"));
  assert.ok(cc.opportunities.find((o) => o.id === "drop")!.reasons.some((r) => r.includes("ירידת מחיר")));
  // ranked by internal score desc (high opportunity_score outranks a low-score drop)
  assert.equal(cc.opportunities[0].id, "hi");
  assert.ok(cc.opportunities.every((o) => o.href.startsWith("/external-listings/")));
});

// ── I: real price-drop trend buckets into the window and normalizes ───────────
test("I: price-drop trend totals events, buckets to 30 days, normalizes to ≤1", () => {
  const evts = [NOW - 1 * DAY, NOW - 1 * DAY, NOW - 1 * DAY, NOW - 10 * DAY, NOW - 25 * DAY];
  const cc = buildCommandCenter(input({ listings: [L({ id: "x" })], priceEventMs: evts }));
  const t = cc.priceDropTrend!;
  assert.ok(t, "trend present with ≥3 events");
  assert.equal(t.total, 5);
  assert.equal(t.raw.length, 30);
  assert.equal(t.series01.length, 30);
  assert.equal(Math.max(...t.series01), 1); // normalized to peak
  assert.ok(t.series01.every((v) => v >= 0 && v <= 1));
});
test("I2: fewer than 3 drop events → no fabricated trend (null)", () => {
  const cc = buildCommandCenter(input({ listings: [L({ id: "x" })], priceEventMs: [NOW - DAY, NOW - 2 * DAY] }));
  assert.equal(cc.priceDropTrend, null);
});

// ── J: locality trend is DATA_REQUIRED when thin, ready when deep enough ──────
test("J: sparse snapshots → DATA_REQUIRED with honest have/need counts", () => {
  const snaps = [
    { date: "2026-08-19", localityName: "חיפה", avgPricePerSqm: 20000 },
    { date: "2026-08-20", localityName: "חיפה", avgPricePerSqm: 20500 },
  ];
  const cc = buildCommandCenter(input({ listings: [L({ id: "x" })], snapshots: snaps }));
  assert.equal(cc.localityTrend.status, "data_required");
  if (cc.localityTrend.status === "data_required") {
    assert.equal(cc.localityTrend.havePoints, 2);
    assert.equal(cc.localityTrend.needPoints, TREND_MIN_POINTS);
  }
});
test("J2: enough daily points → a real, sorted, normalized locality trend", () => {
  const snaps = Array.from({ length: TREND_MIN_POINTS }, (_, i) => ({
    date: `2026-08-${String(10 + i).padStart(2, "0")}`, localityName: "חיפה", avgPricePerSqm: 20000 + i * 100,
  }));
  const cc = buildCommandCenter(input({ listings: [L({ id: "x" })], snapshots: snaps.reverse() }));
  assert.equal(cc.localityTrend.status, "ready");
  if (cc.localityTrend.status === "ready") {
    assert.equal(cc.localityTrend.points.length, TREND_MIN_POINTS);
    // sorted ascending by date despite reversed input
    assert.ok(cc.localityTrend.points[0].date < cc.localityTrend.points[1].date);
    assert.equal(Math.max(...cc.localityTrend.series01), 1);
  }
});

// ── K: feed newest-first + source mix ordered desc + confidence = %price&sqm ──
test("K: feed is newest-first, source mix is ranked, confidence = share with ₪/m²", () => {
  const listings = [
    L({ id: "old", firstSeenMs: NOW - 5 * DAY, source: "yad2", price: 1e6, sqm: 50 }),
    L({ id: "new", firstSeenMs: NOW - 1 * 3600_000, source: "madlan", price: null, sqm: null }),
    L({ id: "mid", firstSeenMs: NOW - 2 * DAY, source: "yad2", price: 2e6, sqm: 100 }),
  ];
  const cc = buildCommandCenter(input({ listings }));
  assert.equal(cc.feed[0].id, "new"); // newest first
  assert.equal(cc.sourceMix[0].source, "yad2"); // 2 vs 1
  assert.equal(cc.sourceMix[0].count, 2);
  assert.equal(cc.dataConfidence, 67); // 2 of 3 have price+sqm → 67%
});
