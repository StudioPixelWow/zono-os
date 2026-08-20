// ============================================================================
// ZONO — Hardening: Israel Sunday-anchored week window (Phase 16, matrix T). PURE.
// Run: node --experimental-strip-types --test scripts/hardening-tests/israel-week-window.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { israelWeekWindow, israelDayKey } from "../../src/lib/trends/model.ts";

// Winter (IST, UTC+2): Wed 2026-01-07 12:00 Israel = 2026-01-07T10:00:00Z.
// The Israel week's Sunday is 2026-01-04; local midnight = 2026-01-03 22:00 UTC.
test("winter: window anchors to Israel Sunday 00:00 (UTC+2)", () => {
  const w = israelWeekWindow(Date.parse("2026-01-07T10:00:00Z"));
  assert.equal(w.weekBucket, "2026-01-04");
  assert.equal(w.sinceIso, "2026-01-03T22:00:00.000Z");
});

// Summer (IDT, UTC+3): Wed 2026-07-08 12:00 Israel = 2026-07-08T09:00:00Z.
// Israel Sunday 2026-07-05; local midnight = 2026-07-04 21:00 UTC.
test("summer: window anchors to Israel Sunday 00:00 (UTC+3, DST)", () => {
  const w = israelWeekWindow(Date.parse("2026-07-08T09:00:00Z"));
  assert.equal(w.weekBucket, "2026-07-05");
  assert.equal(w.sinceIso, "2026-07-04T21:00:00.000Z");
});

test("Sunday-midnight roll: Israel Sat 23:59 and Sun 00:01 fall in DIFFERENT buckets", () => {
  const sat = israelWeekWindow(Date.parse("2026-01-03T21:59:00Z")); // Israel Sat 23:59 (prev week)
  const sun = israelWeekWindow(Date.parse("2026-01-03T22:01:00Z")); // Israel Sun 00:01 (new week)
  assert.notEqual(sat.weekBucket, sun.weekBucket);
  assert.equal(sun.weekBucket, "2026-01-04");
});

test("bucket is stable within an Israel week and increments the next Sunday", () => {
  const sun = israelWeekWindow(Date.parse("2026-01-04T22:00:00Z")); // Israel Sun 2026-01-05 00:00? check via key
  const fri = israelWeekWindow(Date.parse("2026-01-09T12:00:00Z")); // later same Israel week
  assert.equal(sun.weekBucket, fri.weekBucket);
  const nextSun = israelWeekWindow(Date.parse("2026-01-11T12:00:00Z"));
  assert.notEqual(nextSun.weekBucket, fri.weekBucket);
});

test("weekBucket equals the Israel day key of that week's Sunday", () => {
  const w = israelWeekWindow(Date.parse("2026-07-08T09:00:00Z"));
  // 2026-07-05 is the Sunday; its israelDayKey must equal the bucket.
  assert.equal(w.weekBucket, israelDayKey(Date.parse("2026-07-05T09:00:00Z")));
});
