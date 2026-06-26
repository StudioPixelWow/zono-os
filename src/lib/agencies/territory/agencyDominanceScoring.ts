// ============================================================================
// ZONO — Agency dominance + momentum scoring (Phase 26.4, PURE, client-safe).
// Deterministic. No IO. Missing data reduces CONFIDENCE, not the raw score:
// dominance is computed only over the sub-scores that have data, with weights
// renormalized, so absent signals never silently drag the score to 0.
// ============================================================================
import type { TerritoryPreviousPeriod, TerritoryTrend } from "./agencyTerritoryTypes";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Dominance sub-score weights (sum = 1.00) — mirrors the product spec.
export const DOMINANCE_WEIGHTS = {
  inventoryShare: 0.30,
  salesShare: 0.25,
  listingVelocity: 0.15,
  salesVelocity: 0.10,
  luxuryShare: 0.05,
  exclusiveShare: 0.05,
  momentum: 0.10,
} as const;

/** Saturating normalizer: a raw rate → 0..1 (k = the rate that maps to 0.5). */
export function saturate(value: number | null, k: number): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return Math.round((value / (value + k)) * 1000) / 1000;
}

export interface DominanceComponents {
  inventoryShare: number | null;   // 0..1
  salesShare: number | null;       // 0..1
  listingVelocity: number | null;  // listings/period (raw rate)
  salesVelocity: number | null;    // sales/period (raw rate)
  luxuryShare: number | null;      // 0..1
  exclusiveShare: number | null;   // 0..1
  momentumScore: number | null;    // 0..100
}

/**
 * Weighted dominance score (0..100) over the AVAILABLE components only. Returns
 * null when no component has data. Velocities are saturated to 0..1 first.
 */
export function scoreDominance(c: DominanceComponents): number | null {
  const parts: Array<{ w: number; v: number }> = [];
  const push = (w: number, v: number | null) => { if (v != null && Number.isFinite(v)) parts.push({ w, v: clamp(v, 0, 1) }); };

  push(DOMINANCE_WEIGHTS.inventoryShare, c.inventoryShare);
  push(DOMINANCE_WEIGHTS.salesShare, c.salesShare);
  push(DOMINANCE_WEIGHTS.listingVelocity, saturate(c.listingVelocity, 5));
  push(DOMINANCE_WEIGHTS.salesVelocity, saturate(c.salesVelocity, 3));
  push(DOMINANCE_WEIGHTS.luxuryShare, c.luxuryShare);
  push(DOMINANCE_WEIGHTS.exclusiveShare, c.exclusiveShare);
  push(DOMINANCE_WEIGHTS.momentum, c.momentumScore == null ? null : c.momentumScore / 100);

  if (parts.length === 0) return null;
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const score = parts.reduce((s, p) => s + p.w * p.v, 0) / wsum;
  return Math.round(score * 1000) / 10; // 0..100, one decimal
}

export interface MomentumResult {
  momentumScore: number | null; // 0..100 (50 = stable)
  trend: TerritoryTrend;
}

/**
 * Momentum from current vs previous period. Combines new-listing growth, sales
 * growth, active-inventory growth and price-drop trend. Centered at 50 (stable).
 * Unknown when there is no previous period to compare against.
 */
export function scoreMomentum(
  current: { newListings: number; sold: number; activeInventory: number; priceDrops?: number | null },
  previous: TerritoryPreviousPeriod | null,
): MomentumResult {
  if (!previous) return { momentumScore: null, trend: "unknown" };

  const growth = (cur: number, prev: number) => clamp((cur - prev) / Math.max(prev, 1), -1, 1);
  const signals: number[] = [
    growth(current.newListings, previous.newListings),
    growth(current.sold, previous.sold),
    growth(current.activeInventory, previous.activeInventory),
  ];
  // Rising price drops are a negative momentum signal (best-effort; optional).
  if (current.priceDrops != null) signals.push(current.priceDrops > 0 ? -clamp(current.priceDrops / 5, 0, 1) : 0);

  const avg = signals.reduce((a, b) => a + b, 0) / signals.length;
  const momentumScore = Math.round(clamp(50 + 50 * avg, 0, 100) * 10) / 10;
  const trend: TerritoryTrend = momentumScore > 60 ? "growing" : momentumScore < 40 ? "declining" : "stable";
  return { momentumScore, trend };
}

/**
 * Data-completeness confidence (0..1). Reflects how much real evidence backed the
 * calculation — NOT the dominance level. Low data ⇒ low confidence (the raw
 * dominance score is preserved).
 */
export function scoreConfidence(input: {
  listingCount: number;
  hasTotals: boolean;
  hasPrevious: boolean;
  pricedCount: number;
  datedCount: number;
}): number {
  let c = 0;
  c += clamp(input.listingCount / 8, 0, 1) * 0.4; // breadth of agency evidence
  c += input.hasTotals ? 0.25 : 0;                // territory denominators known
  c += input.hasPrevious ? 0.15 : 0;              // momentum comparable
  c += clamp(input.pricedCount / 5, 0, 1) * 0.1;  // priced evidence for avgs
  c += clamp(input.datedCount / 5, 0, 1) * 0.1;   // dated evidence for velocity/DOM
  return Math.round(clamp(c, 0, 1) * 1000) / 1000;
}
