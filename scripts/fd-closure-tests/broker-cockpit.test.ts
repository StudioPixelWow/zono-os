// ============================================================================
// ZONO — Broker Intelligence COCKPIT: deterministic PURE coverage. The model is
// intelligence, not a phone book, and it is honest: observed-inventory wording
// (never "market share"), no spelling-variant merge (identity = ENGINE_REQUIRED),
// deterministic ranking, bounded + paginated directory, evidence-gated ZONO (≤3,
// hidden without evidence), bounded geo/type aggregation, no fake "new"/trend
// without timestamps, and an explicit no-fake-collaboration state. Cross-org/
// private-CRM isolation + drawer scoping are server/RLS (HUMAN_E2E).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/broker-cockpit.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBrokerCockpit, aggregateBrokers, normalizeBroker, countPossibleDuplicateNames, brokerDetail,
  type BrokerListing, type BrokerFilters, type BrokerInput,
} from "../../src/lib/broker-intel/cockpit.ts";

const NOW = Date.parse("2026-08-21T12:00:00Z");
const DAY = 86_400_000;
const F = (o: Partial<BrokerFilters> = {}): BrokerFilters => ({ city: null, search: null, period: 30, page: 1, ...o });
function L(p: Partial<BrokerListing> & { id: string }): BrokerListing {
  return { id: p.id, broker: p.broker ?? null, hasAgent: p.hasAgent ?? null, neighborhood: p.neighborhood ?? "כרמל", city: p.city ?? "חיפה", propertyType: p.propertyType ?? "דירה", price: p.price ?? null, firstSeenMs: p.firstSeenMs ?? null, lat: p.lat ?? null, lng: p.lng ?? null };
}
function input(o: Partial<BrokerInput> = {}): BrokerInput { return { listings: [], filters: F(), nowMs: NOW, ...o }; }

// ── 1: normalize trims but NEVER merges spelling variants ─────────────────────
test("1: normalizeBroker collapses whitespace but keeps variants distinct", () => {
  assert.equal(normalizeBroker("  RE/MAX   Family "), "RE/MAX Family");
  assert.notEqual(normalizeBroker("RE/MAX"), normalizeBroker("REMAX")); // not merged
  assert.equal(normalizeBroker(""), null);
});

// ── 2: aggregate groups by broker, counts inventory/areas/types/new ───────────
test("2: aggregateBrokers groups and counts real fields", () => {
  const rows = [
    L({ id: "a", broker: "דנה", neighborhood: "כרמל", propertyType: "דירה", firstSeenMs: NOW - 2 * DAY }),
    L({ id: "b", broker: "דנה", neighborhood: "הדר", propertyType: "בית", firstSeenMs: NOW - 40 * DAY }),
    L({ id: "c", broker: "רון", neighborhood: "כרמל" }),
  ];
  const m = aggregateBrokers(rows, NOW, 30);
  assert.equal(m.get("דנה")!.observedInventory, 2);
  assert.equal(m.get("דנה")!.newInPeriod, 1); // only "a" within 30d
  assert.equal(m.get("דנה")!.areas.length, 2);
  assert.equal(m.get("רון")!.observedInventory, 1);
});

// ── 3: directory bounded + paginated ──────────────────────────────────────────
test("3: directory is bounded to a page size and paginates", () => {
  const listings = Array.from({ length: 40 }, (_, i) => L({ id: `l${i}`, broker: `מתווך ${String(i).padStart(2, "0")}` }));
  const p1 = buildBrokerCockpit(input({ listings, filters: F({ page: 1 }) })).directory;
  assert.equal(p1.rows.length, 15);
  assert.equal(p1.total, 40);
  assert.equal(p1.totalPages, 3);
  const p3 = buildBrokerCockpit(input({ listings, filters: F({ page: 3 }) })).directory;
  assert.equal(p3.rows.length, 10);
  assert.equal(p3.page, 3);
});

// ── 4/5: KPI definitions; no fake "new" without a timestamp ───────────────────
test("4: KPIs count distinct brokers, private inventory, and timestamped new-brokers", () => {
  const cc = buildBrokerCockpit(input({ listings: [
    L({ id: "a", broker: "דנה", firstSeenMs: NOW - 3 * DAY }),
    L({ id: "b", broker: "רון", firstSeenMs: null }),      // no timestamp → never "new"
    L({ id: "c", broker: null, hasAgent: false }),           // private owner
  ] }));
  assert.equal(cc.kpis.find((k) => k.key === "brokers")!.value, 2);
  assert.equal(cc.kpis.find((k) => k.key === "private")!.value, 1);
  assert.equal(cc.kpis.find((k) => k.key === "new_brokers")!.value, 1); // only דנה has a timestamp in-period
  assert.ok(cc.kpis.every((k) => k.def.length > 0)); // every KPI carries a definition
});

// ── 6: no fabricated trend series (newly-observed is a count, not a timeline) ─
test("6: the model exposes no broker trend time-series", () => {
  const cc = buildBrokerCockpit(input({ listings: [L({ id: "a", broker: "דנה", firstSeenMs: NOW - DAY })] }));
  assert.equal(typeof cc.newlyObserved.count, "number");
  assert.ok(!("series" in cc.newlyObserved) && !("points" in cc.newlyObserved));
});

// ── 7: concentration is a share of OBSERVED inventory (honest wording) ────────
test("7: concentration reports observed-inventory share, not market share", () => {
  const listings = [
    ...Array.from({ length: 6 }, (_, i) => L({ id: `x${i}`, broker: "גדול" })),
    ...Array.from({ length: 2 }, (_, i) => L({ id: `y${i}`, broker: "קטן" })),
  ];
  const c = buildBrokerCockpit(input({ listings })).concentration;
  assert.equal(c.totalObserved, 8);
  assert.equal(c.top[0].name, "גדול");
  assert.equal(c.top[0].sharePct, 75); // 6/8
  assert.ok(/המלאי הנצפה/.test(c.topShareLabel)); // "observed inventory", never "market share"
});

// ── 8: broker ranking deterministic ───────────────────────────────────────────
test("8: landscape ranks by observed inventory, deterministically", () => {
  const listings = [L({ id: "a", broker: "ב" }), L({ id: "b", broker: "א" }), L({ id: "c", broker: "א" })];
  const cc = buildBrokerCockpit(input({ listings }));
  assert.equal(cc.landscape[0].name, "א"); // 2 > 1
  assert.deepEqual(buildBrokerCockpit(input({ listings })).landscape.map((r) => r.name), cc.landscape.map((r) => r.name));
});

// ── 9: area competition — listings per observed broker, bounded ───────────────
test("9: area density computes listings-per-broker over distinct brokers", () => {
  const listings = [
    L({ id: "a", broker: "דנה", neighborhood: "כרמל" }),
    L({ id: "b", broker: "רון", neighborhood: "כרמל" }),
    L({ id: "c", broker: "דנה", neighborhood: "כרמל" }),
  ];
  const area = buildBrokerCockpit(input({ listings })).areas.find((a) => a.name === "כרמל")!;
  assert.equal(area.listings, 3);
  assert.equal(area.brokers, 2);
  assert.equal(area.listingsPerBroker, 1.5);
});

// ── 10: duplicate identity is reported, never silently merged ──────────────────
test("10: RE/MAX and REMAX stay separate; duplicates are only reported", () => {
  const listings = [L({ id: "a", broker: "RE/MAX" }), L({ id: "b", broker: "REMAX" }), L({ id: "c", broker: "RE/MAX" })];
  const cc = buildBrokerCockpit(input({ listings }));
  assert.equal(cc.kpis.find((k) => k.key === "brokers")!.value, 2); // NOT merged into one
  assert.ok(cc.dataQuality.possibleDuplicateNames >= 2); // flagged for review
  assert.equal(countPossibleDuplicateNames(["RE/MAX", "REMAX", "רון"]), 2);
});

// ── 11: no fabricated collaboration widget ────────────────────────────────────
test("11: collaboration is honestly ENGINE_REQUIRED, never faked", () => {
  assert.equal(buildBrokerCockpit(input({ listings: [L({ id: "a", broker: "דנה" })] })).collaboration.status, "engine_required");
});

// ── 12/13: ZONO ≤3, hidden without evidence ───────────────────────────────────
test("12: ZONO observations are capped at 3 and evidence-backed", () => {
  const listings = [
    ...Array.from({ length: 5 }, (_, i) => L({ id: `s${i}`, broker: "פעיל", firstSeenMs: NOW - 2 * DAY })),
    ...Array.from({ length: 8 }, (_, i) => L({ id: `c${i}`, broker: `רבים ${i % 3}`, neighborhood: "מרכז", firstSeenMs: NOW - 2 * DAY })),
  ];
  const ins = buildBrokerCockpit(input({ listings })).insights;
  assert.ok(ins.length >= 1 && ins.length <= 3);
  assert.ok(ins.every((i) => i.evidence.length > 0));
});
test("13: no ZONO observation without evidence", () => {
  assert.equal(buildBrokerCockpit(input({ listings: [L({ id: "a", broker: "דנה", firstSeenMs: null })] })).insights.length, 0);
});

// ── 14: geo aggregation bounded + averaged centroid ───────────────────────────
test("14: areas are bounded and carry an averaged centroid", () => {
  const listings = [L({ id: "a", broker: "דנה", neighborhood: "כרמל", lat: 32.80, lng: 34.98 }), L({ id: "b", broker: "רון", neighborhood: "כרמל", lat: 32.82, lng: 35.00 })];
  const cc = buildBrokerCockpit(input({ listings }));
  assert.ok(cc.areas.length <= 8);
  assert.ok(Math.abs(cc.areas.find((a) => a.name === "כרמל")!.lat! - 32.81) < 0.001);
});

// ── 15: property-type specialization ──────────────────────────────────────────
test("15: type specialization lists brokers active per property type", () => {
  const listings = [L({ id: "a", broker: "דנה", propertyType: "דירה" }), L({ id: "b", broker: "דנה", propertyType: "דירה" }), L({ id: "c", broker: "רון", propertyType: "מסחרי" })];
  const spec = buildBrokerCockpit(input({ listings })).typeSpecialization;
  const flat = spec.find((s) => s.type === "דירה")!;
  assert.equal(flat.brokers[0].name, "דנה");
  assert.equal(flat.brokers[0].count, 2);
});

// ── 16: empty dataset → honest empty ──────────────────────────────────────────
test("16: empty listings → hasData=false and empty modules", () => {
  const cc = buildBrokerCockpit(input({}));
  assert.equal(cc.hasData, false);
  assert.equal(cc.landscape.length, 0);
  assert.equal(cc.directory.total, 0);
  assert.equal(cc.insights.length, 0);
});

// ── 17: search bounds the directory ───────────────────────────────────────────
test("17: directory search filters brokers", () => {
  const listings = [L({ id: "a", broker: "דנה כהן" }), L({ id: "b", broker: "רון לוי" })];
  const cc = buildBrokerCockpit(input({ listings, filters: F({ search: "דנה" }) }));
  assert.equal(cc.directory.total, 1);
  assert.equal(cc.directory.rows[0].name, "דנה כהן");
});

// ── 18: broker detail scoping ─────────────────────────────────────────────────
test("18: brokerDetail returns one broker's aggregate", () => {
  const listings = [L({ id: "a", broker: "דנה", propertyType: "דירה" }), L({ id: "b", broker: "דנה", propertyType: "בית" })];
  const d = brokerDetail(input({ listings }), "דנה");
  assert.equal(d?.observedInventory, 2);
  assert.equal(brokerDetail(input({ listings }), "לא-קיים"), null);
});
