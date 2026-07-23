// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — account overview (server, Part 6+3).
// Composes the org's subscription (lifecycle), license (from the launch plan),
// payment history, and first-login checklist for the self-service hub. All
// reads are RLS org-scoped — never another org's data.
// ============================================================================
import "server-only";
import { getOrgPlan } from "@/lib/launch/server/services";
import { getSubscription, listOrgPayments } from "./store";
import { licenseForPlan } from "./licenses";
import { getOnboardingChecklist } from "./checklist";
import type { License, OnboardingChecklist, Payment, PlanTier, Subscription } from "./types";

export interface AccountOverview {
  subscription: Subscription | null;
  license: License;
  planTier: PlanTier;
  subscriptionStatus: string;
  payments: Payment[];
  checklist: OnboardingChecklist;
}

export async function getAccountOverview(): Promise<AccountOverview> {
  const [sub, launchPlan, payments, checklist] = await Promise.all([
    getSubscription().catch(() => null),
    getOrgPlan().catch(() => null),
    listOrgPayments().catch(() => [] as Payment[]),
    getOnboardingChecklist().catch(() => ({ steps: [], completed: 0, total: 8, percentage: 0 } as OnboardingChecklist)),
  ]);
  const tier: PlanTier = sub?.planTier ?? (launchPlan?.plan as PlanTier | undefined) ?? "starter";
  return {
    subscription: sub,
    license: licenseForPlan(tier, sub?.growSubscriptionId ?? null),
    planTier: tier,
    subscriptionStatus: sub?.status ?? (launchPlan?.status ?? "active"),
    payments,
    checklist,
  };
}
