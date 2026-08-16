// ============================================================================
// ZONO — Property Marketing Health (P9.8 §Q). PURE, deterministic, explainable.
// A 0–100 score computed from REAL distribution signals with an explicit weighted
// formula — no AI certainty, no fabricated numbers. Every point is attributable to
// a listed factor, and each factor states WHY it did or didn't contribute.
// ============================================================================
export interface MarketingHealthSignals {
  hasApprovedCreative: boolean;
  activeGroups: number;            // groups in ACTIVE state assigned to the org
  futureScheduledPosts: number;    // distribution_posts scheduled ahead (a plan exists)
  daysSinceLastPublication: number | null; // null = never published
  facebookLeads: number;           // leads attributed to facebook for this property
}

export interface HealthFactor { ok: boolean; weight: number; earned: number; label: string }
export interface MarketingHealth { score: number; factors: HealthFactor[] }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Weights (sum 100): approved creative 25 · active groups 20 (scaled to 10 groups) ·
 * distribution plan 20 · recency 20 (≤7d full, ≤14d half) · facebook leads 15
 * (scaled to 5). Deterministic and testable.
 */
export function computeMarketingHealth(s: MarketingHealthSignals): MarketingHealth {
  const creative = s.hasApprovedCreative ? 25 : 0;
  const groups = Math.round(clamp(s.activeGroups, 0, 10) / 10 * 20);
  const plan = s.futureScheduledPosts > 0 ? 20 : 0;
  const recency = s.daysSinceLastPublication == null ? 0
    : s.daysSinceLastPublication <= 7 ? 20
      : s.daysSinceLastPublication <= 14 ? 10 : 0;
  const leads = Math.round(clamp(s.facebookLeads, 0, 5) / 5 * 15);

  const factors: HealthFactor[] = [
    { ok: creative > 0, weight: 25, earned: creative, label: s.hasApprovedCreative ? "קריאייטיב מאושר קיים" : "אין קריאייטיב מאושר" },
    { ok: groups >= 10, weight: 20, earned: groups, label: s.activeGroups > 0 ? `${s.activeGroups} קבוצות פעילות` : "אין קבוצות פעילות" },
    { ok: plan > 0, weight: 20, earned: plan, label: s.futureScheduledPosts > 0 ? `תוכנית הפצה (${s.futureScheduledPosts} פרסומים מתוזמנים)` : "אין תוכנית הפצה עתידית" },
    { ok: recency === 20, weight: 20, earned: recency, label: s.daysSinceLastPublication == null ? "טרם פורסם" : `פורסם לפני ${s.daysSinceLastPublication} ימים` },
    { ok: leads > 0, weight: 15, earned: leads, label: s.facebookLeads > 0 ? `${s.facebookLeads} לידים מפייסבוק` : "אין עדיין לידים מפייסבוק" },
  ];
  const score = clamp(creative + groups + plan + recency + leads, 0, 100);
  return { score, factors };
}
