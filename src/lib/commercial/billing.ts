// ============================================================================
// ZONO — canonical org BILLING-STATE resolver (server-only). P8.1.
// THE single resolver both Platform Admin and Customer 360 consume, so the two
// surfaces are provably consistent. This module is the thin DB wrapper; ALL
// decision logic is the PURE composeOrgBillingState (./billing-compose), which is
// deterministically unit-tested by scripts/p8-1-trial-billing-qa.mts. Composes:
//   getOrgCommercialState (expectation) + subscriptions (lifecycle) + verified
//   payments (revenue) → the P8.0 canonical billing state machine.
//
// STRICT SEPARATION: expectedMonthlyIls is a COMMERCIAL EXPECTATION (197 × active
// agents), NEVER revenue. verifiedRevenue is ONLY the sum of payments.verified=true
// (signed-webhook evidence); with no verified payment it is reported UNAVAILABLE.
// Not connected to P7 enforcement.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrgCommercialState } from "./state";
import { canonicalFromSubscriptionStatus } from "./billing-state";
import { computeOrgBillingQuantity, type OrgBillingQuantity } from "./quantity";
import { reconcilePlan, type ReconcileDecision, type ReconcileSyncStatus, type ReconcileOldRow, type OrgProviderQuantityRow } from "./reconcile";
import {
  composeOrgBillingState,
  type OrgBillingState,
  type BillingSubInput,
  type BillingPayInput,
} from "./billing-compose";

// Re-export the canonical types + pure composer so existing import sites
// (`@/lib/commercial/billing`) are unchanged.
export {
  composeOrgBillingState,
  some,
  none,
  type Availability,
  type OrgBillingState,
  type BillingSubInput,
  type BillingPayInput,
} from "./billing-compose";

export async function getOrgBillingState(orgId: string): Promise<OrgBillingState> {
  const db = createServiceRoleClient();
  const [commercial, subRow, payRows] = await Promise.all([
    getOrgCommercialState(orgId),
    (db.from("subscriptions" as never).select("status,period_end,trial_ends_at,grow_subscription_id,cancel_at_period_end").eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: BillingSubInput | null }>),
    (db.from("payments" as never).select("status,amount_ils,verified,verified_at,created_at,environment").eq("org_id", orgId) as unknown as Promise<{ data: BillingPayInput[] | null }>),
  ]);
  return composeOrgBillingState({
    orgId,
    commercial,
    sub: subRow.data ?? null,
    pays: payRows.data ?? [],
    nowMs: Date.now(),
    providerConfigured: !!process.env.GROW_CHECKOUT_URL,
    generatedAt: new Date().toISOString(),
  });
}

// Re-export the canonical quantity resolver + types (P8.2).
export {
  computeOrgBillingQuantity,
  deriveQuantityEvents,
  QUANTITY_POLICY,
  type OrgBillingQuantity,
  type ProviderQuantityState,
  type QuantitySyncStatus,
  type QuantityDisposition,
  type QuantityChangeEvent,
  type QuantityEventType,
} from "./quantity";

/**
 * P8.2 — THE canonical agent-quantity resolver both Platform Admin and Customer
 * 360 consume. Server wrapper over the PURE computeOrgBillingQuantity: reads
 * authoritative counts (active users + pending invitations, via
 * getOrgCommercialState) + the subscription's provider linkage, then derives.
 * Concurrency-safe by construction (counts, not counters). Read-only; never
 * charges, never calls the provider. lastSyncedQuantity is NULL in P8.2 (no sync
 * has run; honestly reported as NOT_SYNCED).
 */
export async function getOrgBillingQuantity(orgId: string): Promise<OrgBillingQuantity> {
  const db = createServiceRoleClient();
  const [commercial, subRow] = await Promise.all([
    getOrgCommercialState(orgId),
    (db.from("subscriptions" as never).select("status,grow_subscription_id,cancel_at_period_end").eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: { status: string | null; grow_subscription_id: string | null; cancel_at_period_end: boolean | null } | null }>),
  ]);
  const sub = subRow.data ?? null;
  const billingState = canonicalFromSubscriptionStatus(sub?.status, {
    customPricing: commercial.customPricingRequired,
    cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
  });
  return computeOrgBillingQuantity({
    orgId,
    activeUsers: commercial.billableAgents,           // billableAgents = active users
    pendingInvitations: commercial.reservedSeats,     // commercial.reservedSeats = pending invites
    isTrial: commercial.trial.isTrial,
    billingState,
    providerConfigured: !!process.env.GROW_CHECKOUT_URL,
    subscriptionIdPresent: !!sub?.grow_subscription_id,
    lastSyncedQuantity: null,                         // no real sync in P8.2 → NOT_SYNCED
    source: "counts:users.active+org_invitations.pending",
    calculatedAt: new Date().toISOString(),
  });
}

// Re-export the canonical reconciler core + types (P8.3).
export {
  reconcilePlan,
  decideQuantityReconciliation,
  FAILURE_CONTRACT,
  type ReconcileDecision,
  type ReconcileSyncStatus,
  type ReconcileInput,
  type ReconcileOldRow,
  type ReconcilePlan,
  type OrgProviderQuantityRow,
} from "./reconcile";

export interface ReconcileResult {
  organizationId: string;
  decision: ReconcileDecision;
  changed: boolean;                 // did a DB write actually occur (RPC rows-affected > 0)
  targetQuantity: number | null;
  targetStatus: ReconcileSyncStatus;
  providerQuantity: number | null;  // last acked — NEVER written by the reconciler
  reason: string;
  generatedAt: string;
}

/**
 * P8.3 — THE single provider-quantity reconciliation chokepoint. Reads the
 * authoritative billable quantity (getOrgBillingQuantity) + the subscription's
 * current persisted state, computes the desired (expected quantity, sync status)
 * via the PURE reconcilePlan, and persists through the atomic service-role RPC
 * `reconcile_subscription_quantity` (the ONLY writer). Concurrency-safe: the RPC's
 * rows-affected is the final arbiter — only the reconciler that actually
 * transitioned the row emits events. NEVER writes provider_quantity, NEVER calls
 * a provider, NEVER fakes a successful sync. Read-authoritative: quantity is
 * derived server-side from counts, never from client input.
 */
export async function reconcileOrgBillingQuantity(orgId: string): Promise<ReconcileResult> {
  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const [q, subRow] = await Promise.all([
    getOrgBillingQuantity(orgId),
    (db.from("subscriptions" as never).select("status,cancel_at_period_end,subscription_quantity,provider_quantity,quantity_sync_status").eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: { status: string | null; cancel_at_period_end: boolean | null; subscription_quantity: number | null; provider_quantity: number | null; quantity_sync_status: string | null } | null }>),
  ]);
  const sub = subRow.data ?? null;
  const hasSubscription = !!sub;
  const billingState = canonicalFromSubscriptionStatus(sub?.status, {
    customPricing: q.customPricingRequired,
    cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
  });
  const oldRow: ReconcileOldRow | null = sub
    ? { subscriptionQuantity: sub.subscription_quantity ?? null, quantitySyncStatus: sub.quantity_sync_status ?? null }
    : null;

  const plan = reconcilePlan(
    {
      organizationId: orgId,
      billingState,
      customPricingRequired: q.customPricingRequired,
      providerConfigured: !!process.env.GROW_CHECKOUT_URL,
      hasSubscription,
      expectedQuantity: q.billableAgents,
      providerQuantity: sub?.provider_quantity ?? null,
    },
    oldRow,
    { action: "reconcile", at: nowIso },
  );

  let actualChanged = false;
  if (plan.changed && hasSubscription) {
    // Atomic conditional write via the service-role RPC. rows-affected settles
    // concurrency: a losing concurrent reconciler gets 0 → no event duplication.
    const { data: rows } = await (db.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: number | null }>)(
      "reconcile_subscription_quantity",
      { p_org: orgId, p_quantity: plan.targetQuantity, p_status: plan.targetStatus, p_now: nowIso },
    );
    actualChanged = (rows ?? 0) > 0;

    if (actualChanged && plan.events.length) {
      // Best-effort, non-blocking audit trail (service-role). Safe fields only —
      // no email/token/payload/credentials. Only the winning reconciler reaches here.
      await db.from("audit_log").insert(
        plan.events.map((e) => ({
          organization_id: orgId, actor_id: null, actor_name: "system:reconciler",
          action: e.type, category: "configuration",
          entity_type: "subscription", entity_id: orgId,
          summary: `${e.type}: ${e.oldQuantity}->${e.newQuantity}`,
          metadata: { oldQuantity: e.oldQuantity, newQuantity: e.newQuantity, reason: e.reason } as never,
        })) as never,
      ).then(() => undefined, () => undefined);
    }
  }

  return {
    organizationId: orgId,
    decision: actualChanged ? plan.decision : "NO_ACTION",
    changed: actualChanged,
    targetQuantity: plan.targetQuantity,
    targetStatus: plan.targetStatus,
    providerQuantity: sub?.provider_quantity ?? null,
    reason: actualChanged ? plan.reason : (hasSubscription ? "NO_CHANGE" : "NO_SUBSCRIPTION"),
    generatedAt: nowIso,
  };
}

/** Read the provider-quantity columns for display (safe fields only). */
export async function getOrgProviderQuantityRow(orgId: string): Promise<OrgProviderQuantityRow | null> {
  const db = createServiceRoleClient();
  const { data } = await (db.from("subscriptions" as never).select("subscription_quantity,provider_quantity,quantity_sync_status,quantity_synced_at,quantity_sync_error").eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: { subscription_quantity: number | null; provider_quantity: number | null; quantity_sync_status: string | null; quantity_synced_at: string | null; quantity_sync_error: string | null } | null }>);
  if (!data) return null;
  return {
    subscriptionQuantity: data.subscription_quantity ?? null,
    providerQuantity: data.provider_quantity ?? null,
    quantitySyncStatus: data.quantity_sync_status ?? null,
    quantitySyncedAt: data.quantity_synced_at ?? null,
    quantitySyncError: data.quantity_sync_error ?? null,
  };
}
