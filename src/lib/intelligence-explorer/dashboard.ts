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
import type { IntelligenceDashboardDTO } from "./dashboard-shared";

// Public API preserved: type + pure helpers now live in the client-safe shared
// module (no "server-only"); re-exported here so existing imports keep working.
export type { IntelligenceDashboardDTO } from "./dashboard-shared";
export { countSince, topAreas } from "./dashboard-shared";

export async function getIntelligenceDashboard(): Promise<IntelligenceDashboardDTO> {
  const orgId = await currentSessionOrgId();
  const [explorer, overview, marketStats] = await Promise.all([
    getIntelligenceExplorer(),
    orgId ? getAgencyIntelligenceOverview(orgId).catch((e) => { console.error("[dashboard] overview failed:", e); return null; }) : Promise.resolve(null),
    externalListingRepository.marketStats().catch((e) => { console.error("[dashboard] marketStats failed:", e); return { priceDrops: 0, duplicateCandidates: 0 }; }),
  ]);
  return { explorer, overview, marketStats };
}
