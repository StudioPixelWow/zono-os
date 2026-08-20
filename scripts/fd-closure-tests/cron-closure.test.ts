// ============================================================================
// ZONO — Cron / Background Automation Closure: deterministic pure-unit coverage.
// Covers the parts of the background-automation test matrix that are pure and
// verifiable without an authenticated runtime:
//   Z/A — cron authorization contract (fails closed; exact Bearer match)
//   V/E — per-org/per-item isolation (one failure never aborts the batch)
//   I/J — buyer-match dedup key is deterministic per buyer-per-day (concurrent/
//         replay safe) — the fix for the previous random-uuid key
//   S/T — Israel-day boundary is DST-aware (summer UTC+3 vs winter UTC+2)
// The overlap/claim/provider-idempotency/double-fire items require the authed
// runtime + a live DB and are reported HUMAN_REQUIRED in the batch report (no
// fake PASS). Run:
//   node --experimental-strip-types --test scripts/fd-closure-tests/cron-closure.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCronAuthorized } from "../../src/lib/cron/auth.ts";
import { runIsolated } from "../../src/lib/follow-up/isolate.ts";
import { israelDayKey, buyerMatchDedupKey, buyerMatchEventKey } from "../../src/lib/customer-comm/match-bundle-keys.ts";

// ── Z/A — cron auth contract ─────────────────────────────────────────────────
test("Z: cron auth fails closed when CRON_SECRET is unset", () => {
  assert.equal(isCronAuthorized(undefined, "Bearer whatever"), false);
  assert.equal(isCronAuthorized(null, "Bearer whatever"), false);
  assert.equal(isCronAuthorized("", "Bearer "), false); // empty secret is not a bypass
});
test("A: cron auth requires an exact Bearer match", () => {
  assert.equal(isCronAuthorized("s3cr3t", "Bearer s3cr3t"), true);
  assert.equal(isCronAuthorized("s3cr3t", "Bearer wrong"), false);
  assert.equal(isCronAuthorized("s3cr3t", "s3cr3t"), false);        // missing scheme
  assert.equal(isCronAuthorized("s3cr3t", null), false);            // missing header
  assert.equal(isCronAuthorized("s3cr3t", "bearer s3cr3t"), false); // case-sensitive scheme
});

// ── V/E — per-item isolation ─────────────────────────────────────────────────
test("V: one item throwing does not abort the batch; others still run", async () => {
  const seen: number[] = [];
  const { results, failed } = await runIsolated(
    [1, 2, 3, 4],
    async (n) => { if (n === 2) throw new Error("boom"); seen.push(n); return n * 10; },
  );
  assert.deepEqual(seen, [1, 3, 4]);          // 2 threw but 3 and 4 still ran
  assert.deepEqual(results, [10, 30, 40]);    // successful results preserved, in order
  assert.equal(failed, 1);
});
test("E: isolation reports every failure via onError and counts them", async () => {
  const errs: string[] = [];
  const { results, failed } = await runIsolated(
    ["a", "b", "c"],
    async (s) => { throw new Error(`fail-${s}`); },
    (item, err) => errs.push(`${item}:${err instanceof Error ? err.message : ""}`),
  );
  assert.deepEqual(results, []);
  assert.equal(failed, 3);
  assert.deepEqual(errs, ["a:fail-a", "b:fail-b", "c:fail-c"]);
});
test("E: empty batch is a clean no-op", async () => {
  const { results, failed } = await runIsolated([], async (x) => x);
  assert.deepEqual(results, []);
  assert.equal(failed, 0);
});

// ── I/J — buyer-match dedup key determinism ──────────────────────────────────
test("I: buyer-match dedup key is deterministic per buyer-per-day (no random component)", () => {
  const t = new Date("2026-07-21T09:00:00Z").getTime();
  const k1 = buyerMatchDedupKey("buyer-1", t);
  const k2 = buyerMatchDedupKey("buyer-1", t + 3 * 3_600_000); // 3h later, same Israel day
  assert.equal(k1, k2);                                        // concurrent/replay → identical key
  assert.equal(k1, "buyer-match:buyer-1:2026-07-21");
  assert.notEqual(k1, buyerMatchDedupKey("buyer-2", t));       // different buyer → different key
});
test("J: event idempotency key mirrors the dedup identity per buyer-day", () => {
  const t = new Date("2026-07-21T09:00:00Z").getTime();
  assert.equal(buyerMatchEventKey("buyer-1", t), "buyer.matches_ready:buyer-1:2026-07-21");
  assert.equal(buyerMatchEventKey("buyer-1", t), buyerMatchEventKey("buyer-1", t + 5 * 3_600_000));
});

// ── S/T — Israel-day boundary is DST-aware ───────────────────────────────────
test("S: summer day boundary rolls at 21:00 UTC (Asia/Jerusalem = UTC+3)", () => {
  assert.equal(israelDayKey(new Date("2026-07-21T20:59:00Z").getTime()), "2026-07-21"); // 23:59 local
  assert.equal(israelDayKey(new Date("2026-07-21T21:00:00Z").getTime()), "2026-07-22"); // 00:00 local next day
});
test("T: winter day boundary rolls at 22:00 UTC (Asia/Jerusalem = UTC+2)", () => {
  assert.equal(israelDayKey(new Date("2026-01-15T21:59:00Z").getTime()), "2026-01-15"); // 23:59 local
  assert.equal(israelDayKey(new Date("2026-01-15T22:00:00Z").getTime()), "2026-01-16"); // 00:00 local next day
});
