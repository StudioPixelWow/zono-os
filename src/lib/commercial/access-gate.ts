// ============================================================================
// ZONO — NEW-USER PAYMENT GATE (server-only). The canonical answer to "may this
// org use the product yet?" under the NO-TRIAL model: a new office is UNPAID until
// a verified Grow payment activates its subscription. Distinct from billing-access
// (which governs the grace/dunning lifecycle of an EXISTING paying customer): this
// governs first access.
//
// SAFE ROLLOUT (never lock existing customers out overnight): enforcement applies
// ONLY to orgs created on/after BILLING_ENFORCE_AFTER (ISO env). When that env is
// unset, enforcement is OFF for everyone (fail-safe) — the owner enables new-user
// enforcement by setting the date. Orgs created before the cutoff are grandfathered.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isOrgEnforced, paymentGateDecision, isPathAllowedWhenUnpaid, billingEnforcementCutoff } from "./access-gate-core";

export { isOrgEnforced, isPathAllowedWhenUnpaid, billingEnforcementCutoff };

/** True only when the org has a genuinely PAID (active) subscription. Trial/
 *  payment_due/cancelled/missing all count as NOT paid under the no-trial model. */
export async function hasActivePaidSubscription(orgId: string): Promise<boolean> {
  const db = createServiceRoleClient();
  const { data } = await (db.from("subscriptions" as never)
    .select("status").eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: { status: string | null } | null }>);
  return (data?.status ?? "").toLowerCase() === "active";
}

export interface PaymentGateDecision { orgId: string; enforced: boolean; paid: boolean; blocked: boolean }

/** Resolve the payment gate for an org. blocked = enforced && !paid (fail-open on
 *  a lookup error — a billing glitch must never lock an org out). */
export async function resolvePaymentGate(orgId: string, orgCreatedAt: string | null | undefined): Promise<PaymentGateDecision> {
  const enforced = isOrgEnforced(orgCreatedAt);
  if (!enforced) return { orgId, ...paymentGateDecision(false, true) };
  const paid = await hasActivePaidSubscription(orgId).catch(() => true);
  return { orgId, ...paymentGateDecision(true, paid) };
}
