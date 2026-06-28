// ============================================================================
// ZONO — Intelligence Dashboards™ data (server-only). Presentation only.
// ----------------------------------------------------------------------------
// Composes EXISTING reads into one dashboard payload: the Explorer projection
// (brokers/offices/neighborhoods/listings/opportunities) + the agency overview
// counts + market stats. Nothing is recomputed — momentum windows and hot-area
// rankings are plain counts over already-fetched rows. Absent values stay null/
// 0-as-real; the UI shows "—" for unknowns.
// ============================================================================
import "server-only";
import { getIntelligenceExplorer } from "./service";
import { getAgencyIntelligenceOverview } from "@/lib/agencies/api/agencyIntelligenceApi";
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import { externalListingRepository } from "@/lib/external-listings/repository";
import type { IntelligenceExplorerDTO } from "./types";
import type { AgencyIntelligenceOverviewDTO } from "@/lib/agencies/api/agencyIntelligenceApiTypes";

export interface IntelligenceDashboardDTO {
  explorer: IntelligenceExplorerDTO;
  overview: AgencyIntelligenceOverviewDTO | null;
  marketStats: { priceDrops: number; duplicateCandidates: number };
}

export async function getIntelligenceDashboard(): Promise<IntelligenceDashboardDTO> {
  const orgId = await currentSessionOrgId();
  const [explorer, overview, marketStats] = await Promise.all([
    getIntelligenceExplorer(),
    orgId ? getAgencyIntelligenceOverview(orgId).catch((e) => { console.error("[dashboard] overview failed:", e); return null; }) : Promise.resolve(null),
    externalListingRepository.marketStats().catch((e) => { console.error("[dashboard] marketStats failed:", e); return { priceDrops: 0, duplicateCandidates: 0 }; }),
  ]);
  return { explorer, overview, marketStats };
}

// ── Pure presentation helpers (counts over already-fetched rows; no recompute) ─
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
