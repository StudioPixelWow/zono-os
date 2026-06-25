// ============================================================================
// ZONO — Area trend + heat scoring (pure, deterministic). Identifies which
// areas are heating up from competitor + market activity already collected.
// ============================================================================
import { clamp } from "./analytics";
import type { AreaTrend, Trend } from "./types";

export interface AreaTrendInput {
  city: string | null;
  neighborhood: string | null;
  activeListings: number;
  newListings: number;       // this week
  priceDrops: number;        // this week
  competitorsActive: number;
  prevWeekActiveListings: number | null;
}

/**
 * Heat score 0..100 — deterministic blend of new supply, churn and competitor
 * density. Higher = more activity (an area "heating up").
 */
export function scoreAreaTrend(i: AreaTrendInput): AreaTrend {
  const newScore = clamp(i.newListings * 8, 0, 45);
  const dropScore = clamp(i.priceDrops * 6, 0, 25);
  const densityScore = clamp(i.competitorsActive * 6, 0, 20);
  const volumeScore = clamp(i.activeListings, 0, 10);
  const heatScore = Math.round(clamp(newScore + dropScore + densityScore + volumeScore, 0, 100));

  let trend: Trend = "stable";
  if (i.prevWeekActiveListings != null && i.prevWeekActiveListings > 0) {
    const delta = (i.activeListings - i.prevWeekActiveListings) / i.prevWeekActiveListings;
    trend = delta > 0.1 ? "up" : delta < -0.1 ? "down" : "stable";
  } else if (i.newListings > i.activeListings * 0.3) {
    trend = "up";
  }

  return {
    city: i.city, neighborhood: i.neighborhood,
    activeListings: i.activeListings, newListings: i.newListings, priceDrops: i.priceDrops,
    competitorsActive: i.competitorsActive, trend, heatScore,
  };
}

/** Rank areas by heat (desc), stable by area label. */
export function rankAreaTrends(rows: AreaTrendInput[]): AreaTrend[] {
  return rows
    .map(scoreAreaTrend)
    .sort((a, b) => b.heatScore - a.heatScore || `${a.city}${a.neighborhood}`.localeCompare(`${b.city}${b.neighborhood}`));
}
