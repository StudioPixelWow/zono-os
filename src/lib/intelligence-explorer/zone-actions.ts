"use server";
// ============================================================================
// ZONO — Zone Explorer action (presentation only). Reads the EXISTING territory
// intelligence for a selected zone on demand. No recompute.
// ============================================================================
import { getTerritoryIntelligence } from "@/lib/agencies/api/agencyIntelligenceApi";
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import type { TerritoryIntelligenceDTO } from "@/lib/agencies/api/agencyIntelligenceApiTypes";

export async function getZoneIntelligenceAction(city: string | null, neighborhood: string | null): Promise<TerritoryIntelligenceDTO | null> {
  try {
    const orgId = await currentSessionOrgId();
    if (!orgId) return null;
    return await getTerritoryIntelligence(orgId, { city, neighborhood });
  } catch (e) {
    console.error("[zone-explorer] load failed:", e);
    return null;
  }
}
