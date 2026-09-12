import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneIL, samePhoneIL, normalizeEmailAddr, sameEmail } from "../../src/lib/util/identity.ts";

test("Israeli phone variants normalize to the same key", () => {
  const forms = ["0501234567", "050-123-4567", "+972501234567", "972501234567", "050 123 4567"];
  const keys = new Set(forms.map(normalizePhoneIL));
  assert.equal(keys.size, 1, `expected one canonical key, got ${[...keys].join(",")}`);
  assert.equal([...keys][0], "501234567");
});
test("samePhoneIL matches across formats, rejects different numbers", () => {
  assert.equal(samePhoneIL("050-123-4567", "+972501234567"), true);
  assert.equal(samePhoneIL("0501234567", "0521234567"), false);
});
test("empty / junk phones never match", () => {
  assert.equal(samePhoneIL("", ""), false);
  assert.equal(samePhoneIL(null, null), false);
  assert.equal(normalizePhoneIL("abc"), "");
});
test("email normalization is case-insensitive and trims", () => {
  assert.equal(normalizeEmailAddr("  Tal@Example.COM "), "tal@example.com");
  assert.equal(sameEmail("A@b.com", "a@B.com"), true);
  assert.equal(normalizeEmailAddr("not-an-email"), "");
});
