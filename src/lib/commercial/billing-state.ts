// ============================================================================
// ZONO — CANONICAL BILLING STATE MACHINE (PURE, server-safe). P8.0 — DESIGN ONLY.
// ONE authoritative organization billing lifecycle, reconciling the three legacy
// vocabularies (subscriptions.status, org_plans.status, the platform display
// BillingState) into a single canonical set. This module DESIGNS the machine; it
// does NOT charge, call a provider, connect to P7 enforcement, or write anything.
//
// SEPARATION OF CONCERNS (must never be conflated):
//   • CommercialState  (P7.4) = expectation (197 × billable agents). NOT revenue.
//   • BillingState     (this) = lifecycle position (trial/active/failed/…).
//   • Payment          (row)  = a provider transaction attempt.
//   • Verified revenue        = payments.verified=true from a signed webhook ONLY.
// ============================================================================

// ── Canonical states ────────────────────────────────────────────────────────
export const BILLING_STATES = [
  "trialing",
  "active",
  "payment_due",
  "payment_failed",
  "grace",
  "cancel_pending",
  "cancelled",
  "custom_pricing_required",
] as const;
export type BillingState = (typeof BILLING_STATES)[number];

// ── Legacy → canonical mapping (subscriptions.status is the primary source) ──
export function canonicalFromSubscriptionStatus(
  status: string | null | undefined,
  opts: { customPricing?: boolean; cancelAtPeriodEnd?: boolean } = {},
): BillingState {
  if (opts.customPricing) return "custom_pricing_required";
  switch ((status ?? "").toLowerCase()) {
    case "trial": return "trialing";
    case "active": return opts.cancelAtPeriodEnd ? "cancel_pending" : "active";
    case "pending_payment": return "payment_due";
    case "grace_period": return "grace";
    case "suspended": return "payment_failed";
    case "cancelled": case "expired": return "cancelled";
    default: return "payment_due"; // unknown/absent → treat as owing, never as paid
  }
}

// ── Per-state contract ───────────────────────────────────────────────────────
export type CustomerAccess = "full" | "read_only" | "restricted";
export interface StateContract {
  entry: string;
  exit: string;
  customerAccess: CustomerAccess;
  billable: boolean | "custom";
  nextBillingAction: string;
  // DESIGN ONLY — P8.0 does NOT connect billing to P7 enforcement. This is the
  // FUTURE intended consequence; several require an explicit product decision.
  enforcementConsequence: string;
  adminVisibility: string;
  recoveryPath: string;
}

export const STATE_CONTRACT: Record<BillingState, StateContract> = {
  trialing: {
    entry: "org created / trial started (14-day)", exit: "payment completes → active; trial_ends_at passes without payment → payment_due",
    customerAccess: "full", billable: false, nextBillingAction: "prompt payment before trial end",
    enforcementConsequence: "none — full access during trial", adminVisibility: "TRIAL + trial_ends_at",
    recoveryPath: "n/a",
  },
  active: {
    entry: "verified payment (signed webhook)", exit: "period_end → payment_due; cancel requested → cancel_pending; agents cross 10 → custom_pricing_required",
    customerAccess: "full", billable: true, nextBillingAction: "renew at period_end (recurring — P8.5)",
    enforcementConsequence: "none — paid & current", adminVisibility: "HEALTHY + next billing date",
    recoveryPath: "n/a",
  },
  payment_due: {
    entry: "trial expired OR renewal due, awaiting payment", exit: "verified payment → active; attempt fails → payment_failed; abandoned → cancelled",
    customerAccess: "full", billable: true, nextBillingAction: "create checkout / await signed webhook",
    enforcementConsequence: "PRODUCT DECISION — grace before any restriction; likely full access during a short window",
    adminVisibility: "PENDING_PAYMENT", recoveryPath: "complete checkout",
  },
  payment_failed: {
    entry: "a payment attempt failed (recorded failure)", exit: "retry succeeds → active; enters grace window → grace",
    customerAccess: "full", billable: true, nextBillingAction: "dunning / retry",
    enforcementConsequence: "PRODUCT DECISION — fail-OPEN during grace, never delete data",
    adminVisibility: "PAYMENT_FAILED + failure count", recoveryPath: "successful retry → active",
  },
  grace: {
    entry: "post-failure grace window (grace_until)", exit: "recovered → active; grace_until passes → cancelled/restricted",
    customerAccess: "full", billable: true, nextBillingAction: "final retry before restriction",
    enforcementConsequence: "PRODUCT DECISION — grace length + fail-open vs read-only at expiry",
    adminVisibility: "GRACE + grace_until", recoveryPath: "successful payment → active",
  },
  cancel_pending: {
    entry: "cancellation requested (cancel_at_period_end=true)", exit: "period_end → cancelled; reactivate before period_end → active",
    customerAccess: "full", billable: true, nextBillingAction: "cancel at period_end",
    enforcementConsequence: "none until period_end", adminVisibility: "CANCEL_PENDING + period_end",
    recoveryPath: "reactivate before period_end",
  },
  cancelled: {
    entry: "cancelled or expired", exit: "reactivate → new checkout → active",
    customerAccess: "read_only", billable: false, nextBillingAction: "none (awaiting reactivation)",
    enforcementConsequence: "PRODUCT DECISION — read-only mode; DATA IS NEVER DELETED",
    adminVisibility: "CANCELLED", recoveryPath: "reactivate via new checkout",
  },
  custom_pricing_required: {
    entry: "> 10 active agents", exit: "custom deal closed → active; downgrades ≤10 → standard",
    customerAccess: "full", billable: "custom", nextBillingAction: "route to sales (NO auto 197×N)",
    enforcementConsequence: "none — access unaffected; pricing handled off-platform",
    adminVisibility: "CUSTOM_PRICING_REQUIRED + agent count", recoveryPath: "sales-managed",
  },
};

// ── Transition table (guards invalid transitions) ────────────────────────────
const TRANSITIONS: Record<BillingState, readonly BillingState[]> = {
  trialing: ["active", "payment_due", "cancel_pending", "custom_pricing_required", "cancelled"],
  active: ["payment_due", "payment_failed", "cancel_pending", "custom_pricing_required"],
  payment_due: ["active", "payment_failed", "cancelled", "custom_pricing_required"],
  payment_failed: ["grace", "active", "cancelled"],
  grace: ["active", "cancelled"],
  cancel_pending: ["cancelled", "active"],
  cancelled: ["active", "trialing"],
  custom_pricing_required: ["active", "payment_due", "cancel_pending", "cancelled"],
};
export function canTransition(from: BillingState, to: BillingState): boolean {
  return from === to || (TRANSITIONS[from]?.includes(to) ?? false);
}

/** Access-granting states (used only for FUTURE enforcement design; not wired). */
export function grantsFullAccess(s: BillingState): boolean {
  return STATE_CONTRACT[s].customerAccess === "full";
}

// ── Webhook idempotency model (design constants) ─────────────────────────────
// Idempotency key already enforced in prod: UNIQUE(provider, provider_txn_id) on
// `payments`. This documents the required handling for every delivery anomaly.
export const WEBHOOK_IDEMPOTENCY = {
  idempotencyKey: "(provider, provider_txn_id)  — UNIQUE on payments",
  duplicate: "same (provider,txn) → upsert/on-conflict-do-nothing → processed exactly once",
  outOfOrder: "guard by canTransition + verified evidence; a 'paid' after a 'failed' for the same txn still wins (verified webhook is authoritative)",
  retry: "idempotent — same key yields the same terminal state; safe to replay",
  sameTwice: "blocked by the UNIQUE constraint; second insert is a no-op",
  unknownOrg: "record receipt, DO NOT provision; park for operator review (never auto-create)",
  unknownSubscription: "record receipt; reconcile by org, else park",
  signatureFailure: "reject 401, fail-CLOSED (already implemented in the webhook route)",
} as const;
