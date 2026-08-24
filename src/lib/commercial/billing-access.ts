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

function openFullFor(orgId: string): BillingAccessDecision {
  return { orgId, state: "active", access: "full", mutationsAllowed: true, restricted: false, inGrace: false, graceUntil: null };
}

/**
 * STRICT core: resolves canonical access, but THROWS on a real lookup error. A
 * MISSING subscription row (fresh org) is treated as full access — never an
 * error. Used by the fail-closed provider-spend path so a genuine DB exception
 * blocks the spend, while fresh/paying/grace offices are never blocked.
 */
async function resolveBillingAccessStrict(orgId: string): Promise<BillingAccessDecision> {
  const db = createServiceRoleClient();
  const subRes = await (db.from("subscriptions" as never)
    .select("status,cancel_at_period_end,grace_until")
    .eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: { status: string | null; cancel_at_period_end: boolean | null; grace_until: string | null } | null; error: unknown }>);
  if (subRes.error) throw new Error("billing subscription lookup failed");
  const sub = subRes.data;
  if (!sub) return openFullFor(orgId); // no subscription row yet (fresh org) → never lock out
  const q = await getOrgBillingQuantity(orgId).catch(() => ({ customPricingRequired: false } as { customPricingRequired: boolean }));
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
}

/**
 * Resolve the canonical billing access for an org. Fail-OPEN: any error yields
 * full access (never lock out over a lookup failure). Reads / UI only.
 */
export async function resolveBillingAccess(orgId: string): Promise<BillingAccessDecision> {
  try { return await resolveBillingAccessStrict(orgId); }
  catch (e) { console.error("[billing-access] resolve failed (fail-open):", e); return openFullFor(orgId); }
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
 *
 * `failClosed` (default false) controls behavior when the billing lookup itself
 * ERRORS: false → allow (fail-open, for low-cost internal mutations like seat
 * management); true → BLOCK (fail-closed, for anything that spends real provider
 * money — see assertProviderSpendAllowed).
 */
export async function assertBillingAllowsMutation(orgId: string, opts?: { failClosed?: boolean }): Promise<void> {
  let d: BillingAccessDecision;
  try {
    d = await resolveBillingAccessStrict(orgId);
  } catch (e) {
    if (opts?.failClosed) {
      console.error("[billing-access] lookup failed on a provider-spend mutation → BLOCK (fail-closed):", e);
      throw new BillingRestrictedError();
    }
    return; // low-cost mutation → never lock out over a lookup failure
  }
  if (!d.mutationsAllowed) throw new BillingRestrictedError();
}

/**
 * 8.3 — the canonical guard for a PROVIDER-SPEND mutation (AI/LLM/image
 * generation, bulk WhatsApp/email, campaign/distribution launch, paid
 * enrichment). Fail-CLOSED: a billing-state lookup failure BLOCKS the spend — a
 * provider-cost action must never proceed on unknown billing state. Must be
 * called BEFORE any external provider request. Reads are never routed here.
 * NOTE: resolveBillingAccess is itself internally fail-open for the *decision*
 * (a missing subscription row = full access for a fresh org); fail-closed here
 * applies only to an actual lookup EXCEPTION, so paying/trial/grace offices are
 * never blocked spuriously.
 */
export async function assertProviderSpendAllowed(orgId: string): Promise<void> {
  return assertBillingAllowsMutation(orgId, { failClosed: true });
}

/**
 * 8.3 — boolean form of the provider-spend gate for BATCH / cron / queued paths
 * that must SKIP a restricted org (record an honest blocked state) rather than
 * throw and abort the batch. Returns TRUE ⇒ do NOT spend (org is restricted OR
 * the billing lookup errored — fail-CLOSED). Returns FALSE ⇒ spend is allowed.
 * Call immediately before the external provider request, per org.
 */
export async function isProviderSpendBlocked(orgId: string): Promise<boolean> {
  try {
    const d = await resolveBillingAccessStrict(orgId);
    return !d.mutationsAllowed;
  } catch (e) {
    console.error("[billing-access] lookup failed on a batch provider-spend check → BLOCK (fail-closed):", e);
    return true; // unknown billing state must never spend provider money
  }
}
