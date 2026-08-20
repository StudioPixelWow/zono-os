// ============================================================================
// ZONO — Functional Defects Closure: extension multi-image version gate (D4).
// The claim path refuses a MULTI-IMAGE job when the instance version is missing or
// below MIN_MULTI_IMAGE_VERSION (single-image jobs are unaffected). This proves the
// exact predicate used in extension-service.getNextPost.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/extension-version-gate.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, MIN_MULTI_IMAGE_VERSION } from "../../src/lib/distribution/extension-readiness.ts";

const blockedForMultiImage = (version: string | null | undefined) =>
  !version || compareVersions(version, MIN_MULTI_IMAGE_VERSION) < 0;

test("I: old extension (<1.0.3) is blocked from multi-image", () => {
  assert.equal(blockedForMultiImage("1.0.2"), true);
  assert.equal(blockedForMultiImage("1.0.0"), true);
  assert.equal(blockedForMultiImage("0.9.9"), true);
});

test("I: missing/empty version is blocked (fail-safe)", () => {
  assert.equal(blockedForMultiImage(null), true);
  assert.equal(blockedForMultiImage(undefined), true);
  assert.equal(blockedForMultiImage(""), true);
});

test("J: supported extension (>=1.0.3) may claim a multi-image job", () => {
  assert.equal(blockedForMultiImage("1.0.3"), false);
  assert.equal(blockedForMultiImage("1.1.0"), false);
  assert.equal(blockedForMultiImage("2.0.0"), false);
});

test("floor constant is 1.0.3 (the first multi-image-capable build)", () => {
  assert.equal(MIN_MULTI_IMAGE_VERSION, "1.0.3");
});
