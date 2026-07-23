// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — plan display (PURE).
// A thin, wizard-facing view over the existing @/lib/launch PLANS — monthly
// price + feature list per tier. No new pricing logic.
// ============================================================================
import { PLANS, PLAN_ORDER } from "@/lib/launch/plans";
import type { PlanTier } from "@/lib/launch/types";

const FEATURE_HE: Record<string, string> = {
  property_radar: "רדאר נכסים",
  buyer_matching: "התאמת קונים",
  seller_intelligence: "מודיעין מוכרים",
  ai_copilot: "קופיילוט AI",
  journey_automation: "אוטומציית מסעות",
  office_intelligence: "מודיעין משרד",
  executive_intelligence: "מודיעין ניהולי",
  competitor_intelligence: "מודיעין תחרותי",
  multi_agent: "ריבוי סוכנים",
  priority_support: "תמיכת פרימיום",
  platform_admin: "ניהול פלטפורמה",
};

export interface PlanCard {
  tier: PlanTier;
  label: string;
  monthlyIls: number | null;        // null = enterprise (contact us)
  seats: number;                    // -1 = unlimited
  features: { key: string; label: string }[];
  highlight: boolean;
}

export function planCards(): PlanCard[] {
  return PLAN_ORDER.map((tier) => {
    const p = PLANS[tier];
    return {
      tier,
      label: p.label,
      monthlyIls: p.priceHintIls,
      seats: p.limits.seats,
      features: p.features.map((k) => ({ key: k, label: FEATURE_HE[k] ?? k })),
      highlight: p.highlight === true,
    };
  });
}

export function planPriceIls(tier: PlanTier): number | null {
  return PLANS[tier].priceHintIls;
}

export const planLabel = (tier: PlanTier): string => PLANS[tier].label;
