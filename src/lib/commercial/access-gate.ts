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
import { getSessionContext } from "@/lib/auth/session";
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

/** Thrown by requireActiveSubscription when an unpaid, enforced org tries to run a
 *  gated server action directly (bypassing the layout gate). `reason` lets an
 *  error boundary / action wrapper render "payment required" vs. "sign in". */
export class PaywallError extends Error {
  readonly reason: "unauthenticated" | "no_org" | "payment_required";
  constructor(reason: "unauthenticated" | "no_org" | "payment_required") {
    super(reason === "payment_required" ? "PAYMENT_REQUIRED" : reason === "no_org" ? "NO_ORG" : "UNAUTHENTICATED");
    this.name = "PaywallError";
    this.reason = reason;
  }
}

/**
 * CENTRAL server-side subscription guard. Call at the TOP of any sensitive server
 * action or route handler (create/update/claim/generate/publish/export). The
 * `(app)` layout gate only protects RENDERING — a direct action POST does not pass
 * through it — so mutations must assert the gate themselves. This is the single
 * source of truth; never re-implement the paid check inside an action.
 *
 * Fail-open on a lookup error (a billing glitch must never block a paying org),
 * and a no-op when enforcement is off or the org is grandfathered — identical
 * semantics to the layout gate, so behaviour is consistent everywhere.
 */
export async function requireActiveSubscription(): Promise<{ orgId: string }> {
  const { state, organization } = await getSessionContext();
  if (state === "unauthenticated") throw new PaywallError("unauthenticated");
  if (!organization?.id) throw new PaywallError("no_org");
  const orgCreatedAt = (organization as { created_at?: string | null }).created_at ?? null;
  const gate = await resolvePaymentGate(organization.id, orgCreatedAt);
  if (gate.blocked) throw new PaywallError("payment_required");
  return { orgId: organization.id };
}

/** Non-throwing variant for callers that prefer a boolean (e.g. conditional UI
 *  affordances on the server). Mirrors requireActiveSubscription's decision. */
export async function isSubscriptionActiveForActions(): Promise<boolean> {
  try { await requireActiveSubscription(); return true; } catch { return false; }
}
