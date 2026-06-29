// ============================================================================
// ZONO — Intelligence Dashboard shared types + PURE presentation helpers.
// Client-safe: NO "server-only" import. Only type-only imports (erased at build)
// from server modules. This lets client views import countSince/topAreas/types
// without pulling the server-only data layer (dashboard.ts) into the bundle.
// Nothing here is recomputed — plain counts/rankings over already-fetched rows.
// ============================================================================
import type { IntelligenceExplorerDTO } from "./types";
import type { AgencyIntelligenceOverviewDTO } from "@/lib/agencies/api/agencyIntelligenceApiTypes";

export interface IntelligenceDashboardDTO {
  explorer: IntelligenceExplorerDTO;
  overview: AgencyIntelligenceOverviewDTO | null;
  marketStats: { priceDrops: number; duplicateCandidates: number };
}

const DAY = 86_400_000;
export function countSince(listings: { firstSeenAt: string | null }[], days: number): number {
  const cut = Date.now() - days * DAY;
  return listings.filter((l) => l.firstSeenAt && new Date(l.firstSeenAt).getTime() >= cut).length;
}

/** Top areas by current listing volume (plain ranking — not a growth calc). */
export function topAreas(explorer: IntelligenceExplorerDTO, limit = 6) {
  const neighborhoods = explorer.neighborhoods.slice(0, limit);
  const cityMap = new Map<string, number>();
  for (const l of explorer.listings) { if (!l.city) continue; cityMap.set(l.city, (cityMap.get(l.city) ?? 0) + 1); }
  const cities = [...cityMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([city, listings]) => ({ city, listings }));
  return { neighborhoods, cities };
}
