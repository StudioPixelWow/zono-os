import { test } from "node:test";
import assert from "node:assert/strict";
import { strongKey, mergeVerdict } from "../../src/lib/broker/canonical-core.ts";

test("phone is the strong key across formats", () => {
  assert.deepEqual(strongKey("050-123-4567", null), strongKey("+972501234567", null));
  assert.equal(strongKey("0501234567", null)?.kind, "phone");
});
test("email is the strong key when no phone", () => {
  assert.equal(strongKey(null, "Tal@X.com")?.kind, "email");
  assert.equal(strongKey(null, "Tal@X.com")?.key, "e:tal@x.com");
});
test("name-only has no strong key (never clusters cross-source)", () => {
  assert.equal(strongKey(null, null), null);
  assert.equal(strongKey("", "not-an-email"), null);
});
test("phone cluster with one name → confident merge", () => {
  const v = mergeVerdict("phone", 1);
  assert.equal(v.merges, true); assert.equal(v.verification, "high");
});
test("phone cluster with multiple names → ambiguous, NOT merged", () => {
  const v = mergeVerdict("phone", 3);
  assert.equal(v.merges, false); assert.equal(v.verification, "ambiguous");
});
test("name-only is low and never merges", () => {
  const v = mergeVerdict("name", 1);
  assert.equal(v.merges, false); assert.equal(v.verification, "low");
});
