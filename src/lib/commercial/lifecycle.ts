// ============================================================================
// ZONO — CANONICAL BILLING LIFECYCLE ENGINE (PURE, server-safe). P8.5A.
// ONE pure decision model governing the subscription lifecycle, reconciling every
// state introduced across P8.0–P8.4B into a single machine + a single
// reconciliation chokepoint. No DB / env / clock / provider — deterministic and
// unit-testable. The server wrapper (billing.ts) reads DB, calls this, and
// performs only SAFE internal writes; provider-dependent actions are surfaced,
// never executed here.
//
// HARD RULE: BILLING STATE ≠ ACCESS STATE. Nothing here connects to P7 access
// enforcement. No state deletes data, resets a trial, or fabricates revenue.
// Decision A (next-cycle, no proration) and Decision B (custom→standard needs
// approval) are encoded.
// ============================================================================
import { BILLING_STATES, canTransition, type BillingState } from "./billing-state";
import { decideRecurringUpdate } from "./recurring-decision";

// ── Per-state lifecycle contract (extends the P8.0 STATE_CONTRACT) ───────────
export interface LifecycleStateMeta {
  allowedPrev: readonly BillingState[];
  allowedNext: readonly BillingState[];
  trigger: string;
  providerDependency: "none" | "verification" | "recurring_update" | "recurring_cancel";
  customerMeaning: string;
  billingContinues: boolean;     // is the org expected to be billed in this state?
  quantitySyncAllowed: boolean;  // may provider quantity sync run from this state?
  cancellationAllowed: boolean;
  recoveryAllowed: boolean;
}

const prevOf = (s: BillingState): BillingState[] =>
  BILLING_STATES.filter((f) => f !== s && canTransition(f, s));

export const LIFECYCLE_CONTRACT: Record<BillingState, LifecycleStateMeta> = {
  trialing: {
    allowedPrev: prevOf("trialing"), allowedNext: ["active", "payment_due", "cancel_pending", "custom_pricing_required", "cancelled"],
    trigger: "org onboarded → 14-day trial", providerDependency: "none",
    customerMeaning: "ניסיון פעיל — כל התכונות פתוחות", billingContinues: false,
    quantitySyncAllowed: false, cancellationAllowed: true, recoveryAllowed: false,
  },
  active: {
    allowedPrev: prevOf("active"), allowedNext: ["payment_due", "payment_failed", "cancel_pending", "custom_pricing_required"],
    trigger: "verified production payment", providerDependency: "recurring_update",
    customerMeaning: "מנוי פעיל בתשלום", billingContinues: true,
    quantitySyncAllowed: true, cancellationAllowed: true, recoveryAllowed: false,
  },
  payment_due: {
    allowedPrev: prevOf("payment_due"), allowedNext: ["active", "payment_failed", "cancelled", "custom_pricing_required"],
    trigger: "trial expired OR renewal due, awaiting verified payment", providerDependency: "verification",
    customerMeaning: "ממתין לתשלום", billingContinues: true,
    quantitySyncAllowed: false, cancellationAllowed: true, recoveryAllowed: true,
  },
  payment_failed: {
    allowedPrev: prevOf("payment_failed"), allowedNext: ["grace", "active", "cancelled"],
    trigger: "a verified provider failure was recorded", providerDependency: "verification",
    customerMeaning: "תשלום נכשל", billingContinues: true,
    quantitySyncAllowed: false, cancellationAllowed: true, recoveryAllowed: true,
  },
  grace: {
    allowedPrev: prevOf("grace"), allowedNext: ["active", "cancelled"],
    trigger: "post-failure grace window (7 calendar days)", providerDependency: "verification",
    customerMeaning: "תקופת חסד", billingContinues: true,
    quantitySyncAllowed: false, cancellationAllowed: true, recoveryAllowed: true,
  },
  cancel_pending: {
    allowedPrev: prevOf("cancel_pending"), allowedNext: ["cancelled", "active"],
    trigger: "cancellation requested (cancel_at_period_end)", providerDependency: "recurring_cancel",
    customerMeaning: "ביטול בסוף התקופה", billingContinues: true,
    quantitySyncAllowed: false, cancellationAllowed: true, recoveryAllowed: true,
  },
  cancelled: {
    allowedPrev: prevOf("cancelled"), allowedNext: ["active", "trialing"],
    trigger: "period end after cancel, OR abandoned", providerDependency: "none",
    customerMeaning: "מבוטל — הנתונים נשמרים", billingContinues: false,
    quantitySyncAllowed: false, cancellationAllowed: false, recoveryAllowed: true,
  },
  custom_pricing_required: {
    allowedPrev: prevOf("custom_pricing_required"), allowedNext: ["active", "payment_due", "cancel_pending", "cancelled"],
    trigger: "> 10 active agents", providerDependency: "none",
    customerMeaning: "תמחור מותאם — לפנות למכירות", billingContinues: true,
    quantitySyncAllowed: false, cancellationAllowed: true, recoveryAllowed: false,
  },
};

// ── Sub-decisions (pure, individually testable) ──────────────────────────────

/** Trial expiry: trialing + past trial_ends_at + NO verified production payment →
 *  payment_due. Idempotent: only fires while still trialing. Never deletes/resets. */
export function decideTrialExpiry(input: { billingState: BillingState; trialEndsAt: string | null; nowMs: number; hasVerifiedProductionPayment: boolean }): { expired: boolean; targetState: BillingState | null } {
  if (input.billingState !== "trialing") return { expired: false, targetState: null };
  const ends = input.trialEndsAt ? new Date(input.trialEndsAt).getTime() : null;
  const passed = ends !== null && ends <= input.nowMs;
  if (passed && !input.hasVerifiedProductionPayment) return { expired: true, targetState: "payment_due" };
  return { expired: false, targetState: null };
}

/** Internal payment-failure ladder (ZONO decision only — NOT provider retry, which
 *  is PROVIDER_DECISION_PENDING). active→payment_failed, payment_failed→grace. */
export function decidePaymentFailureTransition(from: BillingState): BillingState | null {
  if (from === "active" || from === "payment_due") return "payment_failed";
  if (from === "payment_failed") return "grace";
  return null; // grace → cancelled is time/decision-driven (grace duration PRODUCT_DECISION_REQUIRED)
}

/** Recovery: a verified PRODUCTION payment returns a dunning state to active.
 *  Sandbox payments never qualify. Idempotent (only from recoverable states). */
export function decideRecovery(input: { billingState: BillingState; hasVerifiedProductionPayment: boolean }): { available: boolean; targetState: BillingState | null } {
  const recoverable: BillingState[] = ["payment_due", "payment_failed", "grace", "cancel_pending", "cancelled"];
  if (recoverable.includes(input.billingState) && input.hasVerifiedProductionPayment) {
    return { available: true, targetState: "active" };
  }
  return { available: false, targetState: null };
}

/** Cancellation staging (internal): request → cancel_pending (cancel_at_period_end)
 *  → cancelled at period end. Never deletes data. */
export type CancelStage = "none" | "requested" | "cancel_pending" | "cancel_at_period_end_due" | "cancelled";
export function decideCancellationStage(input: { billingState: BillingState; cancelRequested: boolean; periodEnd: string | null; nowMs: number }): CancelStage {
  if (input.billingState === "cancelled") return "cancelled";
  if (!input.cancelRequested) return "none";
  const ends = input.periodEnd ? new Date(input.periodEnd).getTime() : null;
  const boundaryReached = ends !== null && ends <= input.nowMs;
  if (input.billingState === "cancel_pending") return boundaryReached ? "cancel_at_period_end_due" : "cancel_pending";
  return "requested";
}

// ── Unified reconciliation decision (the single chokepoint's brain) ──────────
export type LifecycleAction =
  | "NO_ACTION"
  | "TRIAL_EXPIRED"
  | "PAYMENT_REQUIRED"
  | "QUANTITY_UPDATE_OWED"
  | "CUSTOM_REVIEW_REQUIRED"
  | "STANDARD_RETURN_APPROVAL_REQUIRED"
  | "CANCELLATION_OWED"
  | "PROVIDER_SYNC_PENDING"
  | "PROVIDER_VERIFICATION_REQUIRED"
  | "RECOVERY_AVAILABLE";

export interface LifecycleInput {
  billingState: BillingState;
  nowMs: number;
  trialEndsAt: string | null;
  hasVerifiedProductionPayment: boolean;
  billableAgents: number;
  customPricingRequired: boolean;
  providerQuantity: number | null;
  quantitySyncStatus: string | null;
  cancelRequested: boolean;
  periodEnd: string | null;
  providerConfigured: boolean;
  hasRecurringIdentifiers: boolean;
  unitPriceIls: number;
}

export interface LifecycleDecision {
  action: LifecycleAction;
  targetState: BillingState | null;   // the internal state the org should move to (if any)
  providerDependent: boolean;         // true → cannot complete without a real Grow call
  reason: string;
}

/** Read-only lifecycle status surfaced to Platform Admin + Customer 360 (pure type
 *  so client components can import it without touching a server module). */
export type OrgLifecycleStatus = LifecycleDecision & {
  organizationId: string;
  pending: "PENDING_SANDBOX_CREDENTIALS" | null;
  grace: GraceWindow;
};

// ── Grace period (LOCKED PRODUCT DECISION: 7 calendar days) ──────────────────
export const GRACE_PERIOD_DAYS = 7;
const GRACE_DAY_MS = 86_400_000;

export interface GraceWindow {
  active: boolean;               // is the org currently in the grace state?
  startedAt: string | null;      // endsAt − 7 days (derived)
  endsAt: string | null;         // subscriptions.grace_until
  daysRemaining: number | null;  // whole calendar days left (clamped ≥ 0)
  expired: boolean;              // now > endsAt — grace lapsed. NO auto suspend/cancel/delete.
}

/** The grace window ends exactly 7 calendar days after it begins (entry write). */
export function graceEndsAtFrom(nowMs: number): string {
  return new Date(nowMs + GRACE_PERIOD_DAYS * GRACE_DAY_MS).toISOString();
}

/** PURE grace-window projection for display + expiry. Active only while the state
 *  is `grace`. `expired` is derived from grace_until, so repeated evaluation is
 *  idempotent (same result, no mutation) and never suspends/cancels/deletes. */
export function computeGraceWindow(billingState: BillingState, graceUntil: string | null, nowMs: number): GraceWindow {
  if (billingState !== "grace" || !graceUntil) {
    return { active: false, startedAt: null, endsAt: null, daysRemaining: null, expired: false };
  }
  const endsMs = new Date(graceUntil).getTime();
  const startedAt = new Date(endsMs - GRACE_PERIOD_DAYS * GRACE_DAY_MS).toISOString();
  const daysRemaining = Math.max(0, Math.ceil((endsMs - nowMs) / GRACE_DAY_MS));
  return { active: true, startedAt, endsAt: graceUntil, daysRemaining, expired: nowMs > endsMs };
}

/**
 * THE reconciliation brain. Returns exactly ONE primary action for the org's
 * current facts, in priority order. Provider-dependent actions are FLAGGED
 * (providerDependent) and, when Grow is unconfigured, degrade to a PENDING form —
 * never a fabricated success. Access enforcement is never consulted.
 */
export function reconcileBillingLifecycleDecision(input: LifecycleInput): LifecycleDecision {
  // 1. Trial expiry (highest — a lapsed trial must move to payment_due).
  const trial = decideTrialExpiry(input);
  if (trial.expired) return { action: "TRIAL_EXPIRED", targetState: trial.targetState, providerDependent: false, reason: "trial ended with no verified production payment" };

  // 2. Recovery — a verified production payment rescues a dunning/cancelled state.
  const recovery = decideRecovery(input);
  if (recovery.available) return { action: "RECOVERY_AVAILABLE", targetState: recovery.targetState, providerDependent: false, reason: "verified production payment available → return to active" };

  // 3. Custom pricing (>10) — no auto standard billing/sync.
  if (input.customPricingRequired) return { action: "CUSTOM_REVIEW_REQUIRED", targetState: "custom_pricing_required", providerDependent: false, reason: ">10 active agents — sales-managed; no auto 197×N" };

  // 4. Custom→standard return held (Decision B) — needs platform approval.
  if (input.quantitySyncStatus === "custom_review_required") return { action: "STANDARD_RETURN_APPROVAL_REQUIRED", targetState: null, providerDependent: false, reason: "returned to ≤10 but held — approveStandardBillingReturn required" };

  // 5. Cancellation owed at the boundary.
  const cancelStage = decideCancellationStage(input);
  if (cancelStage === "cancel_at_period_end_due") return { action: "CANCELLATION_OWED", targetState: "cancelled", providerDependent: input.hasRecurringIdentifiers, reason: "cancel_at_period_end boundary reached" };

  // 6. Dunning without payment → payment required.
  if (["payment_due", "payment_failed", "grace"].includes(input.billingState) && !input.hasVerifiedProductionPayment) {
    return { action: "PAYMENT_REQUIRED", targetState: null, providerDependent: false, reason: "awaiting a verified production payment" };
  }

  // 7. Next-cycle quantity change (Decision A) — provider update owed.
  const q = decideRecurringUpdate({
    billableAgents: input.billableAgents, customPricingRequired: input.customPricingRequired,
    unitPriceIls: input.unitPriceIls, providerQuantity: input.providerQuantity, syncStatus: input.quantitySyncStatus,
  });
  if (q.action === "UPDATE_OWED") {
    if (!input.providerConfigured || !input.hasRecurringIdentifiers) {
      return { action: "PROVIDER_SYNC_PENDING", targetState: null, providerDependent: true, reason: "quantity change owed; provider sync PENDING_SANDBOX_CREDENTIALS" };
    }
    return { action: "QUANTITY_UPDATE_OWED", targetState: null, providerDependent: true, reason: "quantity change owed; push at next billing boundary" };
  }

  return { action: "NO_ACTION", targetState: null, providerDependent: false, reason: "reconciled — nothing owed" };
}

// ── Grace period (LOCKED: 7 calendar days) ───────────────────────────────────
export const GRACE_PERIOD = {
  status: "LOCKED" as const,
  days: GRACE_PERIOD_DAYS,                    // 7 calendar days
  entry: "a VERIFIED PRODUCTION payment failure may move active/payment_due → grace",
  recovery: "a VERIFIED PRODUCTION payment during grace → active immediately (sandbox NEVER qualifies)",
  onExpiry: "NO auto suspend/cancel/delete; org + users + properties + CRM stay fully intact. " +
            "Access behavior after grace is a SEPARATE future product decision (not in P8).",
  accessDuringGrace: "no access enforcement in P8 (billing state ≠ access state)",
  idempotent: "expiry is derived from grace_until — repeated evaluation mutates nothing",
} as const;
