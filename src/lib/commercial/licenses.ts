// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — license model (PURE, Part 5).
//
// A license is a PROJECTION over the existing plan framework (@/lib/launch):
// max users (seats), enabled modules (entitlements), AI credits (monthly AI
// calls), storage, and a billing ref slot for future Grow/billing compatibility.
// No new limits engine — it reads PLANS. Deterministic.
// ============================================================================
import { PLANS, defaultLimits } from "@/lib/launch/plans";
import type { PlanTier } from "@/lib/launch/types";
import type { License } from "./types";

/** Storage allowance per tier (MB). -1 = unlimited. Kept here (not in the frozen
 *  launch limits) so it can grow without touching the plan framework. */
const STORAGE_MB: Record<PlanTier, number> = {
  starter: 512,
  professional: 5120,
  office: 25600,
  enterprise: -1,
};

/** Build the license for a plan tier — inherited from PLANS, never recomputed. */
export function licenseForPlan(tier: PlanTier, billingRef: string | null = null): License {
  const limits = defaultLimits(tier);
  return {
    planTier: tier,
    maxUsers: limits.seats,
    enabledModules: [...PLANS[tier].features],
    aiCredits: limits.aiCallsPerMonth,
    storageMb: STORAGE_MB[tier],
    billingRef,
  };
}

/** Does this license permit adding another user? (-1 seats = unlimited.) */
export function licenseAllowsUser(license: License, currentUsers: number): boolean {
  return license.maxUsers < 0 || currentUsers < license.maxUsers;
}

/** Is a module enabled by this license? */
export function licenseHasModule(license: License, moduleKey: string): boolean {
  return license.enabledModules.includes(moduleKey);
}
