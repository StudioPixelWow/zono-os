// ============================================================================
// ZONO — activation-reconciler PURE decision core (P8.4C). No DB/env/clock/
// provider/server-only — deterministic + unit-testable. Both the reconciler
// service and its offline tests import decideActivation from here.
// ============================================================================

/** A GROW payment row (only the fields the eligibility decision needs). */
export interface ReconcilablePayment {
  provider: string | null;
  verified: boolean | null;
  provider_txn_id: string | null;
}

export type ActivationDecision =
  | "activate"              // verified grow payment, txn present, subscription not yet converged
  | "already_active"        // subscription already active → no-op
  | "skip_not_grow"         // different provider
  | "skip_unverified"       // not authoritatively verified → never activate
  | "skip_no_txn"           // no provider transaction id → cannot attribute
  | "skip_terminal"         // subscription cancelled → respect lifecycle, do not reactivate
  | "skip_no_subscription"; // no subscription row to converge (never fabricate one here)

/**
 * PURE deterministic eligibility decision. A payment is reconcilable ONLY when it
 * is an authoritatively-verified GROW payment with a real provider txn whose org
 * has a non-terminal subscription that has not yet converged to 'active'.
 * Refund/reversal is not modelled in the billing schema, so 'cancelled' is the
 * only terminal to exclude.
 */
export function decideActivation(p: ReconcilablePayment, subscriptionStatus: string | null): ActivationDecision {
  if (p.provider !== "grow") return "skip_not_grow";
  if (p.verified !== true) return "skip_unverified";
  if (!p.provider_txn_id) return "skip_no_txn";
  if (subscriptionStatus === null) return "skip_no_subscription";
  if (subscriptionStatus === "active") return "already_active";
  if (subscriptionStatus === "cancelled") return "skip_terminal";
  return "activate";
}
