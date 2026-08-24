// ============================================================================
// ZONO — BILLING ACCESS · the ONE canonical entitlement gate (server-only). 8.2.
// ----------------------------------------------------------------------------
// The single place that answers "what may this org do right now, given billing?"
// Reads authoritative subscription state → canonical BillingState → the PURE
// access decision in billing-state.ts. Nothing else in the product re-derives
// access from `subscriptions.status`; premium/cost-generating server actions call
// assertBillingAllowsMutation() (or read resolveBillingAccess() for UI), so the
// rule lives in exactly one file.
//
// Hard guarantees:
//   • Reads are NEVER gated — this only blocks new value/cost-generating writes.
//   • fail-OPEN on any lookup error: a billing-access lookup failure must never
//     lock a paying office out of its own product (the restriction is a
//     deliberate post-grace state, not an incident side-effect).
//   • Data is never touched here — pure decision over read state.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  canonicalFromSubscriptionStatus, billingAccessForState, mutationAllowedForAccess,
  type BillingState, type CustomerAccess,
} from "./billing-state";
import { getOrgBillingQuantity } from "./billing";

export interface BillingAccessDecision {
  orgId: string;
  state: BillingState;
  access: CustomerAccess;          // "full" | "read_only" | "restricted"
  mutationsAllowed: boolean;       // false ⇒ premium/cost-generating writes blocked
  restricted: boolean;             // post-grace BILLING_RESTRICTED
  inGrace: boolean;                // in the 7-day grace window (full access, clock running)
  graceUntil: string | null;
}

/**
 * Resolve the canonical billing access for an org. Fail-OPEN: any error yields
 * full access (never lock out over a lookup failure). Reads only.
 */
export async function resolveBillingAccess(orgId: string): Promise<BillingAccessDecision> {
  const openFull: BillingAccessDecision = {
    orgId, state: "active", access: "full", mutationsAllowed: true, restricted: false, inGrace: false, graceUntil: null,
  };
  try {
    const db = createServiceRoleClient();
    const [subRes, q] = await Promise.all([
      db.from("subscriptions" as never)
        .select("status,cancel_at_period_end,grace_until")
        .eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: { status: string | null; cancel_at_period_end: boolean | null; grace_until: string | null } | null }>,
      getOrgBillingQuantity(orgId).catch(() => ({ customPricingRequired: false } as { customPricingRequired: boolean })),
    ]);
    const sub = subRes.data;
    if (!sub) return openFull; // no subscription row yet (fresh org) → never lock out
    const state = canonicalFromSubscriptionStatus(sub.status, {
      customPricing: q.customPricingRequired, cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    });
    const access = billingAccessForState(state);
    return {
      orgId, state, access,
      mutationsAllowed: mutationAllowedForAccess(access),
      restricted: access === "restricted",
      inGrace: state === "grace",
      graceUntil: sub.grace_until ?? null,
    };
  } catch (e) {
    console.error("[billing-access] resolve failed (fail-open):", e);
    return openFull;
  }
}

/** Thrown by assertBillingAllowsMutation when the org is billing-restricted. */
export class BillingRestrictedError extends Error {
  readonly code = "BILLING_RESTRICTED";
  constructor(message = "המנוי ממתין להסדרת תשלום. חדשו את התשלום כדי להמשיך.") { super(message); this.name = "BillingRestrictedError"; }
}

/**
 * Canonical guard for a premium / cost-generating mutation. Call at the top of a
 * server action that creates cost (add paid seat, AI generation, bulk outreach,
 * campaign/distribution, etc.). Throws BillingRestrictedError when blocked; does
 * nothing when access is full. NEVER call this on a read path.
 */
export async function assertBillingAllowsMutation(orgId: string): Promise<void> {
  const d = await resolveBillingAccess(orgId);
  if (!d.mutationsAllowed) throw new BillingRestrictedError();
}
