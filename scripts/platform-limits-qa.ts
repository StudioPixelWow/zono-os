// ============================================================================
// ZONO — P6.3 Limits & Cost Controls QA (deterministic, pure-model).
// Proves the canonical resolver without the DB:
//   · plan default / org override precedence · unlimited / unavailable / shadow
//     / observed modes · below/near/at/over thresholds · no monetary fabrication
//   · concurrency classification · Israel month boundary
// Run: npx tsx scripts/platform-limits-qa.ts
// ============================================================================
import {
  LIMIT_DEFS, resolveLimit, effectiveConfigured, limitStatus, needsAtomicEnforcement,
  israelMonthKey, CONCURRENCY_SENSITIVE, type PlanLimitsLike,
} from "../src/lib/limits/model";

let failed = 0;
const ok = (c: boolean, l: string) => { if (c) console.log("  ✓ " + l); else { console.log("  ✗ " + l); failed++; } };
const PLAN: PlanLimitsLike = { seats: 3, operatingAreas: 4, monitoredListings: 2000, aiCallsPerMonth: 2000, syncsPerDay: 6 };

console.log("P6.3 · configured-limit precedence (override → plan default)");
let e = effectiveConfigured(LIMIT_DEFS.seats, PLAN, null);
ok(e.value === 3 && e.source.includes("plan default"), "no override → plan default (seats=3)");
e = effectiveConfigured(LIMIT_DEFS.seats, PLAN, { seats: 10 });
ok(e.value === 10 && e.source.includes("override"), "org override wins (seats=10)");
e = effectiveConfigured(LIMIT_DEFS.aiTokensMonthly, PLAN, null);
ok(e.value === null, "aiTokensMonthly has no plan field → null configured");

console.log("\nP6.3 · thresholds (<80 normal · 80–99 near · ≥100 exceeded)");
ok(limitStatus(2, 10) === "normal", "20% → normal");
ok(limitStatus(8, 10) === "near_limit", "80% → near_limit");
ok(limitStatus(10, 10) === "exceeded", "100% → exceeded");
ok(limitStatus(11, 10) === "exceeded", "110% → exceeded");
ok(limitStatus(5, -1) === "normal", "unlimited → normal");
ok(limitStatus(1, 0) === "exceeded", "zero-limit with usage → exceeded");

console.log("\nP6.3 · canonical resolution modes");
let r = resolveLimit(LIMIT_DEFS.seats, 3, 1, "plan default");
ok(r.mode === "SHADOW" && !r.exceeded && r.remaining === 2 && r.status === "normal", "seats 1/3 → SHADOW, remaining 2, not exceeded");
r = resolveLimit(LIMIT_DEFS.seats, 1, 1, "plan default");
ok(r.exceeded === true && r.status === "exceeded" && r.mode === "SHADOW", "seats 1/1 → would-block (exceeded) but SHADOW (not enforced)");
r = resolveLimit(LIMIT_DEFS.seats, -1, 5, "plan default");
ok(r.mode === "UNLIMITED" && r.remaining === null && !r.exceeded, "seats -1 → UNLIMITED, never exceeded");
r = resolveLimit(LIMIT_DEFS.seats, 3, null, "plan default");
ok(r.mode === "UNAVAILABLE" && !r.exceeded, "usage source null → UNAVAILABLE");
r = resolveLimit(LIMIT_DEFS.aiTokensMonthly, null, 12345, "no plan field");
ok(r.mode === "OBSERVED" && r.remaining === null && !r.exceeded, "AI tokens tracked w/o cap → OBSERVED");

console.log("\nP6.3 · AI monetary budget is NEVER fabricated");
r = resolveLimit(LIMIT_DEFS.aiMonetaryBudget, null, null, "n/a");
ok(r.mode === "UNAVAILABLE" && r.configuredLimit === null && r.usage === null, "AI monetary budget → UNAVAILABLE (no ₪/$ invented)");
ok(LIMIT_DEFS.aiMonetaryBudget.usageSource.includes("אין מקור עלות"), "monetary budget documents 'no authoritative cost source'");

console.log("\nP6.3 · shadow-first guarantee");
ok(Object.values(LIMIT_DEFS).every((d) => d.baseMode !== "ENFORCED"), "NO limit is ENFORCED in P6.3 (shadow-first)");

console.log("\nP6.3 · concurrency classification");
ok(needsAtomicEnforcement("seats") && needsAtomicEnforcement("monitoredListings"), "seats + listings flagged concurrency-sensitive");
ok(!needsAtomicEnforcement("aiTokensMonthly"), "AI tokens (aggregate) not concurrency-sensitive");
ok(CONCURRENCY_SENSITIVE.length === 3, "3 check-then-insert limits need atomic enforcement in P7");

console.log("\nP6.3 · Israel month boundary");
ok(israelMonthKey("2026-08-11T21:01:00Z") === "2026-08", "Aug 21:01Z → Israel month 2026-08");
ok(israelMonthKey("2026-07-31T21:01:00Z") === "2026-08", "Jul 31 21:01Z → crosses into Israel month 2026-08 (IDT)");

console.log("");
if (failed === 0) console.log("ALL CHECKS PASSED");
else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
