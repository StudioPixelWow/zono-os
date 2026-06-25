// ============================================================================
// ZONO — Executive forecast (pure, deterministic). Extends the Office
// Intelligence deterministic forecast with listings / buyer demand / seller
// activity / market activity. Always exposes labeled assumptions; never
// fabricates certainty.
// ============================================================================
import { clamp, round } from "./analytics";
import type { ExecForecast } from "./types";

export interface ExecForecastInput {
  // From the Office Intelligence deterministic forecast:
  likelyExclusives: number;
  likelyDeals: number;
  likelyMeetings: number;
  pipelineValue: number;
  estimatedCommission: number;
  officeConfidencePct: number;
  baseAssumptions: string[];
  // Extra current aggregates (deterministic engine outputs):
  newListingsThisWeek: number;
  sellerOpportunities: number;
  buyerMatchesToday: number;
  monitoredListings: number;
  marketEventsToday: number;
}

export function forecastExecutive(i: ExecForecastInput): ExecForecast {
  const assumptions = [...i.baseAssumptions];

  // Listings forecast ≈ weekly new listings projected to a month (×4), capped.
  const listings = Math.round(clamp(i.newListingsThisWeek * 4, 0, 100000));
  if (i.newListingsThisWeek > 0) assumptions.push("צפי נכסים מבוסס על קצב נכסים חדשים שבועי × 4.");

  // Buyer demand ≈ today's matches projected to a month.
  const buyerDemand = Math.round(clamp(i.buyerMatchesToday * 30, 0, 1000000));
  // Seller activity ≈ open seller opportunities (a real backlog, not projected).
  const sellerActivity = Math.round(clamp(i.sellerOpportunities, 0, 1000000));
  // Market activity ≈ today's market events projected to a month.
  const marketActivity = Math.round(clamp(i.marketEventsToday * 30, 0, 1000000));
  if (i.monitoredListings > 0) assumptions.push(`פעילות שוק נגזרת מ‑${i.monitoredListings} מודעות במעקב.`);

  return {
    listings,
    meetings: Math.round(i.likelyMeetings),
    exclusives: Math.round(i.likelyExclusives),
    deals: Math.round(i.likelyDeals),
    revenue: Math.round(i.pipelineValue),
    commission: Math.round(i.estimatedCommission),
    buyerDemand,
    sellerActivity,
    marketActivity,
    confidencePct: round(clamp(i.officeConfidencePct, 25, 90), 0),
    assumptions,
  };
}
