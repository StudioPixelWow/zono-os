// ============================================================================
// ZONO — RECURRING QUANTITY-UPDATE DECISION (PURE, server-safe). P8.4B.
// The provider-independent decision logic for next-cycle quantity changes and the
// custom/approval holds. No DB / env / provider — deterministically unit-testable.
// recurring.ts (server) wraps this with the Grow calls (credential-gated).
//
// LOCKED PRODUCT DECISIONS: A) next-cycle only, no proration; B) custom→standard
// return is held (CUSTOM_REVIEW_REQUIRED) until platform approval.
// ============================================================================

export type RecurringUpdateAction =
  | "NONE"                       // provider already matches expected; nothing owed
  | "UPDATE_OWED"                // push new amount at the next boundary (Decision A)
  | "CUSTOM_REVIEW_REQUIRED"     // >10 — never auto-update; route to sales
  | "BLOCKED_PENDING_APPROVAL";  // custom→standard hold; needs platform approval (B)

export interface RecurringDecisionInput {
  billableAgents: number;
  customPricingRequired: boolean;
  unitPriceIls: number;
  providerQuantity: number | null;   // last ACKED quantity the provider holds
  syncStatus: string | null;         // subscriptions.quantity_sync_status
}
export interface RecurringDecision {
  action: RecurringUpdateAction;
  targetQuantity: number;
  targetSumIls: number | null;       // amount to send at the boundary (null when N/A)
  reason: string;
}

export function decideRecurringUpdate(input: RecurringDecisionInput): RecurringDecision {
  const targetQuantity = input.billableAgents;
  if (input.customPricingRequired) {
    return { action: "CUSTOM_REVIEW_REQUIRED", targetQuantity, targetSumIls: null, reason: ">10 active — sales-managed; no auto 197×N" };
  }
  if (input.syncStatus === "custom_review_required") {
    return { action: "BLOCKED_PENDING_APPROVAL", targetQuantity, targetSumIls: null, reason: "custom→standard return awaits platform approval" };
  }
  if (input.providerQuantity !== null && input.providerQuantity === targetQuantity) {
    return { action: "NONE", targetQuantity, targetSumIls: null, reason: "provider already at expected quantity" };
  }
  return { action: "UPDATE_OWED", targetQuantity, targetSumIls: targetQuantity * input.unitPriceIls, reason: "expected quantity changed; push at next billing cycle (no proration)" };
}
