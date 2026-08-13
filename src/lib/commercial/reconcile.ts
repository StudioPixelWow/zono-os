// ============================================================================
// ZONO — CANONICAL PROVIDER-QUANTITY RECONCILER (PURE, server-safe). P8.3.
// The DECISION LOGIC of the single reconciliation chokepoint. No DB / env / clock
// / provider call lives here — everything is derived from authoritative inputs so
// it is deterministic, unit-testable, and idempotent. `billing.ts` wraps this with
// the DB read + the atomic service-role RPC (reconcile_subscription_quantity),
// which is the ONLY write path for subscription_quantity / quantity_sync_status.
//
// THREE DISTINCT QUANTITIES — never collapsed:
//   • CURRENT BILLABLE      = active users right now (from getOrgBillingQuantity).
//   • EXPECTED SUBSCRIPTION  = what ZONO intends the subscription to bill = current
//                              billable (persisted to subscriptions.subscription_quantity).
//   • LAST ACKED PROVIDER    = subscriptions.provider_quantity — changes ONLY after a
//                              real, verified provider response (P8.4). NULL in P8.3.
//
// P8.3 NEVER writes provider_quantity, NEVER emits sync_succeeded/sync_failed,
// NEVER calls a provider, NEVER moves money. Custom (>10) and cancelled hold sync.
// ============================================================================
import type { BillingState } from "./billing-state";
import type { QuantityChangeEvent } from "./quantity";

// Reconciler decision (provider-sync posture) — spec §6.
export type ReconcileDecision =
  | "NO_ACTION"                // nothing to persist/change this run (idempotent repeat)
  | "NOT_CONFIGURED"           // no provider configured
  | "SYNC_REQUIRED"            // expected != last-acked provider qty; a sync is owed
  | "SYNCED"                   // expected == last-acked (only reachable post-P8.4)
  | "CUSTOM_REVIEW_REQUIRED"   // >10 active — sync paused pending commercial review
  | "BLOCKED_BY_STATE";        // billing state forbids sync (e.g. cancelled)

// Persisted quantity_sync_status vocabulary (lowercased; matches DB CHECK).
export type ReconcileSyncStatus =
  | "not_configured" | "not_synced" | "sync_required"
  | "syncing" | "synced" | "failed" | "custom_review_required";

export interface ReconcileInput {
  organizationId: string;
  billingState: BillingState;
  customPricingRequired: boolean;
  providerConfigured: boolean;
  hasSubscription: boolean;
  expectedQuantity: number;          // = current billable agents
  providerQuantity: number | null;   // last ACKED provider qty (NULL until P8.4)
}

export interface ReconcileOldRow {
  subscriptionQuantity: number | null;
  quantitySyncStatus: string | null;
}

/** Persisted provider-quantity state from the subscription row (safe fields; for
 *  display on Platform Admin + Customer 360). Lives here (pure) so client
 *  components can import the type without touching the server-only billing module. */
export interface OrgProviderQuantityRow {
  subscriptionQuantity: number | null;
  providerQuantity: number | null;
  quantitySyncStatus: string | null;
  quantitySyncedAt: string | null;
  quantitySyncError: string | null;
}

export interface ReconcilePlan {
  organizationId: string;
  decision: ReconcileDecision;
  targetQuantity: number | null;     // desired subscriptions.subscription_quantity
  targetStatus: ReconcileSyncStatus; // desired subscriptions.quantity_sync_status
  changed: boolean;                  // would a DB write occur (desired != current)?
  events: QuantityChangeEvent[];     // emitted ONLY when changed
  reason: string;
}

/**
 * PURE provider-sync posture: what status the subscription SHOULD hold and what
 * expected quantity should be persisted, given the org's current billing facts.
 * Never decides money movement. provider_quantity is NEVER a target here.
 */
export function decideQuantityReconciliation(input: ReconcileInput): {
  decision: ReconcileDecision; targetStatus: ReconcileSyncStatus; targetQuantity: number;
} {
  const targetQuantity = input.expectedQuantity; // expected subscription qty = current billable

  if (input.customPricingRequired) {
    // >10 active — hold: sync paused, commercial review required. No 197×N, no sync.
    return { decision: "CUSTOM_REVIEW_REQUIRED", targetStatus: "custom_review_required", targetQuantity };
  }
  if (!input.providerConfigured) {
    return { decision: "NOT_CONFIGURED", targetStatus: "not_configured", targetQuantity };
  }
  if (input.billingState === "cancelled") {
    // Read-only lifecycle: never sync a cancelled org's quantity. Data preserved.
    return { decision: "BLOCKED_BY_STATE", targetStatus: "not_synced", targetQuantity };
  }
  if (input.billingState === "active") {
    if (input.providerQuantity !== null && input.providerQuantity === targetQuantity) {
      return { decision: "SYNCED", targetStatus: "synced", targetQuantity };
    }
    return { decision: "SYNC_REQUIRED", targetStatus: "sync_required", targetQuantity };
  }
  // Deferred states (trialing, payment_due, payment_failed, grace, cancel_pending):
  // track the expected quantity; do NOT pursue a provider sync now (CALCULATED).
  return { decision: "NO_ACTION", targetStatus: "not_synced", targetQuantity };
}

/**
 * PURE reconcile plan: combines the desired posture with the CURRENT persisted row
 * to decide whether a write is owed and which events it produces. Idempotent: when
 * the row already equals the desired state, changed=false, decision NO_ACTION,
 * events []. The DB wrapper uses the atomic RPC's rows-affected as the final
 * concurrency arbiter (only the winning reconciler emits).
 *
 * A null persisted quantity is treated as 0 for the change event (nothing was
 * billed before). sync_succeeded/sync_failed are NEVER produced here.
 */
export function reconcilePlan(
  input: ReconcileInput,
  oldRow: ReconcileOldRow | null,
  ctx: { action: string; at: string },
): ReconcilePlan {
  if (!input.hasSubscription || oldRow === null) {
    // No subscription row → nothing to reconcile; never create one here.
    return {
      organizationId: input.organizationId,
      decision: "NO_ACTION", targetQuantity: null, targetStatus: "not_synced",
      changed: false, events: [], reason: "NO_SUBSCRIPTION",
    };
  }

  const { decision: posture, targetStatus, targetQuantity } = decideQuantityReconciliation(input);
  const qtyChanged = (oldRow.subscriptionQuantity ?? null) !== targetQuantity;
  const statusChanged = (oldRow.quantitySyncStatus ?? null) !== targetStatus;
  const changed = qtyChanged || statusChanged;

  if (!changed) {
    return {
      organizationId: input.organizationId,
      decision: "NO_ACTION", targetQuantity, targetStatus,
      changed: false, events: [], reason: "ALREADY_RECONCILED",
    };
  }

  const events: QuantityChangeEvent[] = [];
  if (qtyChanged) {
    events.push({
      type: "billing.quantity.changed",
      organizationId: input.organizationId,
      oldQuantity: oldRow.subscriptionQuantity ?? 0,
      newQuantity: targetQuantity,
      reason: "expected subscription quantity persisted",
      action: ctx.action,
      at: ctx.at,
    });
  }
  if (targetStatus === "sync_required" && oldRow.quantitySyncStatus !== "sync_required") {
    events.push({
      type: "billing.quantity.sync_required",
      organizationId: input.organizationId,
      oldQuantity: oldRow.subscriptionQuantity ?? 0,
      newQuantity: targetQuantity,
      reason: "provider sync owed (controlled — no provider call in P8.3)",
      action: ctx.action,
      at: ctx.at,
    });
  } else if (targetStatus === "custom_review_required" && oldRow.quantitySyncStatus !== "custom_review_required") {
    events.push({
      type: "billing.custom_pricing.required",
      organizationId: input.organizationId,
      oldQuantity: oldRow.subscriptionQuantity ?? 0,
      newQuantity: targetQuantity,
      reason: ">10 active agents — route to sales; provider sync paused; no auto 197×N",
      action: ctx.action,
      at: ctx.at,
    });
  }

  return {
    organizationId: input.organizationId,
    decision: posture, targetQuantity, targetStatus,
    changed: true, events, reason: "RECONCILED",
  };
}

// ── Future provider-failure semantics (DESIGN — no failure can occur in P8.3) ──
// When a real provider sync later fails (P8.4): subscription_quantity stays the
// EXPECTED ZONO quantity; provider_quantity stays the LAST KNOWN SUCCESSFUL qty
// (NEVER overwritten with the failed requested qty); quantity_sync_status='failed';
// quantity_sync_error holds a SAFE CATEGORY only (never a raw provider body/secret).
export const FAILURE_CONTRACT = {
  preserveProviderQuantity: true,   // do NOT overwrite last-acked with the failed request
  keepExpectedQuantity: true,       // subscription_quantity remains ZONO's expectation
  status: "failed" as const,
  errorField: "quantity_sync_error (safe category only; no raw body/secrets)",
} as const;
