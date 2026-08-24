// ============================================================================
// ZONO — BILLING LIFECYCLE RECONCILER (server-only). P8.5A.
// The single server chokepoint: reads authoritative DB state, runs the PURE
// lifecycle engine (lifecycle.ts), and commits ONLY safe internal transitions
// (trial expiry, verified-payment recovery) through the atomic guarded RPC
// transition_subscription_status — concurrency-safe, idempotent. Provider-
// dependent actions (quantity update, cancellation at Grow) are SURFACED as
// PENDING and never executed here (no Grow call, no fabricated ack). Billing
// state is never connected to access enforcement.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canonicalFromSubscriptionStatus, type BillingState } from "./billing-state";
import { getOrgBillingQuantity } from "./billing";
import { reconcileBillingLifecycleDecision, computeGraceWindow, graceEndsAtFrom, type LifecycleAction, type LifecycleDecision, type OrgLifecycleStatus, type GraceWindow } from "./lifecycle";
import { notifyOrgBilling } from "./billing-notify";

// canonical BillingState → legacy subscriptions.status (the column's vocabulary).
const CANON_TO_LEGACY: Partial<Record<BillingState, string>> = {
  trialing: "trial", active: "active", payment_due: "pending_payment",
  payment_failed: "suspended", grace: "grace_period", cancelled: "cancelled",
};

export interface LifecycleReconcileResult extends LifecycleDecision {
  organizationId: string;
  executed: boolean;                 // did a safe internal transition actually commit?
  pending: "PENDING_SANDBOX_CREDENTIALS" | null;
  generatedAt: string;
}

interface SubRow {
  status: string | null; period_end: string | null; trial_ends_at: string | null;
  cancel_at_period_end: boolean | null; provider_quantity: number | null;
  quantity_sync_status: string | null; grow_transaction_id: string | null;
  grow_transaction_token: string | null; grow_asmachta: string | null;
  grace_until: string | null;
}

async function readLifecycle(orgId: string): Promise<{ sub: SubRow | null; decision: LifecycleDecision; grace: GraceWindow; nowIso: string }> {
  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const [q, subRes, prodPaidRes] = await Promise.all([
    getOrgBillingQuantity(orgId),
    (db.from("subscriptions" as never).select("status,period_end,trial_ends_at,cancel_at_period_end,provider_quantity,quantity_sync_status,grow_transaction_id,grow_transaction_token,grow_asmachta,grace_until").eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: SubRow | null }>),
    // A VERIFIED, PAID, PRODUCTION payment (sandbox never qualifies for revenue state).
    (db.from("payments" as never).select("id").eq("org_id", orgId).eq("verified", true).eq("status", "paid").eq("environment", "production").limit(1) as unknown as Promise<{ data: Array<{ id: string }> | null }>),
  ]);
  const sub = subRes.data ?? null;
  const billingState = canonicalFromSubscriptionStatus(sub?.status, { customPricing: q.customPricingRequired, cancelAtPeriodEnd: !!sub?.cancel_at_period_end });
  const decision = reconcileBillingLifecycleDecision({
    billingState, nowMs, trialEndsAt: sub?.trial_ends_at ?? null,
    hasVerifiedProductionPayment: (prodPaidRes.data?.length ?? 0) > 0,
    billableAgents: q.billableAgents, customPricingRequired: q.customPricingRequired,
    providerQuantity: sub?.provider_quantity ?? null, quantitySyncStatus: sub?.quantity_sync_status ?? null,
    cancelRequested: !!sub?.cancel_at_period_end, periodEnd: sub?.period_end ?? null,
    providerConfigured: !!process.env.GROW_CHECKOUT_URL, hasRecurringIdentifiers: !!(sub?.grow_transaction_id && sub?.grow_transaction_token && sub?.grow_asmachta),
    unitPriceIls: q.unitPriceIls,
  });
  const grace = computeGraceWindow(billingState, sub?.grace_until ?? null, nowMs);
  return { sub, decision, grace, nowIso };
}

/** READ-ONLY lifecycle status for display (Platform Admin + Customer 360). Runs the
 *  pure engine over authoritative DB state WITHOUT executing any transition. */
export async function getOrgLifecycleStatus(orgId: string): Promise<OrgLifecycleStatus> {
  const { decision, grace } = await readLifecycle(orgId);
  const pending = decision.providerDependent && !process.env.GROW_CHECKOUT_URL ? "PENDING_SANDBOX_CREDENTIALS" as const : null;
  return { organizationId: orgId, ...decision, pending, grace };
}

/**
 * Begin the 7-day grace window after a VERIFIED PRODUCTION payment failure. Atomic
 * + idempotent: sets status='grace_period' + grace_until = now + 7 days ONLY when
 * the org is active/pending_payment/suspended (a conditional update — a second call
 * once already in grace matches 0 rows and NEVER resets grace_until). Never deletes
 * or suspends data. The FAILURE TRIGGER is provider-dependent (a real failed Grow
 * callback); this writer is the ZONO-side entry, ready for that path.
 */
export async function beginGraceWindow(orgId: string): Promise<{ ok: boolean; started: boolean }> {
  const db = createServiceRoleClient();
  const now = new Date();
  const graceUntil = graceEndsAtFrom(now.getTime());
  const { data } = await (db.from("subscriptions" as never)
    .update({ status: "grace_period", grace_until: graceUntil, updated_at: now.toISOString() } as never)
    .eq("org_id", orgId)
    .in("status", ["active", "pending_payment", "suspended"] as never)
    .select("org_id")
    .maybeSingle() as unknown as Promise<{ data: { org_id: string } | null }>);
  const started = !!data;
  if (started) {
    await db.from("audit_log").insert({
      organization_id: orgId, actor_id: null, actor_name: "system:lifecycle",
      action: "billing.grace.started", category: "configuration", entity_type: "subscription", entity_id: orgId,
      summary: `billing.grace.started: grace_until ${graceUntil}`, metadata: { graceUntil, graceDays: 7 } as never,
    } as never).then(() => undefined, () => undefined);
    await notifyOrgBilling(orgId, "grace_started");
  }
  return { ok: true, started };
}

/**
 * 8.2 — Apply BILLING_RESTRICTED after the grace window expires. Atomic +
 * idempotent: flips grace_period → suspended ONLY when grace_until has passed
 * (a conditional update; a second call once already suspended, or before expiry,
 * matches 0 rows and is a no-op). NEVER deletes or touches office data — this is
 * purely a subscription-status transition that the canonical entitlement gate
 * (billing-access.ts) reads to block premium mutations while keeping all data
 * viewable. A verified payment reverses it via activation (grace_until cleared).
 */
export async function restrictAfterGraceWindow(orgId: string): Promise<{ ok: boolean; restricted: boolean }> {
  const db = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { data } = await (db.from("subscriptions" as never)
    .update({ status: "suspended", updated_at: nowIso } as never)
    .eq("org_id", orgId)
    .eq("status", "grace_period")
    .not("grace_until", "is", null)
    .lte("grace_until", nowIso)
    .select("org_id")
    .maybeSingle() as unknown as Promise<{ data: { org_id: string } | null }>);
  const restricted = !!data;
  if (restricted) {
    await db.from("audit_log").insert({
      organization_id: orgId, actor_id: null, actor_name: "system:lifecycle",
      action: "billing.restricted", category: "configuration", entity_type: "subscription", entity_id: orgId,
      summary: "billing.restricted: grace expired → suspended (data preserved, premium mutations blocked)", metadata: { at: nowIso } as never,
    } as never).then(() => undefined, () => undefined);
    await notifyOrgBilling(orgId, "restricted");
  }
  return { ok: true, restricted };
}

/**
 * Reconcile one org's billing lifecycle. Read-authoritative; the only writes are
 * TRIAL_EXPIRED and RECOVERY_AVAILABLE, both via the atomic transition RPC
 * (idempotent + concurrency-safe). Everything else is reported for the caller /
 * a provider-capable phase to act on.
 */
export async function reconcileBillingLifecycle(orgId: string): Promise<LifecycleReconcileResult> {
  const db = createServiceRoleClient();
  const { sub, decision, nowIso } = await readLifecycle(orgId);

  let executed = false;
  let pending: LifecycleReconcileResult["pending"] = null;

  // Commit ONLY the safe internal transitions (no provider dependency).
  if (sub && (decision.action === "TRIAL_EXPIRED" || decision.action === "RECOVERY_AVAILABLE") && decision.targetState) {
    const toLegacy = CANON_TO_LEGACY[decision.targetState];
    const fromLegacy = sub.status ?? "";
    if (toLegacy && fromLegacy && toLegacy !== fromLegacy) {
      const { data: changed } = await (db.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: number | null }>)(
        "transition_subscription_status",
        { p_org: orgId, p_from: fromLegacy, p_to: toLegacy, p_now: nowIso },
      );
      executed = (changed ?? 0) > 0;
      if (executed) {
        const action = decision.action === "TRIAL_EXPIRED" ? "billing.trial.expired" : "billing.payment.recovered";
        await db.from("audit_log").insert({
          organization_id: orgId, actor_id: null, actor_name: "system:lifecycle",
          action, category: "configuration", entity_type: "subscription", entity_id: orgId,
          summary: `${action}: ${fromLegacy}→${toLegacy}`, metadata: { from: fromLegacy, to: toLegacy } as never,
        } as never).then(() => undefined, () => undefined);
        // 8.2 — recovery from grace/suspended back to active → notify owners.
        if (decision.action === "RECOVERY_AVAILABLE" && (fromLegacy === "grace_period" || fromLegacy === "suspended")) {
          await notifyOrgBilling(orgId, "recovered");
        }
      }
    }
  } else if (decision.providerDependent && (decision.action === "PROVIDER_SYNC_PENDING" || decision.action === "QUANTITY_UPDATE_OWED" || decision.action === "CANCELLATION_OWED")) {
    // Provider-dependent → cannot complete without Grow. Never fake it.
    if (!process.env.GROW_CHECKOUT_URL) pending = "PENDING_SANDBOX_CREDENTIALS";
  }

  return { organizationId: orgId, ...decision, executed, pending, generatedAt: nowIso };
}

export type { LifecycleAction };
