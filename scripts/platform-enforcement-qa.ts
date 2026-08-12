// ============================================================================
// ZONO — P7.0 Enforcement Readiness QA (deterministic, pure-model).
// Proves mode + decision semantics without DB/enforcement:
//   · OFF/SHADOW never deny · PILOT denies only pilot org · ENFORCED denies
//   · fail-open (limits) vs fail-closed (feature access) · block contract
//   · readiness classification incl. concurrency NEEDS_ATOMIC_GUARD
//   · concurrency simulation reports NOT-SAFE without a DB guard
// Run: npx tsx scripts/platform-enforcement-qa.ts
// ============================================================================
import {
  decideEnforcement, classifyLimitReadiness, FAIL_POLICY, BLOCK_MESSAGE_HE,
  DEFAULT_MODE, AI_ENFORCEMENT_ORDER, ENFORCEMENT_MODES,
} from "../src/lib/enforcement/model";

let failed = 0;
const ok = (c: boolean, l: string) => { if (c) console.log("  ✓ " + l); else { console.log("  ✗ " + l); failed++; } };

console.log("P7.0 · mode decision semantics");
ok(DEFAULT_MODE === "SHADOW", "default mode is SHADOW (deploy blocks nobody)");
ok(decideEnforcement({ mode: "OFF", wouldBlock: true, available: true, isPilotOrg: true, code: "LIMIT_REACHED" }).decision === "allow", "OFF never denies");
ok(decideEnforcement({ mode: "SHADOW", wouldBlock: true, available: true, isPilotOrg: true, code: "LIMIT_REACHED" }).decision === "allow", "SHADOW never denies (even over-limit)");
const pilotNon = decideEnforcement({ mode: "PILOT", wouldBlock: true, available: true, isPilotOrg: false, code: "LIMIT_REACHED" });
ok(pilotNon.decision === "allow" && !pilotNon.enforced, "PILOT allows a NON-pilot org");
const pilotYes = decideEnforcement({ mode: "PILOT", wouldBlock: true, available: true, isPilotOrg: true, code: "LIMIT_REACHED" });
ok(pilotYes.decision === "deny" && pilotYes.enforced && pilotYes.code === "LIMIT_REACHED", "PILOT denies a pilot org that is over-limit");
const enf = decideEnforcement({ mode: "ENFORCED", wouldBlock: true, available: true, isPilotOrg: false, code: "LIMIT_REACHED" });
ok(enf.decision === "deny" && enf.code === "LIMIT_REACHED", "ENFORCED denies over-limit for all");
ok(decideEnforcement({ mode: "ENFORCED", wouldBlock: false, available: true, isPilotOrg: false, code: "LIMIT_REACHED" }).decision === "allow", "ENFORCED allows within-limit");

console.log("\nP7.0 · fail-open vs fail-closed");
const failOpen = decideEnforcement({ mode: "ENFORCED", wouldBlock: true, available: false, isPilotOrg: false, code: "LIMIT_REACHED" });
ok(failOpen.decision === "allow" && failOpen.enforced, "usage limit unavailable under ENFORCED → FAIL OPEN (allow)");
ok(FAIL_POLICY.usage_limit === "fail_open" && FAIL_POLICY.feature_access === "fail_closed", "policy: limits fail-open, feature access fail-closed");

console.log("\nP7.0 · block response contract");
ok(!!BLOCK_MESSAGE_HE.FEATURE_NOT_AVAILABLE && !!BLOCK_MESSAGE_HE.LIMIT_REACHED && !!BLOCK_MESSAGE_HE.LIMIT_UNAVAILABLE && !!BLOCK_MESSAGE_HE.ACCESS_ENFORCEMENT_ERROR, "all four block codes carry a Hebrew message");
ok(ENFORCEMENT_MODES.join(",") === "OFF,SHADOW,PILOT,ENFORCED", "canonical mode ladder OFF→SHADOW→PILOT→ENFORCED");

console.log("\nP7.0 · readiness classification (concurrency)");
let r = classifyLimitReadiness("seats", true, true, false);
ok(r.readiness === "NEEDS_ATOMIC_GUARD" && !r.atomicSafe, "seats (check-then-insert) w/o guard → NEEDS_ATOMIC_GUARD");
r = classifyLimitReadiness("seats", true, true, true);
ok(r.readiness === "SAFE_TO_ENFORCE" && r.atomicSafe, "seats WITH atomic guard → SAFE_TO_ENFORCE");
r = classifyLimitReadiness("monitoredListings", true, true, false);
ok(r.readiness === "NEEDS_ATOMIC_GUARD", "listings w/o guard → NEEDS_ATOMIC_GUARD");
r = classifyLimitReadiness("aiTokensMonthly", true, false, false);
ok(r.readiness === "NEEDS_PRODUCT_DECISION", "AI tokens w/o configured cap → NEEDS_PRODUCT_DECISION");
r = classifyLimitReadiness("aiCallsPerMonth", true, true, false);
ok(r.readiness === "SAFE_TO_ENFORCE" && r.atomicSafe, "AI calls (aggregate, post-hoc) w/ cap → SAFE (no race)");
r = classifyLimitReadiness("syncsPerDay", false, true, false);
ok(r.readiness === "UNAVAILABLE", "syncs (no usage source) → UNAVAILABLE");

console.log("\nP7.0 · concurrency simulation (honest NOT-SAFE without DB guard)");
// Simulate limit=10, usage=9, two concurrent app-level check-then-insert.
function appLevelCheckThenInsert(limit: number, startUsage: number): number {
  const readA = startUsage, readB = startUsage;   // both read 9 (no lock, same snapshot)
  const insertA = readA < limit ? 1 : 0;          // A saw 9 < 10 → inserts
  const insertB = readB < limit ? 1 : 0;          // B also saw 9 < 10 → inserts
  return startUsage + insertA + insertB;          // 9 + 1 + 1 = 11 (over-admits)
}
const outcome = appLevelCheckThenInsert(10, 9);
ok(outcome === 11, `app-level check-then-insert OVER-ADMITS (got ${outcome}, limit 10) → concurrency NOT SAFE without atomic guard`);
// This is the correct expected result: it proves we must NOT claim concurrency safety.

console.log("\nP7.0 · AI enforcement order");
ok(AI_ENFORCEMENT_ORDER.join(">") === "preflight_usage_check>provider_invocation>usage_record", "AI hard-enforce requires pre-flight BEFORE provider call");

console.log("");
if (failed === 0) console.log("ALL CHECKS PASSED");
else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
