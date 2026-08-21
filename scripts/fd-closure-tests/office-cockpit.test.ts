// ============================================================================
// ZONO — Office Intelligence COCKPIT: deterministic PURE coverage. Encodes the
// P0 fix (no territory cut → the honest universe = offices with OBSERVED
// activity, plus an explicit unassigned pool), office→agent/listing aggregation,
// observed-inventory concentration (never "market share"), brand-network view,
// bounded + paginated + searchable directory, evidence-gated ZONO (≤3, hidden
// without evidence), no identity merge (ENGINE_REQUIRED), and honest empty/
// partial states. Cross-org isolation + drawer scoping are server/RLS.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/office-cockpit.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOfficeCockpit, officeDetail, countPossibleDuplicateOfficeNames,
  type OfficeRecord, type OfficeFilters, type OfficeInput,
} from "../../src/lib/office-intel/cockpit.ts";

const NOW = Date.parse("2026-08-21T12:00:00Z");
const F = (o: Partial<OfficeFilters> = {}): OfficeFilters => ({ city: null, search: null, period: 30, page: 1, ...o });
function O(p: Partial<OfficeRecord> & { id: string; name: string }): OfficeRecord {
  return { brand: null, officeType: null, hierarchy: null, city: "חיפה", phone: null, rating: null, reviews: null, status: "active", agents: 0, observedListings: 0, areas: [], propertyTypes: [], newInPeriod: 0, firstSeenMs: null, lastSeenMs: null, lat: null, lng: null, agentSample: [], ...p };
}
function input(o: Partial<OfficeInput> = {}): OfficeInput {
  return { offices: [], unassignedAgents: 0, unassignedListings: 0, totalObservedListings: 0, totalDetectedOffices: 0, filters: F(), nowMs: NOW, ...o };
}

// ── 1/2: honest universe — offices with observed activity, NOT territory-cut ──
test("1: active universe = offices with a linked agent or listing (candidates excluded from KPI)", () => {
  const offices = [
    O({ id: "a", name: "RE/MAX", agents: 5, observedListings: 20 }),
    O({ id: "b", name: "אנגלו", agents: 0, observedListings: 3 }),
    O({ id: "c", name: "מועמד ריק", agents: 0, observedListings: 0 }), // candidate, no activity
  ];
  const cc = buildOfficeCockpit(input({ offices, totalDetectedOffices: 302, totalObservedListings: 100 }));
  assert.equal(cc.kpis.find((k) => k.key === "active_offices")!.value, 2); // a + b, not c
  assert.ok(/302/.test(cc.dataQuality.note)); // total detected disclosed honestly
});

// ── 3/4: directory bounded + paginated (candidates included, activity first) ──
test("3: directory bounds to a page and orders active offices first", () => {
  const offices = [
    ...Array.from({ length: 20 }, (_, i) => O({ id: `c${i}`, name: `מועמד ${String(i).padStart(2, "0")}` })), // no activity
    O({ id: "act", name: "פעיל", agents: 3, observedListings: 9 }),
  ];
  const p1 = buildOfficeCockpit(input({ offices, totalDetectedOffices: 21 })).directory;
  assert.equal(p1.rows.length, 15);
  assert.equal(p1.total, 21);
  assert.equal(p1.rows[0].id, "act"); // active first
  const p2 = buildOfficeCockpit(input({ offices, filters: F({ page: 2 }) })).directory;
  assert.equal(p2.rows.length, 6);
  assert.equal(p2.page, 2);
});

// ── 5/6: office → agent + listing aggregation drives landscape ────────────────
test("5: landscape ranks offices by observed inventory with agent counts", () => {
  const offices = [O({ id: "a", name: "גדול", agents: 8, observedListings: 40 }), O({ id: "b", name: "קטן", agents: 2, observedListings: 10 })];
  const cc = buildOfficeCockpit(input({ offices, totalObservedListings: 60 }));
  assert.equal(cc.landscape[0].name, "גדול");
  assert.equal(cc.landscape[0].agents, 8);
  assert.equal(cc.kpis.find((k) => k.key === "listings")!.value, 50);
});

// ── 7/8: unassigned agents + listings surfaced honestly ───────────────────────
test("7: unassigned agents/listings are surfaced, not hidden", () => {
  const cc = buildOfficeCockpit(input({ offices: [O({ id: "a", name: "פעיל", agents: 3, observedListings: 5 })], unassignedAgents: 156, unassignedListings: 40, totalObservedListings: 100 }));
  assert.equal(cc.kpis.find((k) => k.key === "unassigned")!.value, 156);
  assert.equal(cc.unassigned.agents, 156);
  assert.equal(cc.unassigned.listings, 40);
});

// ── 9: office identity variants are NOT merged, only reported ──────────────────
test("9: RE/MAX and REMAX offices stay separate; duplicates reported", () => {
  const offices = [O({ id: "a", name: "RE/MAX", agents: 2, observedListings: 5 }), O({ id: "b", name: "REMAX", agents: 1, observedListings: 3 })];
  const cc = buildOfficeCockpit(input({ offices, totalObservedListings: 8 }));
  assert.equal(cc.kpis.find((k) => k.key === "active_offices")!.value, 2); // not merged
  assert.ok(cc.dataQuality.possibleDuplicateNames >= 2);
  assert.equal(cc.identity.status, "engine_required");
  assert.equal(countPossibleDuplicateOfficeNames(["RE/MAX", "REMAX", "אנגלו"]), 2);
});

// ── 10: brand-network view aggregates offices per brand ───────────────────────
test("10: brand rows aggregate offices/listings/agents per network", () => {
  const offices = [
    O({ id: "a", name: "רי/מקס חיפה", brand: "RE/MAX", agents: 3, observedListings: 12 }),
    O({ id: "b", name: "רי/מקס קריות", brand: "RE/MAX", agents: 2, observedListings: 8 }),
    O({ id: "c", name: "עצמאי", brand: null, agents: 1, observedListings: 4 }),
  ];
  const cc = buildOfficeCockpit(input({ offices, totalObservedListings: 24 }));
  const remax = cc.brands.find((b) => b.brand === "RE/MAX")!;
  assert.equal(remax.offices, 2);
  assert.equal(remax.observedListings, 20);
});

// ── 11/12: concentration = share of OBSERVED inventory, never market share ─────
test("11: concentration reports observed-inventory share with methodology wording", () => {
  const offices = [O({ id: "a", name: "גדול", agents: 1, observedListings: 60 }), O({ id: "b", name: "קטן", agents: 1, observedListings: 20 })];
  const c = buildOfficeCockpit(input({ offices, totalObservedListings: 100 })).concentration;
  assert.equal(c.totalObserved, 100);
  assert.equal(c.top[0].sharePct, 60); // 60/100 of observed
  assert.ok(/המלאי הנצפה/.test(c.topShareLabel));
});

// ── 13: no fabricated trend series ────────────────────────────────────────────
test("13: the model exposes no office trend time-series", () => {
  const cc = buildOfficeCockpit(input({ offices: [O({ id: "a", name: "x", agents: 1, observedListings: 2 })], totalObservedListings: 2 }));
  assert.ok(!("trend" in cc) && !("series" in cc));
});

// ── 14/15: ZONO evidence-gated, ≤3 ────────────────────────────────────────────
test("14: no ZONO observation without evidence", () => {
  assert.equal(buildOfficeCockpit(input({ offices: [O({ id: "a", name: "x", agents: 0, observedListings: 0 })] })).insights.length, 0);
});
test("15: ZONO observations are capped at 3 and evidence-backed", () => {
  const offices = [
    O({ id: "a", name: "גדול", brand: "RE/MAX", agents: 4, observedListings: 30, areas: [{ name: "כרמל", count: 12 }] }),
    O({ id: "b", name: "רי/מקס 2", brand: "RE/MAX", agents: 2, observedListings: 10, areas: [{ name: "הדר", count: 5 }] }),
  ];
  const ins = buildOfficeCockpit(input({ offices, unassignedAgents: 20, totalObservedListings: 100 })).insights;
  assert.ok(ins.length >= 1 && ins.length <= 3);
  assert.ok(ins.every((i) => i.evidence.length > 0));
});

// ── 16: office drawer scoping ─────────────────────────────────────────────────
test("16: officeDetail returns one office by id", () => {
  const offices = [O({ id: "a", name: "פעיל", agents: 3, observedListings: 5, propertyTypes: [{ type: "דירה", count: 4 }] })];
  const inp = input({ offices });
  assert.equal(officeDetail(inp, "a")?.observedListings, 5);
  assert.equal(officeDetail(inp, "nope"), null);
});

// ── 17: geography aggregation — office×area, bounded ──────────────────────────
test("17: areas aggregate offices-per-area, bounded, with a leader", () => {
  const offices = [
    O({ id: "a", name: "A", agents: 1, observedListings: 10, areas: [{ name: "כרמל", count: 8 }] }),
    O({ id: "b", name: "B", agents: 1, observedListings: 4, areas: [{ name: "כרמל", count: 3 }] }),
  ];
  const cc = buildOfficeCockpit(input({ offices, totalObservedListings: 14 }));
  const carmel = cc.areas.find((a) => a.name === "כרמל")!;
  assert.equal(carmel.offices, 2);
  assert.equal(carmel.listings, 11);
  assert.equal(carmel.topOffice, "A");
  assert.ok(cc.areas.length <= 8);
});

// ── 18: partial-data (agents but no listings still active) + empty + search ───
test("18: an office with agents but no listings still counts as active", () => {
  const cc = buildOfficeCockpit(input({ offices: [O({ id: "a", name: "רק סוכנים", agents: 4, observedListings: 0 })] }));
  assert.equal(cc.kpis.find((k) => k.key === "active_offices")!.value, 1);
});
test("19: empty universe with no unassigned → hasData false", () => {
  assert.equal(buildOfficeCockpit(input({})).hasData, false);
  assert.equal(buildOfficeCockpit(input({ unassignedAgents: 5 })).hasData, true); // unassigned is itself data
});
test("20: directory search filters offices by name/brand", () => {
  const offices = [O({ id: "a", name: "אנגלו סכסון", agents: 1, observedListings: 2 }), O({ id: "b", name: "רי/מקס", brand: "RE/MAX", agents: 1, observedListings: 2 })];
  const cc = buildOfficeCockpit(input({ offices, filters: F({ search: "אנגלו" }) }));
  assert.equal(cc.directory.total, 1);
  assert.equal(cc.directory.rows[0].name, "אנגלו סכסון");
});
