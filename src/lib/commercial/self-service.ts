// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — self-service actions (server, Part 6).
//
// Owner-only account management. Every mutating action re-checks manager/owner
// role server-side (fail-closed) and writes through the service-role store; org
// isolation is inherited. Change-plan / cancel-renewal / reactivate operate on
// the org's OWN subscription only.
// ============================================================================
"use server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createLaunchRepository } from "@/lib/launch/server/repository";
import { defaultLimits } from "@/lib/launch/plans";
import { upsertSubscription } from "./store";
import { cancelGrowRecurring } from "./recurring";
import { createGrowCheckout } from "./checkout";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import type { PlanTier, Subscription } from "./types";

/** Downstream billing communication for a confirmed cancel-at-period-end (best-effort). */
async function emitCancelled(orgId: string): Promise<void> {
  await emitBusinessEvent({
    type: DOMAIN_EVENTS.billingSubscriptionCancelled, entityType: "billing", entityId: orgId, orgId,
    payload: { status: "cancelled" }, idempotencyKey: `billing.cancelled:${orgId}:${new Date().toISOString().slice(0, 10)}`,
  });
}

async function ownerContext(): Promise<{ orgId: string; userId: string } | null> {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id || !sc.user) return null;
  const db = await createClient();
  const { data } = await db.rpc("has_min_role", { p_min: "manager" });
  if (data !== true) return null;                    // fail closed
  return { orgId: sc.profile.org_id, userId: sc.user.id };
}

async function readSub(orgId: string): Promise<Subscription | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from("subscriptions" as never).select("*").eq("org_id", orgId).maybeSingle();
  if (!data) return null;
  const r = data as unknown as { org_id: string; plan_tier: string; status: string; cancel_at_period_end: boolean; period_start: string | null; period_end: string | null; trial_ends_at: string | null; grace_until: string | null; grow_subscription_id: string | null };
  return { orgId: r.org_id, planTier: r.plan_tier as PlanTier, status: r.status as Subscription["status"], periodStart: r.period_start, periodEnd: r.period_end, trialEndsAt: r.trial_ends_at, graceUntil: r.grace_until, growSubscriptionId: r.grow_subscription_id, cancelAtPeriodEnd: r.cancel_at_period_end };
}

/** Change the org's plan tier (updates license + subscription). A real
 *  upgrade/downgrade proration would run through Grow later; here it re-licenses. */
export async function changePlanAction(tier: PlanTier): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownerContext();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  await createLaunchRepository(createServiceRoleClient()).upsertPlan(ctx.orgId, tier, "active", defaultLimits(tier), ctx.userId);
  const sub = await readSub(ctx.orgId);
  await upsertSubscription({ orgId: ctx.orgId, planTier: tier, status: sub?.status === "active" ? "active" : "active", growSubscriptionId: sub?.growSubscriptionId ?? null });
  return { ok: true };
}

/** Cancel renewal — PROVIDER-FIRST. Stops the GROW recurring direct debit
 *  (updateDirectDebit changeStatus=2) BEFORE recording the local intent, so a
 *  cancelled subscription can never keep being charged. A real provider error is
 *  surfaced (never a fake success). When there is no live recurring instruction
 *  (trial/simulated/unconfigured), the local cancel-at-period-end is recorded. */
export async function cancelRenewalAction(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownerContext();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  const sub = await readSub(ctx.orgId);
  if (!sub) return { ok: false, error: "אין מנוי." };

  // Provider-first: cancel at GROW. cancelGrowRecurring itself marks
  // cancel_at_period_end ONLY after the provider acknowledges the cancellation.
  const res = await cancelGrowRecurring(ctx.orgId);
  if (res.ok) { await emitCancelled(ctx.orgId); return { ok: true }; }

  // No live provider instruction to stop (trial, simulated, or GROW unconfigured)
  // → safe to record the local cancel-at-period-end intent.
  if (res.reason === "NO_RECURRING_SUBSCRIPTION" || res.reason === "PENDING_SANDBOX_CREDENTIALS") {
    await upsertSubscription({ orgId: ctx.orgId, planTier: sub.planTier, status: sub.status, cancelAtPeriodEnd: true, growSubscriptionId: sub.growSubscriptionId });
    await emitCancelled(ctx.orgId);
    return { ok: true };
  }
  // A genuine provider error must NOT pretend the subscription was cancelled.
  return { ok: false, error: "ביטול מול ספק התשלומים נכשל. נסה שוב או פנה לתמיכה." };
}

/**
 * Reactivate after cancellation. A GROW recurring direct debit that was cancelled
 * (changeStatus=2) CANNOT be un-cancelled — the provider requires a NEW direct-debit
 * process. So we must NEVER locally flip a cancelled/expired subscription back to
 * active (that would grant paid access with no live provider instruction = access
 * without billing). Two safe cases:
 *   • cancel_at_period_end still pending (not yet ended) → UNDO the pending cancel.
 *   • genuinely cancelled/expired → require a fresh checkout (needsCheckout).
 */
export async function reactivateAction(): Promise<{ ok: boolean; error?: string; needsCheckout?: boolean; url?: string }> {
  const ctx = await ownerContext();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  const sub = await readSub(ctx.orgId);
  if (!sub) return { ok: false, error: "אין מנוי." };

  // Undo a not-yet-effective cancellation (subscription still active this period).
  if (sub.status === "active" && sub.cancelAtPeriodEnd) {
    await upsertSubscription({ orgId: ctx.orgId, planTier: sub.planTier, status: "active", cancelAtPeriodEnd: false, growSubscriptionId: sub.growSubscriptionId });
    return { ok: true };
  }

  // Genuinely cancelled/expired: a cancelled GROW direct debit CANNOT be un-cancelled.
  // Start a FRESH checkout — activation happens ONLY via the verified webhook, never
  // locally. Return the hosted checkout URL for the UI to redirect to.
  const co = await createGrowCheckout(ctx.orgId);
  if (co.ok) return { ok: false, needsCheckout: true, url: co.url };
  return { ok: false, needsCheckout: true, error: co.reason === "NOT_CONFIGURED" ? "טרם הוגדר ספק תשלומים. פנה לתמיכה." : "לא ניתן להפעיל מחדש כרגע. נסה שוב או פנה לתמיכה." };
}
