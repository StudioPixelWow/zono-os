// P8.0 — billing architecture QA (PURE; no DB, no provider, no writes). Proves the
// canonical billing state machine + the commercial/billing/revenue separation.
import { COMMERCIAL_MODEL, commercialState, billableAgents } from "../src/lib/commercial/model.ts";
import { BILLING_STATES, STATE_CONTRACT, canTransition, canonicalFromSubscriptionStatus, WEBHOOK_IDEMPOTENCY, grantsFullAccess } from "../src/lib/commercial/billing-state.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };

console.log("P8.0 · commercial ≠ billing ≠ revenue separation");
const cs = commercialState({ seats: { activeUsers: 3, pendingInvites: 2 } });
ok(cs.isExpectationOnly === true, "CommercialState flagged isExpectationOnly (NEVER verified revenue)");
ok(cs.billableAgents === 3, "billable = active only (owner incl.); pending NOT billable");

console.log("\nP8.0 · 197 per ACTIVE agent (owner incl.), pending/suspended excluded");
for (const [active, pending, expect] of [[1,0,197],[3,0,591],[4,1,788],[10,3,1970]] as const) {
  const s = commercialState({ seats: { activeUsers: active, pendingInvites: pending } });
  ok(s.standardMonthlyIls === expect && s.billableAgents === active,
    `${active} active (+${pending} pending) → ${expect} ₪ (pending reserved, not billed)`);
}
const s11 = commercialState({ seats: { activeUsers: 11, pendingInvites: 0 } });
ok(s11.customPricingRequired && s11.standardMonthlyIls === null, "11 active → CUSTOM pricing (no auto 197×11)");
ok(COMMERCIAL_MODEL.trialDays === 14 && COMMERCIAL_MODEL.featuresOpen === true, "14-day trial + all features open");

console.log("\nP8.0 · canonical billing state machine");
ok(BILLING_STATES.length === 8, "8 canonical states");
ok(canonicalFromSubscriptionStatus("trial") === "trialing", "legacy 'trial' → trialing");
ok(canonicalFromSubscriptionStatus("active", { cancelAtPeriodEnd: true }) === "cancel_pending", "active + cancel_at_period_end → cancel_pending");
ok(canonicalFromSubscriptionStatus(null) === "payment_due", "unknown/absent status → payment_due (never silently 'active')");
ok(canonicalFromSubscriptionStatus("active", { customPricing: true }) === "custom_pricing_required", ">10 agents overrides → custom_pricing_required");

console.log("\nP8.0 · valid vs invalid transitions");
ok(canTransition("trialing", "active"), "trialing → active (payment) allowed");
ok(canTransition("payment_failed", "grace") && canTransition("grace", "active"), "failed → grace → active recovery path exists");
ok(canTransition("cancelled", "active"), "cancelled → active (reactivate) allowed");
ok(!canTransition("cancelled", "trialing") === false, "cancelled → trialing allowed (re-trial policy) [documented]");
ok(!canTransition("trialing", "grace"), "trialing → grace INVALID (no direct path)");
ok(!canTransition("active", "trialing"), "active → trialing INVALID (cannot re-enter trial)");

console.log("\nP8.0 · access + never-delete-data design");
ok(grantsFullAccess("trialing") && grantsFullAccess("active") && grantsFullAccess("grace"), "trial/active/grace → full access (billing recovery preserved)");
ok(STATE_CONTRACT.cancelled.customerAccess === "read_only", "cancelled → read-only (design)");
ok(Object.values(STATE_CONTRACT).every(c => !/delete customer data/i.test(c.recoveryPath)) && /NEVER DELETED/i.test(STATE_CONTRACT.cancelled.enforcementConsequence), "no state deletes customer data");

console.log("\nP8.0 · webhook idempotency model");
ok(/UNIQUE/.test(WEBHOOK_IDEMPOTENCY.idempotencyKey) && /provider_txn_id/.test(WEBHOOK_IDEMPOTENCY.idempotencyKey), "idempotency key = UNIQUE(provider, provider_txn_id)");
ok(/fail-CLOSED/i.test(WEBHOOK_IDEMPOTENCY.signatureFailure), "signature failure → fail-closed");
ok(/DO NOT provision/i.test(WEBHOOK_IDEMPOTENCY.unknownOrg), "unknown org → do not provision (park)");

console.log("\nP8.0 · enforcement integration is DESIGN-ONLY (not connected)");
ok(/PRODUCT DECISION/i.test(STATE_CONTRACT.grace.enforcementConsequence) && /PRODUCT DECISION/i.test(STATE_CONTRACT.cancelled.enforcementConsequence),
  "grace + cancelled enforcement consequences flagged PRODUCT DECISION REQUIRED");

console.log("");
console.log(fail === 0 ? "ALL P8.0 BILLING QA PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
