// ============================================================================
// ZONO — Office Intelligence 5.1: canonical locality resolution + territory closure.
// Proves ONE canonical resolver serves territory / offices / agents / discovery:
// קרית ביאליק == קריית ביאליק == "Kiryat Bialik" == "Qiryat Bialik", no substring
// false positives, unrelated cities stay distinct, overlapping territories isolate,
// English offices never vanish by spelling, and discovery dedups across scripts.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/office-intel-5-1-territory.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalLocality, sameLocality } from "../../src/lib/geo/locality.ts";
import { normalizeCityKey, officeInTerritory as officeInTerritoryTL } from "../../src/lib/brokerage-data/territory-logic.ts";
import { cityInTerritory, officeInTerritory, deriveTerritoryAreas } from "../../src/lib/office-intel/office-territory.ts";

// ── 1. ONE canonical resolver, shared everywhere ────────────────────────────
test("territory + office-intel + geo all resolve to the SAME canonical key", () => {
  for (const v of ["קרית ביאליק", "קריית ביאליק", "Kiryat Bialik", "Qiryat Bialik", "  Kiryat  Bialik "]) {
    assert.equal(normalizeCityKey(v), canonicalLocality(v), v);
    assert.equal(normalizeCityKey(v), "קרית ביאליק", v); // canonical Hebrew id
  }
});

// ── 2. Hebrew ktiv + Hebrew↔English aliases collapse (same locality) ─────────
test("קרית/קריית/Kiryat/Qiryat all equal for Bialik / Motzkin / Rehovot", () => {
  assert.ok(sameLocality("קרית ביאליק", "קריית ביאליק"));
  assert.ok(sameLocality("קרית ביאליק", "Kiryat Bialik"));
  assert.ok(sameLocality("Kiryat Bialik", "Qiryat Bialik"));
  assert.ok(sameLocality("קרית מוצקין", "Kiryat Motzkin"));
  assert.ok(sameLocality("רחובות", "Rehovot"));
  assert.ok(sameLocality("רחובות", "Rechovot"));
});

// ── 3. Different localities stay DISTINCT (never a fabricated match) ─────────
test("distinct localities never unify (He and En)", () => {
  assert.ok(!sameLocality("קרית ביאליק", "קרית מוצקין"));
  assert.ok(!sameLocality("Kiryat Bialik", "Kiryat Motzkin"));
  assert.ok(!sameLocality("רחובות", "קרית ביאליק"));
  assert.ok(!sameLocality("Rehovot", "Kiryat Bialik"));
  assert.notEqual(normalizeCityKey("רחובות"), normalizeCityKey("קריית ביאליק"));
});

// ── 4. NO substring false positives ─────────────────────────────────────────
test("substring is never a match (equality of canonical keys only)", () => {
  // "קרית" is a prefix of both Bialik and Motzkin but is not either city.
  assert.equal(cityInTerritory("קרית", ["קרית ביאליק"]), false);
  assert.equal(cityInTerritory("קרית מוצקין", ["קרית ביאליק"]), false);
  // A longer string that CONTAINS the territory name must not match.
  assert.equal(cityInTerritory("קרית ביאליק עילית", ["קרית ביאליק"]), false);
  assert.equal(cityInTerritory("חיפה", ["חי"]), false);
});

// ── 5. English office never vanishes by spelling ────────────────────────────
test("an org territory admits the same office written in English or Hebrew drift", () => {
  const territoryHe = ["קרית ביאליק"];                 // org configured the Hebrew locality
  assert.equal(cityInTerritory("Kiryat Bialik", territoryHe), true);  // English office → admitted
  assert.equal(cityInTerritory("קריית ביאליק", territoryHe), true);   // male/haser drift → admitted
  assert.equal(cityInTerritory("Qiryat Bialik", territoryHe), true);  // alt transliteration → admitted
  // And the reverse: an English territory admits a Hebrew office.
  assert.equal(cityInTerritory("קרית ביאליק", ["Kiryat Bialik"]), true);
});

// ── 6. Overlapping territories isolate correctly ────────────────────────────
test("overlapping territories: each office lands only in the right org", () => {
  const orgA = deriveTerritoryAreas([{ city_name: "חיפה" }, { city_name: "קריית ביאליק" }]);
  const orgB = deriveTerritoryAreas([{ city_name: "קרית מוצקין" }]);
  const bialikOffice = { city: "Kiryat Bialik" };  // English spelling
  const motzkinOffice = { city: "קריית מוצקין" };  // Hebrew drift
  // Bialik office ∈ A, ∉ B
  assert.equal(officeInTerritory(bialikOffice, orgA, false), true);
  assert.equal(officeInTerritory(bialikOffice, orgB, false), false);
  // Motzkin office ∈ B, ∉ A
  assert.equal(officeInTerritory(motzkinOffice, orgA, false), false);
  assert.equal(officeInTerritory(motzkinOffice, orgB, false), true);
});

// ── 7. Rehovot org excludes foreign-city offices (He + En) — the P0 invariant ─
test("Rehovot territory excludes Kiryat Bialik/Motzkin offices in any script", () => {
  const rehovot = new Set(["רחובות", "Rehovot"].map(normalizeCityKey));
  assert.equal(officeInTerritoryTL({ id: "o1", city: "Rehovot" }, rehovot, new Set()), true);
  assert.equal(officeInTerritoryTL({ id: "kb1", city: "Kiryat Bialik" }, rehovot, new Set()), false);
  assert.equal(officeInTerritoryTL({ id: "kb2", city: "קריית ביאליק" }, rehovot, new Set()), false);
  assert.equal(officeInTerritoryTL({ id: "kb3", city: "Kiryat Motzkin" }, rehovot, new Set()), false);
});

// ── 8. Discovery dedup: same locality across scripts is ONE crawl key ────────
test("discovery scope dedups a locality written in different scripts", () => {
  const scope = new Map<string, string>();
  for (const raw of ["קרית ביאליק", "קריית ביאליק", "Kiryat Bialik", "Qiryat Bialik"]) {
    scope.set(canonicalLocality(raw), raw); // key = canonical → one entry
  }
  assert.equal(scope.size, 1, "four spellings of one city must dedup to a single crawl target");
  // …but two genuinely different cities remain two crawl targets.
  const scope2 = new Map<string, string>();
  for (const raw of ["Kiryat Bialik", "Kiryat Motzkin"]) scope2.set(canonicalLocality(raw), raw);
  assert.equal(scope2.size, 2);
});

// ── 9. Empty territory ⇒ nothing (UNKNOWN ≠ everything) ──────────────────────
test("no territory config ⇒ activity-only, never the global universe", () => {
  assert.equal(officeInTerritory({ city: "חיפה" }, [], false), false);
  assert.equal(officeInTerritory({ city: "חיפה" }, [], true), true);
});
