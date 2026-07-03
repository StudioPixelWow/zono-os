// ============================================================================
// 🌍 Area Portal — view-model assembler (pure). 32.5.
// Builds City / Neighborhood / Street views from the normalized public AreaData.
// Public-safe, evidence-only. No engine logic duplicated (metrics arrive computed).
// ============================================================================
import { areaSummary, buildInsights, cityOpportunities, cityRecommendation } from "./content";
import type { AreaData, CityView, NeighborhoodView, StreetView, AreaInsight } from "./types";

export function buildCityView(d: AreaData): CityView {
  const insights = buildInsights(d);
  return {
    city: d.city, overview: areaSummary(d), market: d.market,
    topNeighborhoods: [...d.neighborhoods].sort((a, b) => (b.transactions + b.inventory) - (a.transactions + a.inventory)).slice(0, 8),
    opportunities: cityOpportunities(d),
    featured: d.listings.slice(0, 8), offices: d.offices.slice(0, 6), brokers: d.brokers.slice(0, 6),
    recommendation: cityRecommendation(d),
    insights: insights.filter((i) => i.kind !== "summary"),
    population: d.population,
  };
}

export function buildNeighborhoodView(d: AreaData): NeighborhoodView {
  const typeCounts = new Map<string, number>();
  for (const l of d.listings) { const t = l.type ?? "אחר"; typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1); }
  const topTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => ({ type, count }));
  return {
    city: d.city, neighborhood: d.neighborhood ?? d.city, summary: areaSummary(d), market: d.market,
    featured: d.listings.slice(0, 12), transactions: d.transactions.slice(0, 12),
    offices: d.offices.slice(0, 8), brokers: d.brokers.slice(0, 8),
    insights: buildInsights(d), topTypes,
  };
}

export function buildStreetView(d: AreaData): StreetView {
  return {
    city: d.city, neighborhood: d.neighborhood, street: d.street ?? "", summary: areaSummary(d),
    market: d.market, transactions: d.transactions.slice(0, 12), featured: d.listings.slice(0, 8), brokers: d.brokers.slice(0, 6),
  };
}

/** Only the AI insights (for the /insights sub-route). */
export function neighborhoodInsights(d: AreaData): AreaInsight[] { return buildInsights(d); }
