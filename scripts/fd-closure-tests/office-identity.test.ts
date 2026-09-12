import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalOfficeIdentity, sameOffice } from "../../src/lib/office-intel/office-identity-core.ts";

test("RE/MAX brand variants (he/en/slash) collapse to one brand", () => {
  const a = canonicalOfficeIdentity("RE/MAX Family", "חיפה");
  const b = canonicalOfficeIdentity("רי/מקס פמילי", "חיפה");
  assert.equal(a.normalizedBrand, "remax");
  assert.equal(b.normalizedBrand, "remax");
});
test("different RE/MAX BRANCHES stay separate (Brand ≠ Branch)", () => {
  assert.equal(sameOffice("RE/MAX Family", "RE/MAX SMART", "חיפה", "חיפה"), false);
});
test("same office different city is a different office", () => {
  assert.equal(sameOffice("CITYZEN", "CITYZEN", "חיפה", "רחובות"), false);
});
test("independent office keys by folded name + city; spelling variants merge", () => {
  assert.equal(sameOffice("ספיר פרימיום נכסים", "ספיר פרימיום נכסים ", "רחובות", "רחובות"), true);
});
test("junk / private advertiser is not a usable office", () => {
  assert.equal(canonicalOfficeIdentity("פרטי").usable, false);
  assert.equal(canonicalOfficeIdentity("").usable, false);
  assert.equal(canonicalOfficeIdentity("owner").usable, false);
});
test("a real agency name is usable", () => {
  assert.equal(canonicalOfficeIdentity("CITYZEN", "חיפה").usable, true);
});
test("two different independent offices do not merge on name alone", () => {
  assert.equal(sameOffice("אדן נדלן", "בונדינג נכסים", "חיפה", "חיפה"), false);
});
