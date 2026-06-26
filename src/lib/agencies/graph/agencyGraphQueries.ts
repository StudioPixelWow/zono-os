// ============================================================================
// ZONO — Agency Knowledge Graph queries (Phase 26.3, SERVER-ONLY).
// Typed, read-only accessors over agency_entity_relationships. Return typed
// objects only — no UI. Area footprint is computed from active relationships.
// ============================================================================
import "server-only";
import {
  listByAgency, listByAgencyAndType, listByEntity,
} from "./agencyGraphRepository";
import { areaKey, computeAreaFootprint } from "./agencyGraphTypes";
import type {
  AgencyEntityRelationship, AgencyAreaFootprint,
} from "./agencyGraphTypes";

/** Full active graph for an agency (every connected entity). */
export function getAgencyGraph(agencyId: string): Promise<AgencyEntityRelationship[]> {
  return listByAgency(agencyId, { activeOnly: true });
}

export function getAgencyRelatedAgents(agencyId: string): Promise<AgencyEntityRelationship[]> {
  return listByAgencyAndType(agencyId, "agent", { activeOnly: true });
}

export async function getAgencyRelatedProperties(agencyId: string): Promise<AgencyEntityRelationship[]> {
  const [internal, external] = await Promise.all([
    listByAgencyAndType(agencyId, "property", { activeOnly: true }),
    listByAgencyAndType(agencyId, "listing", { activeOnly: true }),
  ]);
  return [...internal, ...external];
}

export function getAgencyRelatedDeals(agencyId: string): Promise<AgencyEntityRelationship[]> {
  return listByAgencyAndType(agencyId, "deal", { activeOnly: true });
}

export async function getAgencyRelatedSellers(agencyId: string): Promise<AgencyEntityRelationship[]> {
  return listByAgencyAndType(agencyId, "seller", { activeOnly: true });
}

export async function getAgencyRelatedBuyers(agencyId: string): Promise<AgencyEntityRelationship[]> {
  return listByAgencyAndType(agencyId, "buyer", { activeOnly: true });
}

/** Active area relationships (city + neighborhood + street). */
export async function getAgencyRelatedAreas(agencyId: string): Promise<AgencyEntityRelationship[]> {
  const [cities, nbhds, streets] = await Promise.all([
    listByAgencyAndType(agencyId, "city", { activeOnly: true }),
    listByAgencyAndType(agencyId, "neighborhood", { activeOnly: true }),
    listByAgencyAndType(agencyId, "street", { activeOnly: true }),
  ]);
  return [...cities, ...nbhds, ...streets];
}

export function getAgencyRelatedProjects(agencyId: string): Promise<AgencyEntityRelationship[]> {
  return listByAgencyAndType(agencyId, "project", { activeOnly: true });
}

export function getAgencyRelatedDevelopers(agencyId: string): Promise<AgencyEntityRelationship[]> {
  return listByAgencyAndType(agencyId, "developer", { activeOnly: true });
}

/** Which agencies operate in a given area (city, optionally narrowed to a neighborhood). */
export async function getAgenciesByArea(
  organizationId: string,
  city: string,
  neighborhood?: string,
): Promise<{ agencyId: string; confidence: number }[]> {
  const entityType = neighborhood ? "neighborhood" : "city";
  const entityId = areaKey(neighborhood ?? city);
  const rels = await listByEntity(entityType, entityId, { activeOnly: true, relationshipType: "area_activity" });
  const byAgency = new Map<string, number>();
  for (const r of rels) {
    if (r.organizationId !== organizationId) continue; // defensive (RLS already scopes)
    byAgency.set(r.agencyId, Math.max(byAgency.get(r.agencyId) ?? 0, r.confidence));
  }
  return [...byAgency.entries()]
    .map(([agencyId, confidence]) => ({ agencyId, confidence }))
    .sort((a, b) => b.confidence - a.confidence);
}

/** Aggregated geographic footprint for an agency (typed object, no UI). */
export async function getAgencyAreaFootprint(agencyId: string): Promise<AgencyAreaFootprint> {
  const rels = await listByAgency(agencyId, { activeOnly: true });
  return computeAreaFootprint(rels);
}

/** Chronological view of when an agency connected to each entity. */
export interface AgencyRelationshipTimelinePoint {
  at: string;
  entityType: string;
  entityId: string;
  relationshipType: string;
  label: string | null;
  active: boolean;
}
export async function getAgencyRelationshipTimeline(agencyId: string): Promise<AgencyRelationshipTimelinePoint[]> {
  const rels = await listByAgency(agencyId);
  return rels
    .map((r) => ({
      at: r.firstDetectedAt,
      entityType: r.entityType,
      entityId: r.entityId,
      relationshipType: r.relationshipType,
      label: (typeof r.evidence?.label === "string" ? r.evidence.label : null),
      active: r.active,
    }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}
