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
    (db.from("payments" as never).select("status,amount_ils,verified,verified_at,created_at").eq("org_id", orgId) as unknown as Promise<{ data: BillingPayInput[] | null }>),
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
