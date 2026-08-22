// ============================================================================
// ZONO AVM 3.0 — canonical LOCALITY normalization (pure, offline). Proves the
// coverage fix: Hebrew male/haser drift, final letters, punctuation/whitespace,
// AND Hebrew⇄English transliteration all resolve to ONE canonical identity, while
// genuinely different localities stay distinct (no fabricated match).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/avm-locality.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalLocality, sameLocality, canonicalNeighborhood, isLatinLocality } from "../../src/lib/geo/locality.ts";

test("קרית / קריית spelling drift unifies", () => {
  assert.equal(canonicalLocality("קריית ביאליק"), canonicalLocality("קרית ביאליק"));
  assert.ok(sameLocality("קריית ביאליק", "קרית ביאליק"));
});

test("Hebrew ⇄ English transliteration unifies (the proven live gap)", () => {
  assert.ok(sameLocality("קריית ביאליק", "Kiryat Bialik"));
  assert.ok(sameLocality("קרית ביאליק", "Kiryat Bialik"));
  assert.ok(sameLocality("Kiryat Motzkin", "קריית מוצקין"));
  assert.ok(sameLocality("Tel Aviv-Yafo", "תל אביב"));
});

test("punctuation / apostrophes / hyphens / whitespace / casing fold", () => {
  assert.ok(sameLocality("  Kiryat  Bialik ", "kiryat bialik"));
  assert.ok(sameLocality("תל אביב - יפו", "תל אביב יפו"));
  assert.ok(sameLocality("Be'er Sheva", "באר שבע"));
});

test("genuinely different localities stay DISTINCT (no fabricated match)", () => {
  assert.ok(!sameLocality("קרית ים", "קרית מוצקין"));
  assert.ok(!sameLocality("Kiryat Bialik", "Kiryat Yam"));
  assert.ok(!sameLocality("חיפה", "נשר"));
});

test("unknown locality folds to its own stable key (never empty match)", () => {
  const k = canonicalLocality("פרדס חנה כרכור");
  assert.ok(k.length > 0);
  assert.equal(canonicalLocality(""), "");
  assert.equal(canonicalLocality(null), "");
  assert.ok(!sameLocality("", "")); // empty never matches empty
});

test("neighborhood fold strips שכונת + folds drift", () => {
  assert.equal(canonicalNeighborhood("שכונת רמות"), canonicalNeighborhood("רמות"));
});

test("isLatinLocality detects transliterations", () => {
  assert.ok(isLatinLocality("Kiryat Bialik"));
  assert.ok(!isLatinLocality("קרית ביאליק"));
});
