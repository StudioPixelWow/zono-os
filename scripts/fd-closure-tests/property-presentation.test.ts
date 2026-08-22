// ============================================================================
// ZONO — Property PUBLIC presentation resolver: the HEBREW_ONLY_PUBLIC_UI boundary.
// Guarantees known property-feature/type/status enums resolve to Hebrew, and that
// UNKNOWN internal/English (snake_case / ASCII-only) tokens can NEVER leak into
// the public UI (features dropped; type/status fall back to a safe Hebrew value).
// This tests the presentation boundary — NOT a brittle whole-bundle English grep.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/property-presentation.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePropertyFeature, resolvePropertyFeatures,
  resolvePropertyType, resolvePropertyTypeLabel, resolvePropertyStatus,
  isInternalToken,
} from "../../src/lib/property-marketing/presentation.ts";

const hasHebrew = (s: string) => /[֐-׿]/.test(s);
const asciiOnly = (s: string) => /^[\x00-\x7F]+$/.test(s);

test("known feature enums resolve to Hebrew (the six flagged in QA + more)", () => {
  const cases: Record<string, string> = {
    air_conditioning: "מיזוג אוויר",
    renovated: "משופצת",
    upgraded_kitchen: "מטבח משודרג",
    solar_heater: "דוד שמש",
    pandor_doors: "דלתות פנדור",
    bars: "סורגים",
  };
  for (const [raw, he] of Object.entries(cases)) {
    const r = resolvePropertyFeature(raw);
    assert.ok(r, `expected a resolution for ${raw}`);
    assert.equal(r!.label, he);
    assert.ok(hasHebrew(r!.label));
    assert.ok(r!.icon && r!.icon.length > 0);
  }
});

test("free-text variants (spaces / caps) still resolve", () => {
  assert.equal(resolvePropertyFeature("solar heater")?.label, "דוד שמש");
  assert.equal(resolvePropertyFeature("Upgraded Kitchen")?.label, "מטבח משודרג");
  assert.equal(resolvePropertyFeature("PANDOR DOORS")?.label, "דלתות פנדור");
});

test("unknown internal/English tokens are NEVER exposed (returns null)", () => {
  for (const raw of ["legacy_backfill", "internal_entity", "has_journey", "some_random_key", "air_condition_v2", "xyz"]) {
    assert.equal(resolvePropertyFeature(raw), null, `${raw} must not resolve`);
  }
});

test("already-Hebrew free text passes through with an icon", () => {
  const r = resolvePropertyFeature("חדר כביסה");
  assert.ok(r);
  assert.equal(r!.label, "חדר כביסה");
  assert.ok(r!.icon);
});

test("resolvePropertyFeatures drops raw tokens, keeps Hebrew, de-dupes", () => {
  const out = resolvePropertyFeatures([
    "air_conditioning", "renovated", "legacy_backfill", "renovated", // dup
    "internal_entity", "solar heater", "מרפסת שמש",
  ]);
  // NO label may be ASCII-only (i.e. raw English/internal must never survive).
  for (const f of out) assert.ok(hasHebrew(f.label) && !asciiOnly(f.label), `leaked: ${f.label}`);
  const labels = out.map((f) => f.label);
  assert.ok(labels.includes("מיזוג אוויר"));
  assert.ok(labels.includes("משופצת"));
  assert.ok(labels.includes("דוד שמש"));
  assert.equal(labels.filter((l) => l === "משופצת").length, 1); // de-duped
  assert.ok(!labels.some((l) => l.includes("legacy") || l.includes("internal")));
});

test("non-string / empty inputs are safe", () => {
  assert.equal(resolvePropertyFeature(null), null);
  assert.equal(resolvePropertyFeature(123), null);
  assert.equal(resolvePropertyFeature("   "), null);
  assert.deepEqual(resolvePropertyFeatures(null), []);
  assert.deepEqual(resolvePropertyFeatures("nope"), []);
});

test("property type enums resolve to Hebrew incl. importer spelling variants", () => {
  assert.equal(resolvePropertyType("apartment"), "דירה");
  assert.equal(resolvePropertyType("flat"), "דירה");
  assert.equal(resolvePropertyType("penthouseapp"), "פנטהאוז");
  assert.equal(resolvePropertyType("gardenapartment"), "דירת גן");
  assert.equal(resolvePropertyType("dualcottage"), "קוטג׳ דו-משפחתי");
});

test("unknown internal type → null, but label helper never leaks it", () => {
  assert.equal(resolvePropertyType("weird_internal_type"), null);
  assert.equal(resolvePropertyTypeLabel("weird_internal_type"), "נכס");
  assert.ok(hasHebrew(resolvePropertyTypeLabel("anything_unknown")));
});

test("status enums resolve to Hebrew", () => {
  assert.equal(resolvePropertyStatus("active"), "למכירה");
  assert.equal(resolvePropertyStatus("under_offer"), "בהצעה");
  assert.equal(resolvePropertyStatus("sold"), "נמכר");
  assert.equal(resolvePropertyStatus("weird_status"), null);
});

test("isInternalToken flags ASCII-only strings", () => {
  assert.equal(isInternalToken("air_conditioning"), true);
  assert.equal(isInternalToken("מיזוג אוויר"), false);
});
