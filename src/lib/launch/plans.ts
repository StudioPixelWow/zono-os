// ============================================================================
// ZONO — plan/license framework (pure). Four tiers with deterministic
// entitlements + soft limits. Feature gating routes THROUGH the existing
// feature-flags layer (Phase 20): a plan grants entitlement keys; a flag can
// still override per org/role/user. No billing here — Stripe is wired later.
// ============================================================================
import type { PlanDefinition, PlanLimits, PlanTier } from "./types";
import { STANDARD_SEAT_PRICE_ILS } from "./types";

const UNLIMITED = -1;

// Entitlement keys (stable identifiers). These mirror module/feature names and
// are checked via `planAllows` + feature flags — never hard-coded into engines.
export const ENTITLEMENTS = {
  PROPERTY_RADAR: "property_radar",
  BUYER_MATCHING: "buyer_matching",
  SELLER_INTELLIGENCE: "seller_intelligence",
  AI_COPILOT: "ai_copilot",
  JOURNEY_AUTOMATION: "journey_automation",
  OFFICE_INTELLIGENCE: "office_intelligence",
  EXECUTIVE_INTELLIGENCE: "executive_intelligence",
  COMPETITOR_INTELLIGENCE: "competitor_intelligence",
  MULTI_AGENT: "multi_agent",
  PRIORITY_SUPPORT: "priority_support",
  PLATFORM_ADMIN: "platform_admin",
} as const;
export type EntitlementKey = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

// FLAT MODEL: ALL features open on BOTH plans (no feature gating by tier). The
// ONLY difference is pricing/packaging: standard = 197 ₪/agent (self-serve),
// enterprise = custom (contact). Limits are unlimited — the product is not
// feature-limited; billing is per active agent (seat), handled outside PLANS.
const ALL_FEATURES = Object.values(ENTITLEMENTS);
const UNLIMITED_LIMITS: PlanLimits = { seats: UNLIMITED, operatingAreas: UNLIMITED, monitoredListings: UNLIMITED, aiCallsPerMonth: UNLIMITED, syncsPerDay: UNLIMITED };

export const PLANS: Record<PlanTier, PlanDefinition> = {
  standard: {
    tier: "standard", label: "ZONO לסוכני נדל״ן", priceHintIls: STANDARD_SEAT_PRICE_ILS, highlight: true,
    limits: { ...UNLIMITED_LIMITS },
    features: [...ALL_FEATURES],
  },
  enterprise: {
    tier: "enterprise", label: "ZONO למשרדים", priceHintIls: null,
    limits: { ...UNLIMITED_LIMITS },
    features: [...ALL_FEATURES],
  },
};

export const PLAN_ORDER: PlanTier[] = ["standard", "enterprise"];

export function planDefinition(tier: PlanTier): PlanDefinition { return PLANS[tier]; }

export function defaultLimits(tier: PlanTier): PlanLimits { return { ...PLANS[tier].limits }; }

/** Does the plan include an entitlement? (Feature flags may still gate further.) */
export function planAllows(tier: PlanTier, key: EntitlementKey): boolean {
  return PLANS[tier].features.includes(key);
}

/** Suggested upgrade tier that unlocks `key`, or null if already available / none. */
export function upgradeFor(tier: PlanTier, key: EntitlementKey): PlanTier | null {
  if (planAllows(tier, key)) return null;
  const from = PLAN_ORDER.indexOf(tier);
  for (let i = from + 1; i < PLAN_ORDER.length; i++) {
    if (planAllows(PLAN_ORDER[i]!, key)) return PLAN_ORDER[i]!;
  }
  return null;
}

export interface LimitCheck { withinLimit: boolean; limit: number; used: number; remaining: number; unlimited: boolean }

/** Deterministic soft-limit check. limit === -1 means unlimited. */
export function checkLimit(limit: number, used: number): LimitCheck {
  if (limit < 0) return { withinLimit: true, limit, used, remaining: UNLIMITED, unlimited: true };
  const remaining = Math.max(0, limit - used);
  return { withinLimit: used < limit, limit, used, remaining, unlimited: false };
}
