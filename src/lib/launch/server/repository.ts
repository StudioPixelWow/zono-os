// ============================================================================
// ZONO — launch repository (server-only). CRUD for the Phase 21 tables. Strictly
// org-scoped; service-role client. Pure persistence + row→DTO mapping.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  BetaEnrollment, FeedbackContext, FeedbackType, OnboardingProgress, OrgPlan, PlanLimits,
  PlanStatus, PlanTier, UsageCategory,
} from "../types";

type Db = ReturnType<typeof createServiceRoleClient>;

export function createLaunchRepository(db: Db) {
  return {
    // ── Beta ──────────────────────────────────────────────────────────────────
    async listBeta(orgId: string): Promise<BetaEnrollment[]> {
      const { data } = await db.from("beta_enrollments" as never).select("org_id,user_id,enabled,channel,note").eq("org_id", orgId);
      return ((data ?? []) as { org_id: string; user_id: string | null; enabled: boolean; channel: string; note: string | null }[])
        .map((r) => ({ orgId: r.org_id, userId: r.user_id, enabled: r.enabled, channel: r.channel, note: r.note }));
    },
    async upsertBeta(orgId: string, userId: string | null, enabled: boolean, updatedBy: string, channel = "beta"): Promise<void> {
      await db.from("beta_enrollments" as never).upsert(
        { org_id: orgId, user_id: userId, enabled, channel, updated_by: updatedBy } as never,
        { onConflict: "org_id,user_id" },
      );
    },

    // ── Feedback ───────────────────────────────────────────────────────────────
    async insertFeedback(input: {
      orgId: string; userId: string; type: FeedbackType; title: string; body: string; severity?: string | null;
      page: string; context: FeedbackContext; correlationId: string;
    }): Promise<string | null> {
      const { data } = await db.from("user_feedback" as never).insert({
        org_id: input.orgId, user_id: input.userId, feedback_type: input.type, title: input.title, body: input.body,
        severity: input.severity ?? null, page: input.page, context: input.context, correlation_id: input.correlationId,
      } as never).select("id").maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    },
    async listFeedback(orgId: string, limit = 100): Promise<Record<string, unknown>[]> {
      const { data } = await db.from("user_feedback" as never).select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
      return (data ?? []) as unknown as Record<string, unknown>[];
    },
    async setFeedbackStatus(orgId: string, id: string, status: string): Promise<void> {
      await db.from("user_feedback" as never).update({ status } as never).eq("org_id", orgId).eq("id", id);
    },

    // ── Onboarding ─────────────────────────────────────────────────────────────
    async getOnboarding(orgId: string): Promise<OnboardingProgress | null> {
      const { data } = await db.from("onboarding_progress" as never).select("steps,dismissed,completed_at").eq("org_id", orgId).maybeSingle();
      if (!data) return null;
      const r = data as { steps: Record<string, string>; dismissed: boolean; completed_at: string | null };
      return { steps: r.steps ?? {}, dismissed: r.dismissed, completedAt: r.completed_at };
    },
    async saveOnboarding(orgId: string, progress: OnboardingProgress): Promise<void> {
      await db.from("onboarding_progress" as never).upsert(
        { org_id: orgId, steps: progress.steps, dismissed: progress.dismissed, completed_at: progress.completedAt } as never,
        { onConflict: "org_id" },
      );
    },
    /** Best-effort existence counts used to auto-detect onboarding steps. */
    async count(table: string, orgColumn: string, orgId: string): Promise<number> {
      try {
        const { count } = await db.from(table as never).select("*", { count: "exact", head: true }).eq(orgColumn, orgId);
        return count ?? 0;
      } catch { return 0; }
    },

    // ── Usage ──────────────────────────────────────────────────────────────────
    async insertUsage(input: { orgId: string; userId: string | null; category: UsageCategory; name: string; roleKey: string | null; props: Record<string, unknown> }): Promise<void> {
      await db.from("usage_events" as never).insert({
        org_id: input.orgId, user_id: input.userId, category: input.category, name: input.name, role_key: input.roleKey, props: input.props,
      } as never);
    },
    async usageSince(orgId: string, sinceIso: string, limit = 5000): Promise<{ category: string; name: string; occurred_at: string }[]> {
      const { data } = await db.from("usage_events" as never).select("category,name,occurred_at").eq("org_id", orgId).gte("occurred_at", sinceIso).order("occurred_at", { ascending: false }).limit(limit);
      return (data ?? []) as never;
    },

    // ── Plan ───────────────────────────────────────────────────────────────────
    async getPlan(orgId: string): Promise<OrgPlan | null> {
      const { data } = await db.from("org_plans" as never).select("plan,status,trial_ends_at,limits,stripe_customer_id,stripe_subscription_id,current_period_end").eq("org_id", orgId).maybeSingle();
      if (!data) return null;
      const r = data as { plan: PlanTier; status: PlanStatus; trial_ends_at: string | null; limits: PlanLimits; stripe_customer_id: string | null; stripe_subscription_id: string | null; current_period_end: string | null };
      return { plan: r.plan, status: r.status, trialEndsAt: r.trial_ends_at, limits: r.limits, stripeCustomerId: r.stripe_customer_id, stripeSubscriptionId: r.stripe_subscription_id, currentPeriodEnd: r.current_period_end };
    },
    async upsertPlan(orgId: string, plan: PlanTier, status: PlanStatus, limits: PlanLimits, updatedBy: string): Promise<void> {
      await db.from("org_plans" as never).upsert(
        { org_id: orgId, plan, status, limits, updated_by: updatedBy } as never,
        { onConflict: "org_id" },
      );
    },

    // ── Impersonation audit ─────────────────────────────────────────────────────
    async startImpersonation(input: { orgId: string; adminUserId: string; targetUserId: string; reason: string | null; correlationId: string }): Promise<string | null> {
      const { data } = await db.from("support_impersonation_log" as never).insert({
        org_id: input.orgId, admin_user_id: input.adminUserId, target_user_id: input.targetUserId, reason: input.reason, read_only: true, correlation_id: input.correlationId,
      } as never).select("id").maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    },
    async endImpersonation(orgId: string, id: string): Promise<void> {
      await db.from("support_impersonation_log" as never).update({ ended_at: new Date().toISOString() } as never).eq("org_id", orgId).eq("id", id);
    },
    async listImpersonation(orgId: string, limit = 50): Promise<Record<string, unknown>[]> {
      const { data } = await db.from("support_impersonation_log" as never).select("*").eq("org_id", orgId).order("started_at", { ascending: false }).limit(limit);
      return (data ?? []) as unknown as Record<string, unknown>[];
    },
  };
}

export type LaunchRepository = ReturnType<typeof createLaunchRepository>;
