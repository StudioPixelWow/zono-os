// ============================================================================
// ZONO — Agency Territory queries (Phase 26.4, SERVER-ONLY). Typed read layer.
// Returns typed objects only — no UI. Recompute entry points are re-exported
// from the service so callers have a single import surface.
// ============================================================================
import "server-only";
import {
  listByAgency, listByAgencyAndType, listByTerritory, listPeriodsForTerritory,
} from "./agencyTerritoryRepository";
import { territoryKey, DEFAULT_TERRITORY_PERIOD } from "./agencyTerritoryTypes";
import type { AgencyTerritoryStats, TerritoryType, TerritoryPeriodDays } from "./agencyTerritoryTypes";

export {
  calculateAgencyTerritoryStats, calculateOrganizationTerritoryStats,
} from "./agencyTerritoryService";

export interface TerritoryRef {
  territoryType: TerritoryType;
  city: string | null;
  neighborhood?: string | null;
  street?: string | null;
}

/** Ranked agencies (by dominance) in a city. */
export function getAgencyDominanceByCity(_organizationId: string, city: string, period: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD): Promise<AgencyTerritoryStats[]> {
  void _organizationId;
  return listByTerritory("city", territoryKey("city", city), period);
}

export function getAgencyDominanceByNeighborhood(_organizationId: string, city: string, neighborhood: string, period: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD): Promise<AgencyTerritoryStats[]> {
  void _organizationId;
  return listByTerritory("neighborhood", territoryKey("neighborhood", city, neighborhood), period);
}

export function getAgencyDominanceByStreet(_organizationId: string, city: string, neighborhood: string, street: string, period: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD): Promise<AgencyTerritoryStats[]> {
  void _organizationId;
  return listByTerritory("street", territoryKey("street", city, neighborhood, street), period);
}

/** Ranked agencies in any territory (city / neighborhood / street). */
export function getTopAgenciesInTerritory(_organizationId: string, territory: TerritoryRef, period: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD, limit = 20): Promise<AgencyTerritoryStats[]> {
  void _organizationId;
  const key = territoryKey(territory.territoryType, territory.city, territory.neighborhood ?? null, territory.street ?? null);
  return listByTerritory(territory.territoryType, key, period, limit);
}

/** One agency's stats for a territory across all calculated periods (trend). */
export function getAgencyTerritoryTrend(agencyId: string, territory: TerritoryRef): Promise<AgencyTerritoryStats[]> {
  const key = territoryKey(territory.territoryType, territory.city, territory.neighborhood ?? null, territory.street ?? null);
  return listPeriodsForTerritory(agencyId, territory.territoryType, key);
}

/** Territories where the user agency is present but weak (low dominance). */
export async function getWeakTerritoriesForUserAgency(_organizationId: string, userAgencyId: string, period: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD): Promise<AgencyTerritoryStats[]> {
  void _organizationId;
  const stats = await listByAgency(userAgencyId, period);
  return stats
    .filter((s) => s.activeListingsCount > 0 && (s.dominanceScore ?? 0) < 30)
    .sort((a, b) => (a.dominanceScore ?? 0) - (b.dominanceScore ?? 0));
}

/** Territories flagged as opportunities for the user agency (from detection). */
export async function getOpportunityTerritories(_organizationId: string, userAgencyId: string, period: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD): Promise<AgencyTerritoryStats[]> {
  void _organizationId;
  const stats = await listByAgency(userAgencyId, period);
  return stats.filter((s) => {
    const types = (s.metadata?.opportunityTypes as string[]) ?? [];
    return types.includes("territory_opportunity") || types.includes("low_competition_area") || types.includes("competitor_momentum");
  });
}

/** All of an agency's territory stats at a given level (city/neighborhood/street). */
export function getAgencyTerritoriesByType(agencyId: string, territoryType: TerritoryType, period: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD): Promise<AgencyTerritoryStats[]> {
  return listByAgencyAndType(agencyId, territoryType, period);
}
