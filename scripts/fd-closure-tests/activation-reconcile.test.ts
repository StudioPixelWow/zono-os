// ============================================================================
// ZONO — GROW verified-payment → activation reconciler predicate (P8.4C).
// decideActivation is the deterministic eligibility core. Its determinism is what
// makes the reconciler idempotent: the same (payment, subscription-status) inputs
// always yield the same decision, and once a subscription is 'active' the payment
// is no longer a candidate — so double/concurrent runs converge (cases C/D). The
// activation helper itself is idempotent (subscriptions PK = org_id), and Morning
// recovery is handled by a separate idempotent cron (case H). Cross-org safety
// (case I) is enforced by service-role org-scoped reads, not this predicate.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/activation-reconcile.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideActivation } from "../../src/lib/commercial/activation-reconcile-core.ts";

const grow = (o = {}) => ({ provider: "grow", verified: true, provider_txn_id: "txn_1", ...o });

test("A: verified grow payment + inactive (trialing) subscription → activate once", () => {
  assert.equal(decideActivation(grow(), "trialing"), "activate");
});

test("A': other non-active/non-terminal states are also activatable", () => {
  for (const s of ["payment_due", "payment_failed", "grace", "cancel_pending", "trialing"]) {
    assert.equal(decideActivation(grow(), s), "activate", s);
  }
});

test("B: verified + already active → no-op", () => {
  assert.equal(decideActivation(grow(), "active"), "already_active");
});

test("E: payment not verified → ignored (never activate)", () => {
  assert.equal(decideActivation(grow({ verified: false }), "trialing"), "skip_unverified");
  assert.equal(decideActivation(grow({ verified: null }), "trialing"), "skip_unverified");
});

test("F: verified payment missing provider txn → ignored", () => {
  assert.equal(decideActivation(grow({ provider_txn_id: null }), "trialing"), "skip_no_txn");
});

test("J: cancelled subscription → do not reactivate (respect lifecycle)", () => {
  assert.equal(decideActivation(grow(), "cancelled"), "skip_terminal");
});

test("non-grow provider is never activated here", () => {
  assert.equal(decideActivation(grow({ provider: "stripe" }), "trialing"), "skip_not_grow");
});

test("no subscription row → never fabricate an activation", () => {
  assert.equal(decideActivation(grow(), null), "skip_no_subscription");
});

test("C/D determinism: identical inputs always yield the identical decision", () => {
  const a = decideActivation(grow(), "trialing");
  const b = decideActivation(grow(), "trialing");
  assert.equal(a, b);
  // once active, a repeat run is a no-op (idempotent convergence)
  assert.equal(decideActivation(grow(), "active"), "already_active");
});
