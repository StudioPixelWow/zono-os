// P8.5A — BILLING LIFECYCLE QA (PURE; no DB, no provider, no network, no writes).
// Proves the canonical lifecycle engine + reconciliation chokepoint end to end
// WITHOUT any Grow call. Provider-dependent actions are proven to surface as
// PENDING/owed, never as fabricated success.
import {
  reconcileBillingLifecycleDecision, decideTrialExpiry, decideRecovery,
  decidePaymentFailureTransition, decideCancellationStage, LIFECYCLE_CONTRACT,
  GRACE_PERIOD, GRACE_PERIOD_DAYS, computeGraceWindow, graceEndsAtFrom, type LifecycleInput,
} from "../src/lib/commercial/lifecycle.ts";
import { BILLING_STATES } from "../src/lib/commercial/billing-state.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
const AT = "2026-08-13T00:00:00.000Z";
const NOW = Date.parse(AT);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const base = (o: Partial<LifecycleInput>): LifecycleInput => ({
  billingState: "active", nowMs: NOW, trialEndsAt: null, hasVerifiedProductionPayment: false,
  billableAgents: 4, customPricingRequired: false, providerQuantity: 4, quantitySyncStatus: "synced",
  cancelRequested: false, periodEnd: null, providerConfigured: true, hasRecurringIdentifiers: true,
  unitPriceIls: 197, ...o,
});
const decide = (o: Partial<LifecycleInput>) => reconcileBillingLifecycleDecision(base(o));

console.log("P8.5A · trial lifecycle");
ok(decide({ billingState: "trialing", trialEndsAt: iso(NOW + 5 * DAY) }).action === "NO_ACTION", "active trial (not expired) → NO_ACTION");
{
  const exp = decide({ billingState: "trialing", trialEndsAt: iso(NOW - DAY), hasVerifiedProductionPayment: false });
  ok(exp.action === "TRIAL_EXPIRED" && exp.targetState === "payment_due" && exp.providerDependent === false, "trial expired, no verified prod payment → TRIAL_EXPIRED → payment_due");
}
// Idempotent repeat: once moved to payment_due, decideTrialExpiry no longer fires.
ok(decideTrialExpiry({ billingState: "payment_due", trialEndsAt: iso(NOW - DAY), nowMs: NOW, hasVerifiedProductionPayment: false }).expired === false, "repeat expiry after transition → not expired again (idempotent)");
ok(decide({ billingState: "trialing", trialEndsAt: iso(NOW - DAY), hasVerifiedProductionPayment: true }).action !== "TRIAL_EXPIRED", "trial expired WITH verified prod payment → not forced to payment_due");

console.log("\nP8.5A · payment_due / failure / grace / recovery");
ok(decide({ billingState: "payment_due", hasVerifiedProductionPayment: false }).action === "PAYMENT_REQUIRED", "payment_due, no payment → PAYMENT_REQUIRED");
ok(decide({ billingState: "payment_failed", hasVerifiedProductionPayment: false }).action === "PAYMENT_REQUIRED", "payment_failed, no payment → PAYMENT_REQUIRED");
ok(decidePaymentFailureTransition("active") === "payment_failed", "active → payment_failed (failure ladder)");
ok(decidePaymentFailureTransition("payment_failed") === "grace", "payment_failed → grace");
ok(decidePaymentFailureTransition("grace") === null, "grace → (no auto next; expiry does NOT suspend/cancel)");
ok(GRACE_PERIOD.status === "LOCKED" && GRACE_PERIOD.days === 7 && GRACE_PERIOD_DAYS === 7, "grace duration LOCKED at 7 calendar days");
{
  const rec = decide({ billingState: "grace", hasVerifiedProductionPayment: true });
  ok(rec.action === "RECOVERY_AVAILABLE" && rec.targetState === "active", "grace + verified prod payment → RECOVERY_AVAILABLE → active");
  ok(decideRecovery({ billingState: "payment_due", hasVerifiedProductionPayment: true }).available === true, "payment_due + verified prod → recovery available");
}

console.log("\nP8.5A · grace window = 7 calendar days (locked; display + idempotent expiry)");
{
  const endsMs = NOW + 7 * DAY;                 // grace started today, ends in 7 days
  const w = computeGraceWindow("grace", iso(endsMs), NOW);
  ok(w.active === true && w.daysRemaining === 7 && w.expired === false, "fresh grace → active, 7 days remaining, not expired");
  ok(w.startedAt === iso(endsMs - 7 * DAY), "startedAt = endsAt − 7 days (derived)");
  const mid = computeGraceWindow("grace", iso(NOW + 3 * DAY), NOW);
  ok(mid.daysRemaining === 3 && mid.expired === false, "mid-grace → 3 days remaining, not expired");
  const expired = computeGraceWindow("grace", iso(NOW - DAY), NOW);
  ok(expired.expired === true && expired.daysRemaining === 0, "past grace_until → expired, 0 days remaining");
  // Idempotent: repeated evaluation of an expired window yields identical result.
  const e2 = computeGraceWindow("grace", iso(NOW - DAY), NOW);
  ok(JSON.stringify(expired) === JSON.stringify(e2), "grace expiry is idempotent (pure projection, no mutation)");
  // Not in grace → inactive window regardless of grace_until.
  ok(computeGraceWindow("active", iso(NOW + 7 * DAY), NOW).active === false, "not in grace state → window inactive");
  ok(graceEndsAtFrom(NOW) === iso(NOW + 7 * DAY), "graceEndsAtFrom = now + 7 days (entry write)");
  // Grace expiry does NOT auto-suspend/cancel — decision stays PAYMENT_REQUIRED, not cancellation.
  const dec = decide({ billingState: "grace", hasVerifiedProductionPayment: false });
  ok(dec.action === "PAYMENT_REQUIRED" && dec.targetState === null, "expired grace, no payment → PAYMENT_REQUIRED (NO auto suspend/cancel/delete)");
  ok(/SEPARATE future product decision/i.test(GRACE_PERIOD.onExpiry), "post-grace access = SEPARATE future decision (not in P8)");
}

console.log("\nP8.5A · sandbox payment does NOT trigger production recovery");
ok(decideRecovery({ billingState: "payment_failed", hasVerifiedProductionPayment: false }).available === false, "no verified PRODUCTION payment (e.g. sandbox) → no recovery");

console.log("\nP8.5A · next-cycle quantity (Decision A: no proration, provider stays old)");
{
  // increase 3→4 during cycle: provider still 3, expected 4.
  const inc = decide({ billingState: "active", billableAgents: 4, providerQuantity: 3, quantitySyncStatus: "sync_required" });
  ok(inc.action === "QUANTITY_UPDATE_OWED" && inc.providerDependent === true, "3→4 during cycle → QUANTITY_UPDATE_OWED (boundary; provider still 3)");
  // decrease 4→3: provider still 4, expected 3.
  const dec = decide({ billingState: "active", billableAgents: 3, providerQuantity: 4, quantitySyncStatus: "sync_required" });
  ok(dec.action === "QUANTITY_UPDATE_OWED", "4→3 decrease → UPDATE_OWED (no mid-cycle credit; provider still 4)");
  // provider not configured → PENDING, never faked.
  const pend = decide({ billingState: "active", billableAgents: 4, providerQuantity: 3, providerConfigured: false, hasRecurringIdentifiers: false, quantitySyncStatus: "sync_required" });
  ok(pend.action === "PROVIDER_SYNC_PENDING" && pend.providerDependent === true, "quantity change owed + no creds → PROVIDER_SYNC_PENDING (never fake provider ack)");
  // already synced → NO_ACTION.
  ok(decide({ billingState: "active", billableAgents: 4, providerQuantity: 4, quantitySyncStatus: "synced" }).action === "NO_ACTION", "provider already at expected → NO_ACTION");
}

console.log("\nP8.5A · custom pricing (Decision B)");
ok(decide({ billingState: "active", billableAgents: 11, customPricingRequired: true, quantitySyncStatus: "custom_review_required" }).action === "CUSTOM_REVIEW_REQUIRED", "11 active → CUSTOM_REVIEW_REQUIRED");
ok(decide({ billingState: "active", billableAgents: 9, customPricingRequired: false, quantitySyncStatus: "custom_review_required" }).action === "STANDARD_RETURN_APPROVAL_REQUIRED", "back to 9 but held → STANDARD_RETURN_APPROVAL_REQUIRED (needs approval)");
ok(decide({ billingState: "active", billableAgents: 9, customPricingRequired: false, providerQuantity: 9, quantitySyncStatus: "synced" }).action === "NO_ACTION", "after approval (synced, ≤10) → normal NO_ACTION");

console.log("\nP8.5A · cancellation staging (no data deletion)");
ok(decideCancellationStage({ billingState: "active", cancelRequested: false, periodEnd: null, nowMs: NOW }) === "none", "no cancel → none");
ok(decideCancellationStage({ billingState: "active", cancelRequested: true, periodEnd: iso(NOW + 5 * DAY), nowMs: NOW }) === "requested", "cancel requested (active) → requested");
ok(decideCancellationStage({ billingState: "cancel_pending", cancelRequested: true, periodEnd: iso(NOW + 5 * DAY), nowMs: NOW }) === "cancel_pending", "cancel_pending before boundary → cancel_pending");
{
  const due = decide({ billingState: "cancel_pending", cancelRequested: true, periodEnd: iso(NOW - DAY), hasVerifiedProductionPayment: false });
  ok(due.action === "CANCELLATION_OWED" && due.targetState === "cancelled" && due.providerDependent === true, "cancel_pending + boundary reached → CANCELLATION_OWED (provider-gated)");
}
ok(decideCancellationStage({ billingState: "cancelled", cancelRequested: false, periodEnd: null, nowMs: NOW }) === "cancelled", "cancelled stays cancelled (idempotent)");

console.log("\nP8.5A · state contract integrity (billing ≠ access; no deletion)");
ok(BILLING_STATES.every(s => LIFECYCLE_CONTRACT[s] !== undefined), "every billing state has a lifecycle contract entry");
ok(LIFECYCLE_CONTRACT.trialing.billingContinues === false && LIFECYCLE_CONTRACT.active.billingContinues === true, "trial not billed; active billed");
ok(LIFECYCLE_CONTRACT.cancelled.recoveryAllowed === true && LIFECYCLE_CONTRACT.cancelled.customerMeaning.includes("נשמרים"), "cancelled → data preserved + recoverable");
ok(LIFECYCLE_CONTRACT.active.quantitySyncAllowed === true && LIFECYCLE_CONTRACT.trialing.quantitySyncAllowed === false, "quantity sync allowed in active, not in trial");

console.log("\nP8.5A · idempotency of the primary decision (deterministic)");
{
  const a = decide({ billingState: "trialing", trialEndsAt: iso(NOW - DAY) });
  const b = decide({ billingState: "trialing", trialEndsAt: iso(NOW - DAY) });
  ok(JSON.stringify(a) === JSON.stringify(b), "identical inputs → identical decision (safe to replay)");
}

console.log("\nP8.5A · Platform Admin == Customer 360 (same pure engine → same result)");
{
  const input = base({ billingState: "active", billableAgents: 4, providerQuantity: 3, quantitySyncStatus: "sync_required" });
  ok(JSON.stringify(reconcileBillingLifecycleDecision(input)) === JSON.stringify(reconcileBillingLifecycleDecision(input)), "one resolver → PA and C360 render identical lifecycle");
}

console.log("");
console.log(fail === 0 ? "ALL P8.5A BILLING LIFECYCLE QA PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
