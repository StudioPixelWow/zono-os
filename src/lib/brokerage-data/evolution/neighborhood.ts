// ============================================================================
// ZONO Brokerage Evolution — Neighborhood Dominance + Market DNA (pure).
// Turns each neighborhood/city into an intelligence entity: leaders,
// concentration (HHI), competition level, share, trends. Deterministic.
// ============================================================================
import type { NeighborhoodInput, NeighborhoodDominance, CompetitionLevel, MarketDnaInput, MarketDNA } from "./types";

/** Herfindahl–Hirschman concentration (0..1) over a share distribution. */
export function hhi(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return Math.round(counts.reduce((a, c) => a + Math.pow(c / total, 2), 0) * 1000) / 1000;
}

function competitionFromHHI(h: number, players: number): CompetitionLevel {
  if (players <= 1) return "low";
  if (h >= 0.4) return "low";      // one dominant player → low competition
  if (h >= 0.2) return "medium";
  return "high";                    // fragmented → high competition
}

export function computeNeighborhoodDominance(input: NeighborhoodInput): NeighborhoodDominance {
  const officeCounts = input.offices.map((o) => o.listings);
  const concentration = hhi(officeCounts);
  const leadOffice = input.offices.slice().sort((a, b) => b.listings - a.listings)[0] ?? null;
  const leadAgent = input.agents.slice().sort((a, b) => b.listings - a.listings)[0] ?? null;
  const total = Math.max(1, input.totalListings);
  const marketShare = leadOffice ? Math.round((leadOffice.listings / total) * 1000) / 10 : 0;
  const competitionLevel = competitionFromHHI(concentration, input.offices.length);
  // coverage: how much of the neighborhood's listing volume is attributed to known offices.
  const attributed = officeCounts.reduce((a, b) => a + b, 0);
  const coveragePct = Math.round((attributed / total) * 100);
  const confidence = Math.round(Math.max(20, Math.min(95, 30 + Math.min(50, input.totalListings * 1.5) + (input.offices.length ? 10 : 0))));
  return {
    leadingOfficeId: leadOffice?.id ?? null, leadingAgentId: leadAgent?.id ?? null,
    listingVolume: input.totalListings, avgPrice: input.avgPrice, competitionLevel,
    concentration, marketShare, coveragePct: Math.min(100, coveragePct), growth: input.activityTrend, confidence,
  };
}

const CAT_HE: Record<string, string> = { residential: "מגורים", commercial: "מסחרי", land: "קרקע", project: "פרויקטים" };

export function computeMarketDNA(input: MarketDnaInput): MarketDNA {
  const competitionIntensity = Math.round((1 - hhi(input.officeShares)) * 100); // fragmented → intense
  const topCat = Object.entries(input.categoryShares).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "residential";
  return {
    dominantOfficeCategory: input.luxuryPct >= 35 ? "יוקרה" : input.developerPct >= 25 ? "פרויקטים" : "כללי",
    dominantPropertyCategory: CAT_HE[topCat] ?? topCat,
    competitionIntensity, growthTrend: input.growthTrend, luxuryConcentration: input.luxuryPct,
    developerConcentration: input.developerPct, officeDensity: input.offices, agentDensity: input.agents,
    volatility: input.volatility, avgConfidence: input.avgConfidence,
  };
}
