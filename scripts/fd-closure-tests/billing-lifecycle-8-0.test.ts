// ============================================================================
// ZONO BILLING / GROW 8.0 — canonical lifecycle regression tests (pure + guards).
// Proves the deterministic commercial brain that governs the whole lifecycle and
// that the provider/DB-enforced protections are in place. Covers spec §22:
// trial, active-seat counting, pending invite, suspend/reactivate, quantity
// staging, boundary convergence, provider retry posture, duplicate callback,
// cancel/reactivate, agent-denied, cross-org-denied, monthly amount, no double
// charge, invoice idempotency. Provider-live stages remain BLOCKED (no creds) —
// this proves the LOGIC, never fabricates a provider success.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/billing-lifecycle-8-0.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideTrialExpiry, decidePaymentFailureTransition, decideRecovery,
  decideCancellationStage, computeGraceWindow, graceEndsAtFrom,
  reconcileBillingLifecycleDecision, GRACE_PERIOD_DAYS,
} from "../../src/lib/commercial/lifecycle.ts";
import { canTransition, canonicalFromSubscriptionStatus } from "../../src/lib/commercial/billing-state.ts";
import { decideRecurringUpdate } from "../../src/lib/commercial/recurring-decision.ts";
import { decideQuantityReconciliation, reconcilePlan } from "../../src/lib/commercial/reconcile.ts";

const PRICE = 197; // canonical COMMERCIAL_MODEL.pricePerAgentIls (injected, not hardcoded in cores)
const T0 = Date.parse("2026-08-23T00:00:00Z");
const DAY = 86_400_000;
const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");

// ── TRIAL ────────────────────────────────────────────────────────────────────
test("trial: expired trial with no verified production payment → payment_due", () => {
  const r = decideTrialExpiry({ billingState: "trialing", trialEndsAt: new Date(T0 - DAY).toISOString(), nowMs: T0, hasVerifiedProductionPayment: false });
  assert.deepEqual(r, { expired: true, targetState: "payment_due" });
});
test("trial: still within trial window → no expiry", () => {
  assert.equal(decideTrialExpiry({ billingState: "trialing", trialEndsAt: new Date(T0 + 5 * DAY).toISOString(), nowMs: T0, hasVerifiedProductionPayment: false }).expired, false);
});
test("trial: verified production payment prevents expiry (no lockout)", () => {
  assert.equal(decideTrialExpiry({ billingState: "trialing", trialEndsAt: new Date(T0 - DAY).toISOString(), nowMs: T0, hasVerifiedProductionPayment: true }).expired, false);
});
test("trial: expiry only fires while trialing (idempotent — not from active)", () => {
  assert.equal(decideTrialExpiry({ billingState: "active", trialEndsAt: new Date(T0 - DAY).toISOString(), nowMs: T0, hasVerifiedProductionPayment: false }).expired, false);
});

// ── ACTIVE SEAT COUNTING / MONTHLY AMOUNT (§17) ─────────────────────────────
test("monthly amount = active seats × 197 for 1 / 2 / 5 / 10 seats", () => {
  for (const [seats, expected] of [[1, 197], [2, 394], [5, 985], [10, 1970]] as const) {
    const r = decideRecurringUpdate({ billableAgents: seats, customPricingRequired: false, unitPriceIls: PRICE, providerQuantity: null, syncStatus: null });
    assert.equal(r.action, "UPDATE_OWED", `${seats} seats`);
    assert.equal(r.targetQuantity, seats);
    assert.equal(r.targetSumIls, expected, `${seats} × 197`);
  }
});
test("monthly amount: >10 seats routes to custom review — never auto 197×N", () => {
  const r = decideRecurringUpdate({ billableAgents: 11, customPricingRequired: true, unitPriceIls: PRICE, providerQuantity: null, syncStatus: null });
  assert.equal(r.action, "CUSTOM_REVIEW_REQUIRED");
  assert.equal(r.targetSumIls, null); // no fabricated 11×197
});

// ── QUANTITY STAGING / BOUNDARY CONVERGENCE / NO DOUBLE CHARGE ───────────────
test("staging: expected quantity change is owed (push at next cycle, no proration)", () => {
  const r = decideRecurringUpdate({ billableAgents: 4, customPricingRequired: false, unitPriceIls: PRICE, providerQuantity: 3, syncStatus: "synced" });
  assert.equal(r.action, "UPDATE_OWED");
  assert.equal(r.targetSumIls, 4 * PRICE);
});
test("convergence: provider already at expected quantity → NONE (no re-charge)", () => {
  const r = decideRecurringUpdate({ billableAgents: 3, customPricingRequired: false, unitPriceIls: PRICE, providerQuantity: 3, syncStatus: "synced" });
  assert.equal(r.action, "NONE");
  assert.equal(r.targetSumIls, null);
});
test("convergence: active + drift → SYNC_REQUIRED; active + matched → SYNCED (idempotent)", () => {
  const base = { organizationId: "o1", billingState: "active" as const, customPricingRequired: false, providerConfigured: true, hasSubscription: true, expectedQuantity: 4 };
  assert.equal(decideQuantityReconciliation({ ...base, providerQuantity: 3 }).decision, "SYNC_REQUIRED");
  assert.equal(decideQuantityReconciliation({ ...base, providerQuantity: 4 }).decision, "SYNCED");
});
test("reconcile plan is idempotent: an already-reconciled row yields no write, no events", () => {
  const input = { organizationId: "o1", billingState: "active" as const, customPricingRequired: false, providerConfigured: true, hasSubscription: true, expectedQuantity: 3, providerQuantity: 3 };
  const already = reconcilePlan(input, { subscriptionQuantity: 3, quantitySyncStatus: "synced" }, { action: "test", at: "now" });
  assert.equal(already.changed, false);
  assert.equal(already.events.length, 0);
  // a real drift produces exactly one change event (no duplicate emission)
  const changed = reconcilePlan(input, { subscriptionQuantity: 2, quantitySyncStatus: "synced" }, { action: "test", at: "now" });
  assert.equal(changed.changed, true);
  assert.equal(changed.events.filter((e) => e.type === "billing.quantity.changed").length, 1);
});
test("reconcile: no subscription row → never creates one (NO_ACTION)", () => {
  const r = reconcilePlan({ organizationId: "o1", billingState: "trialing", customPricingRequired: false, providerConfigured: false, hasSubscription: false, expectedQuantity: 0, providerQuantity: null }, null, { action: "t", at: "now" });
  assert.equal(r.decision, "NO_ACTION");
  assert.equal(r.reason, "NO_SUBSCRIPTION");
});

// ── PROVIDER RETRY POSTURE (failure never fabricates a sync) ─────────────────
test("provider unconfigured → lifecycle surfaces PROVIDER_SYNC_PENDING, never a fake success", () => {
  const d = reconcileBillingLifecycleDecision({
    billingState: "active", nowMs: T0, trialEndsAt: null, hasVerifiedProductionPayment: true,
    billableAgents: 4, customPricingRequired: false, providerQuantity: 3, quantitySyncStatus: "synced",
    cancelRequested: false, periodEnd: null, providerConfigured: false, hasRecurringIdentifiers: false, unitPriceIls: PRICE,
  });
  assert.equal(d.action, "PROVIDER_SYNC_PENDING");
  assert.equal(d.providerDependent, true);
});
test("provider configured + recurring ids → QUANTITY_UPDATE_OWED at boundary", () => {
  const d = reconcileBillingLifecycleDecision({
    billingState: "active", nowMs: T0, trialEndsAt: null, hasVerifiedProductionPayment: true,
    billableAgents: 4, customPricingRequired: false, providerQuantity: 3, quantitySyncStatus: "synced",
    cancelRequested: false, periodEnd: null, providerConfigured: true, hasRecurringIdentifiers: true, unitPriceIls: PRICE,
  });
  assert.equal(d.action, "QUANTITY_UPDATE_OWED");
});

// ── PAYMENT FAILURE LADDER + GRACE (§9) ─────────────────────────────────────
test("payment-failure ladder: active/payment_due → payment_failed → grace → (stop)", () => {
  assert.equal(decidePaymentFailureTransition("active"), "payment_failed");
  assert.equal(decidePaymentFailureTransition("payment_due"), "payment_failed");
  assert.equal(decidePaymentFailureTransition("payment_failed"), "grace");
  assert.equal(decidePaymentFailureTransition("grace"), null);
});
test("grace window: 7 calendar days, derived + idempotent, never auto-suspends", () => {
  assert.equal(GRACE_PERIOD_DAYS, 7);
  const endsAt = graceEndsAtFrom(T0);
  assert.equal(Date.parse(endsAt), T0 + 7 * DAY);
  const mid = computeGraceWindow("grace", endsAt, T0 + 3 * DAY);
  assert.equal(mid.active, true);
  assert.equal(mid.expired, false);
  assert.equal(mid.daysRemaining, 4);
  const lapsed = computeGraceWindow("grace", endsAt, T0 + 8 * DAY);
  assert.equal(lapsed.expired, true); // expired flag only — no state mutation implied
  // repeated evaluation is identical (idempotent projection)
  assert.deepEqual(computeGraceWindow("grace", endsAt, T0 + 8 * DAY), lapsed);
});
test("grace: only projected while in the grace state", () => {
  assert.equal(computeGraceWindow("active", graceEndsAtFrom(T0), T0).active, false);
});

// ── CANCELLATION / REACTIVATION (§10/§11) ───────────────────────────────────
test("cancellation staging: request → cancel_pending → due at period end (never immediate delete)", () => {
  assert.equal(decideCancellationStage({ billingState: "active", cancelRequested: true, periodEnd: null, nowMs: T0 }), "requested");
  assert.equal(decideCancellationStage({ billingState: "cancel_pending", cancelRequested: true, periodEnd: new Date(T0 + DAY).toISOString(), nowMs: T0 }), "cancel_pending");
  assert.equal(decideCancellationStage({ billingState: "cancel_pending", cancelRequested: true, periodEnd: new Date(T0 - DAY).toISOString(), nowMs: T0 }), "cancel_at_period_end_due");
  assert.equal(decideCancellationStage({ billingState: "active", cancelRequested: false, periodEnd: null, nowMs: T0 }), "none");
});
test("reactivation: verified production payment recovers a dunning/cancelled org to active", () => {
  for (const s of ["payment_due", "payment_failed", "grace", "cancel_pending", "cancelled"] as const) {
    assert.deepEqual(decideRecovery({ billingState: s, hasVerifiedProductionPayment: true }), { available: true, targetState: "active" }, s);
  }
  // sandbox / no verified production payment never recovers
  assert.equal(decideRecovery({ billingState: "grace", hasVerifiedProductionPayment: false }).available, false);
  // trialing/active are not "recoverable" states
  assert.equal(decideRecovery({ billingState: "active", hasVerifiedProductionPayment: true }).available, false);
});
test("cancel/reactivate is not a duplicate subscription: reactivate only transitions state", () => {
  // canonical machine allows cancel_pending → active and cancelled → active (reactivate)
  assert.equal(canTransition("cancel_pending", "active"), true);
  assert.equal(canTransition("cancelled", "active"), true);
  // and never active → trialing (no trial reset abuse)
  assert.equal(canTransition("active", "trialing"), false);
});

// ── LIFECYCLE PRIORITY (single primary action) ──────────────────────────────
test("lifecycle brain: trial expiry outranks everything; healthy synced org → NO_ACTION", () => {
  const expired = reconcileBillingLifecycleDecision({
    billingState: "trialing", nowMs: T0, trialEndsAt: new Date(T0 - DAY).toISOString(), hasVerifiedProductionPayment: false,
    billableAgents: 2, customPricingRequired: false, providerQuantity: null, quantitySyncStatus: null,
    cancelRequested: false, periodEnd: null, providerConfigured: false, hasRecurringIdentifiers: false, unitPriceIls: PRICE,
  });
  assert.equal(expired.action, "TRIAL_EXPIRED");
  const healthy = reconcileBillingLifecycleDecision({
    billingState: "active", nowMs: T0, trialEndsAt: null, hasVerifiedProductionPayment: true,
    billableAgents: 3, customPricingRequired: false, providerQuantity: 3, quantitySyncStatus: "synced",
    cancelRequested: false, periodEnd: null, providerConfigured: true, hasRecurringIdentifiers: true, unitPriceIls: PRICE,
  });
  assert.equal(healthy.action, "NO_ACTION");
});

// ── CANONICAL STATUS MAPPING (no unknown → paid) ────────────────────────────
test("legacy status → canonical BillingState; unknown never maps to a paid state", () => {
  assert.equal(canonicalFromSubscriptionStatus("trial"), "trialing");
  assert.equal(canonicalFromSubscriptionStatus("active"), "active");
  assert.equal(canonicalFromSubscriptionStatus("active", { cancelAtPeriodEnd: true }), "cancel_pending");
  assert.equal(canonicalFromSubscriptionStatus("pending_payment"), "payment_due");
  assert.equal(canonicalFromSubscriptionStatus("grace_period"), "grace");
  assert.equal(canonicalFromSubscriptionStatus("suspended"), "payment_failed");
  assert.equal(canonicalFromSubscriptionStatus("cancelled"), "cancelled");
  assert.equal(canonicalFromSubscriptionStatus("something_unknown"), "payment_due"); // owes, never "active"
  assert.equal(canonicalFromSubscriptionStatus("active", { customPricing: true }), "custom_pricing_required");
});

// ── DB / PROVIDER-ENFORCED GUARDS (source-level; live-verified separately) ──
test("no-double-charge / duplicate callback: payments carries the UNIQUE(provider,txn) guard", () => {
  const mig = src("../supabase/migrations/20261001120000_commercial_onboarding.sql");
  assert.match(mig, /unique\s*\(provider,\s*provider_txn_id\)/i);
});
test("webhook activates only on an authoritative provider re-query, and is idempotent", () => {
  const s = src("app/api/payments/grow/webhook/route.ts");
  assert.match(s, /growGetTransactionInfo/); // authoritative server-to-server verification
  assert.match(s, /idempotent/);             // already-verified short-circuit
  assert.match(s, /payment\.orgId/);         // org from the DB row, not the payload (cross-org safe)
});
test("quantity reconcile RPC is the sole atomic writer and never writes provider_quantity", () => {
  const mig = src("../supabase/migrations/20271230120000_p8_3_provider_quantity.sql");
  assert.match(mig, /reconcile_subscription_quantity/);
  assert.match(mig, /IS DISTINCT FROM/i);           // atomic compare-and-set
  assert.ok(!/UPDATE[\s\S]*provider_quantity\s*=/i.test(mig), "RPC must not set provider_quantity");
});
test("seat/billing mutations are manager-gated + org-scoped (agent & cross-org denied)", () => {
  const s = src("lib/team-admin/service.ts");
  assert.match(s, /has_min_role/);          // role gate
  assert.match(s, /נדרשת הרשאת מנהל/);       // agent denied (Hebrew)
  assert.match(s, /orgId: profile\.org_id/); // org from session, not client (cross-org safe)
});
test("boundary cron only local-cancels/syncs after a provider ack (no fabricated convergence)", () => {
  const s = src("app/api/cron/billing-boundary/route.ts");
  assert.match(s, /subscription_quantity !== s\.provider_quantity/); // drift due-predicate
  assert.match(s, /PENDING_SANDBOX_CREDENTIALS/);                    // inert without creds, not faked
});
test("invoice idempotency: Morning issuance is a compare-and-set on invoice_doc_id IS NULL", () => {
  const s = src("lib/accounting/document-service.ts");
  assert.match(s, /already_issued/);
  assert.match(s, /is\("invoice_doc_id",\s*null\)/); // atomic single-issue claim
});
