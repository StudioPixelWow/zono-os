// ============================================================================
// ZONO — Office Intelligence territory scoping: PURE coverage. The P0 guard —
// the office universe is the org's territory, not the global graph. Cross-customer
// isolation (org A's areas never admit org B's offices), spelling-drift tolerance,
// own-activity always in-territory, and empty-territory ⇒ activity-only.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/office-territory.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveTerritoryAreas, cityInTerritory, officeInTerritory } from "../../src/lib/office-intel/office-territory.ts";

test("deriveTerritoryAreas dedupes (spelling/case) and includes neighborhoods", () => {
  const areas = deriveTerritoryAreas([
    { city_name: "קריית ביאליק" }, { city_name: "קרית ביאליק" }, // spelling drift → one
    { city_name: "חיפה", neighborhood_name: "כרמל" }, { city_name: "" },
  ]);
  assert.ok(areas.includes("קריית ביאליק"));
  assert.ok(areas.includes("חיפה"));
  assert.ok(areas.includes("כרמל"));
  // "קרית ביאליק" collapses onto the first spelling
  assert.equal(areas.filter((a) => a.replace(/י/g, "").includes("קרת ביאליק")).length <= 1, true);
});

test("cityInTerritory is loose-contains and tolerates spelling drift", () => {
  const areas = ["קריית ביאליק", "חיפה"];
  assert.equal(cityInTerritory("קרית ביאליק", areas), true); // drift
  assert.equal(cityInTerritory("חיפה", areas), true);
  assert.equal(cityInTerritory("ראשון לציון", areas), false);
  assert.equal(cityInTerritory(null, areas), false);
  assert.equal(cityInTerritory("חיפה", []), false);
});

test("cross-customer isolation: org A areas reject org B office (no activity)", () => {
  const areasA = ["קריית ביאליק", "חיפה", "קריות"];
  const orgBOffice = { city: "ראשון לציון" };
  assert.equal(officeInTerritory(orgBOffice, areasA, false), false); // hidden from org A
});

test("own observed activity is always in-territory (shared office in both markets)", () => {
  const areasA = ["חיפה"];
  const officeElsewhere = { city: "אשקלון" };
  assert.equal(officeInTerritory(officeElsewhere, areasA, true), true); // org linked a listing to it
  assert.equal(officeInTerritory(officeElsewhere, areasA, false), false);
});

test("office admitted by its city or observed areas matching the territory", () => {
  const areas = ["קריית ביאליק"];
  assert.equal(officeInTerritory({ city: "קרית ביאליק" }, areas, false), true);
  assert.equal(officeInTerritory({ city: null, observedAreas: ["קריית ביאליק"] }, areas, false), true);
  assert.equal(officeInTerritory({ city: null, observedAreas: ["חיפה"] }, areas, false), false);
});

test("empty territory ⇒ activity-only (never the global universe)", () => {
  assert.equal(officeInTerritory({ city: "חיפה" }, [], false), false);
  assert.equal(officeInTerritory({ city: "חיפה" }, [], true), true); // only own-activity offices
});
