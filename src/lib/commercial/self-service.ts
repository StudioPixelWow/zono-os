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
import { canTransition } from "./subscriptions";
import type { PlanTier, Subscription } from "./types";

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

/** Cancel at period end — keeps access until the period closes. */
export async function cancelRenewalAction(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownerContext();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  const sub = await readSub(ctx.orgId);
  if (!sub) return { ok: false, error: "אין מנוי." };
  await upsertSubscription({ orgId: ctx.orgId, planTier: sub.planTier, status: sub.status, cancelAtPeriodEnd: true, growSubscriptionId: sub.growSubscriptionId });
  return { ok: true };
}

/** Reactivate a cancelled/expired subscription (a fresh payment would re-verify). */
export async function reactivateAction(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownerContext();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  const sub = await readSub(ctx.orgId);
  if (!sub) return { ok: false, error: "אין מנוי." };
  if (!canTransition(sub.status, "active")) return { ok: false, error: "לא ניתן להפעיל מחדש מהמצב הנוכחי." };
  await upsertSubscription({ orgId: ctx.orgId, planTier: sub.planTier, status: "active", cancelAtPeriodEnd: false, growSubscriptionId: sub.growSubscriptionId });
  return { ok: true };
}
