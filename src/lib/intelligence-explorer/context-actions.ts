"use server";
// ============================================================================
// ZONO — Intelligence Everywhere™ context action (presentation only).
// Returns the EXISTING intelligence around an entity's location (territory +
// nearby opportunities/listings) so any screen can surface it inline. Reuses
// existing repositories; computes nothing new (nearby = filtered existing rows).
// ============================================================================
import { getTerritoryIntelligence } from "@/lib/agencies/api/agencyIntelligenceApi";
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import { externalListingRepository } from "@/lib/external-listings/repository";
import type { TerritoryIntelligenceDTO } from "@/lib/agencies/api/agencyIntelligenceApiTypes";

export interface ContextMiniListing { id: string; title: string; city: string | null; neighborhood: string | null; price: number | null; opportunityScore: number; hasAgent: boolean | null }
export interface EntityContextDTO {
  territory: TerritoryIntelligenceDTO | null;
  opportunities: ContextMiniListing[];
  newListings: ContextMiniListing[];
  counts: { opportunities: number; offMarket: number; recent: number; total: number };
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const RECENT = Date.now() - 30 * 86_400_000;

export async function getEntityContextAction(city: string | null, neighborhood: string | null): Promise<EntityContextDTO> {
  const empty: EntityContextDTO = { territory: null, opportunities: [], newListings: [], counts: { opportunities: 0, offMarket: 0, recent: 0, total: 0 } };
  try {
    const orgId = await currentSessionOrgId();
    if (!orgId && !city && !neighborhood) return empty;

    const [territory, listings] = await Promise.all([
      orgId ? getTerritoryIntelligence(orgId, { city, neighborhood }).catch(() => null) : Promise.resolve(null),
      externalListingRepository.listForOrg(1500).catch(() => []),
    ]);

    const nc = norm(neighborhood), cc = norm(city);
    const local = listings.filter((l) => (nc && norm(l.neighborhood) === nc) || (!nc && cc && norm(l.city) === cc));
    const map = (l: (typeof local)[number]): ContextMiniListing => ({ id: l.id, title: l.title ?? "מודעה", city: l.city, neighborhood: l.neighborhood, price: l.price == null ? null : Number(l.price), opportunityScore: l.opportunity_score, hasAgent: l.has_agent });

    const opportunities = local.filter((l) => l.opportunity_score >= 70).sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 6).map(map);
    const newListings = local.filter((l) => l.first_seen_at && new Date(l.first_seen_at).getTime() >= RECENT).sort((a, b) => new Date(b.first_seen_at!).getTime() - new Date(a.first_seen_at!).getTime()).slice(0, 6).map(map);
    const counts = {
      opportunities: local.filter((l) => l.opportunity_score >= 70).length,
      offMarket: local.filter((l) => l.has_agent === false).length,
      recent: local.filter((l) => l.first_seen_at && new Date(l.first_seen_at).getTime() >= RECENT).length,
      total: local.length,
    };
    return { territory, opportunities, newListings, counts };
  } catch (e) {
    console.error("[entity-context] load failed:", e);
    return empty;
  }
}
