// ============================================================================
// ZONO — Competitor market-share ESTIMATION (pure). Share = competitor active
// listings in an area / total monitored active listings in that area. ALWAYS
// labeled an estimate based on collected public listings — never official.
// ============================================================================
import { pct } from "./analytics";
import type { MarketShareEstimate } from "./types";

export const SHARE_LABEL = "הערכה לפי מודעות פעילות שנאספו";

export interface MarketShareInput {
  competitorProfileId: string;
  competitorName: string;
  city: string | null;
  neighborhood: string | null;
  competitorActiveListings: number;
  totalMonitoredActiveListings: number;
}

function confidenceFor(monitored: number): MarketShareEstimate["confidence"] {
  if (monitored >= 50) return "high";
  if (monitored >= 15) return "medium";
  return "low";
}

/**
 * Estimate competitor market share per area. Never returns >100, never
 * fabricates a denominator. Sorted by share desc.
 */
export function calculateCompetitorMarketShare(rows: MarketShareInput[]): MarketShareEstimate[] {
  return rows
    .map((r) => ({
      competitorProfileId: r.competitorProfileId,
      competitorName: r.competitorName,
      city: r.city,
      neighborhood: r.neighborhood,
      competitorActiveListings: r.competitorActiveListings,
      totalMonitoredActiveListings: r.totalMonitoredActiveListings,
      estimatedSharePercent: Math.min(100, pct(r.competitorActiveListings, r.totalMonitoredActiveListings)),
      confidence: confidenceFor(r.totalMonitoredActiveListings),
      label: SHARE_LABEL,
    }))
    .sort((a, b) => b.estimatedSharePercent - a.estimatedSharePercent);
}

/** Our own office estimated share for a scope (same formula, labeled). */
export function ourMarketShare(ourActive: number, monitoredActive: number): { sharePercent: number; confidence: MarketShareEstimate["confidence"]; label: string } {
  return { sharePercent: Math.min(100, pct(ourActive, monitoredActive)), confidence: confidenceFor(monitoredActive), label: SHARE_LABEL };
}
