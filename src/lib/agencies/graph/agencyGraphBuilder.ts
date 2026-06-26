// ============================================================================
// ZONO — Agency Knowledge Graph builder (Phase 26.3, SERVER-ONLY).
// ----------------------------------------------------------------------------
// Scans EXISTING internal data (no external scraping, no mock data) and maps an
// agency to: its agents, their properties (active + sold), the deals/sellers/
// buyers attached to those properties, the areas (city/neighborhood/street) it
// operates in, and any projects/developers already present in that data. It
// also connects agencies built from external data via broker-name match.
//
// Idempotent: the builder COLLECTS a full set of relationship inputs, upserts
// them (refreshing confidence/evidence/last_seen) and soft-deactivates edges no
// longer detected — it never duplicates and never destroys history.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAgencyById } from "../agencyRepository";
import {
  listByAgency, upsertRelationships, deactivateStale, toRelationship,
} from "./agencyGraphRepository";
import { areaKey, relationshipKey, dedupeRelationshipInputs } from "./agencyGraphTypes";
import type { AgencyEntityRelationship, RelationshipInput } from "./agencyGraphTypes";
import type { Agency } from "../types";

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const loc = (v: unknown): { neighborhood?: string; street?: string; city?: string; address?: string } =>
  (v && typeof v === "object" ? (v as Record<string, string>) : {});

export interface BuildAgencyGraphResult {
  agencyId: string;
  created: number;
  updated: number;
  deactivated: number;
  relationshipsDetected: number;
  areasDetected: number;
  before: AgencyEntityRelationship[];
  after: AgencyEntityRelationship[];
}

/** Resolve the user ids of an agency's agents (internal members). */
async function agencyAgentIds(agencyId: string): Promise<Array<{ id: string; confidence: number; role: string | null; method: string | null }>> {
  const db = await createClient();
  const { data } = await db
    .from("agency_agents")
    .select("agent_id,confidence_score,role,detection_method")
    .eq("agency_id", agencyId);
  return ((data as Obj[] | null) ?? [])
    .filter((r) => str(r.agent_id))
    .map((r) => ({
      id: r.agent_id as string,
      confidence: typeof r.confidence_score === "number" ? Math.max(0, Math.min(1, (r.confidence_score as number) > 1 ? (r.confidence_score as number) / 100 : (r.confidence_score as number))) : 0.9,
      role: str(r.role),
      method: str(r.detection_method),
    }));
}

/**
 * Collect every relationship input for an agency from existing internal data.
 * Pure-ish at the boundary: returns a de-duplicated list of RelationshipInput.
 */
export async function collectRelationshipsForAgency(agency: Agency): Promise<RelationshipInput[]> {
  const db = await createClient();
  const out: RelationshipInput[] = [];
  const agencyId = agency.id;

  // ── 1) Agents (agent_member) ───────────────────────────────────────────────
  const agents = await agencyAgentIds(agencyId);
  for (const a of agents) {
    out.push({
      agencyId, entityType: "agent", entityId: a.id, relationshipType: "agent_member",
      confidence: a.confidence, source: "internal_agents",
      evidence: { role: a.role, detectionMethod: a.method },
    });
  }
  const agentIds = agents.map((a) => a.id);

  // ── 2) Properties owned by those agents (property_listing / property_sold) ──
  const propertyById = new Map<string, Obj>();
  if (agentIds.length > 0) {
    const { data: props } = await db
      .from("properties")
      .select("id,title,status,city,location,seller_id,project_id,owner_id")
      .in("owner_id", agentIds)
      .limit(5000);
    for (const p of (props as Obj[] | null) ?? []) {
      propertyById.set(p.id as string, p);
      const sold = p.status === "sold";
      out.push({
        agencyId, entityType: "property", entityId: p.id as string,
        relationshipType: sold ? "property_sold" : "property_listing",
        confidence: 0.75, source: "internal_properties",
        evidence: { label: str(p.title), status: str(p.status), city: str(p.city) },
      });

      // Areas from each property (area_activity).
      const l = loc(p.location);
      const city = str(p.city) ?? str(l.city);
      const nbhd = str(l.neighborhood);
      const street = str(l.street);
      if (city) out.push({ agencyId, entityType: "city", entityId: areaKey(city), relationshipType: "area_activity", confidence: 0.7, source: "internal_properties", evidence: { label: city } });
      if (nbhd) out.push({ agencyId, entityType: "neighborhood", entityId: areaKey(nbhd), relationshipType: "area_activity", confidence: 0.65, source: "internal_properties", evidence: { label: nbhd, city } });
      if (street) out.push({ agencyId, entityType: "street", entityId: areaKey(street), relationshipType: "area_activity", confidence: 0.6, source: "internal_properties", evidence: { label: street, neighborhood: nbhd, city } });

      // Seller attached to the property (seller_contact).
      if (str(p.seller_id)) {
        out.push({ agencyId, entityType: "seller", entityId: p.seller_id as string, relationshipType: "seller_contact", confidence: 0.65, source: "internal_properties", evidence: { via: "property", propertyId: p.id } });
      }
    }

    // ── 3) Projects + developers from those properties ────────────────────────
    const projectIds = [...new Set([...propertyById.values()].map((p) => str(p.project_id)).filter(Boolean) as string[])];
    if (projectIds.length > 0) {
      const { data: projects } = await db
        .from("projects")
        .select("id,name,developer_name")
        .in("id", projectIds)
        .limit(1000);
      for (const pr of (projects as Obj[] | null) ?? []) {
        out.push({ agencyId, entityType: "project", entityId: pr.id as string, relationshipType: "project_marketer", confidence: 0.6, source: "projects", evidence: { label: str(pr.name) } });
        const dev = str(pr.developer_name);
        if (dev) out.push({ agencyId, entityType: "developer", entityId: areaKey(dev), relationshipType: "developer_partner", confidence: 0.55, source: "projects", evidence: { label: dev, projectId: pr.id } });
      }
    }

    // ── 4) Deals owned by those agents (deal_participant + seller/buyer) ──────
    const { data: deals } = await db
      .from("deals")
      .select("id,title,status,stage,buyer_id,seller_id,property_id,owner_id")
      .in("owner_id", agentIds)
      .limit(5000);
    for (const d of (deals as Obj[] | null) ?? []) {
      out.push({ agencyId, entityType: "deal", entityId: d.id as string, relationshipType: "deal_participant", confidence: 0.7, source: "internal_deals", evidence: { label: str(d.title), status: str(d.status), stage: str(d.stage) } });
      if (str(d.seller_id)) out.push({ agencyId, entityType: "seller", entityId: d.seller_id as string, relationshipType: "seller_contact", confidence: 0.7, source: "internal_deals", evidence: { via: "deal", dealId: d.id } });
      if (str(d.buyer_id)) out.push({ agencyId, entityType: "buyer", entityId: d.buyer_id as string, relationshipType: "buyer_contact", confidence: 0.7, source: "internal_deals", evidence: { via: "deal", dealId: d.id } });
    }
  }

  // ── 5) External listings via broker-name match (competitor agencies) ────────
  // Connects agencies (often auto-built from external data) to the listings and
  // areas where a broker carrying the agency's name is detected. No scraping —
  // reads only already-imported external_listings + broker_profiles.
  if (agency.normalizedName) {
    const { data: brokers } = await db
      .from("broker_profiles")
      .select("id,normalized_agency,agency_name")
      .eq("normalized_agency", agency.normalizedName)
      .limit(200);
    const brokerIds = ((brokers as Obj[] | null) ?? []).map((b) => b.id as string);
    if (brokerIds.length > 0) {
      const { data: listings } = await db
        .from("external_listings")
        .select("id,title,city,neighborhood,street,status,detected_broker_id")
        .in("detected_broker_id", brokerIds)
        .limit(5000);
      for (const xl of (listings as Obj[] | null) ?? []) {
        const sold = str(xl.status) === "sold";
        out.push({
          agencyId, entityType: "listing", entityId: xl.id as string,
          relationshipType: sold ? "property_sold" : "property_listing",
          confidence: 0.55, source: "broker_match",
          evidence: { label: str(xl.title), status: str(xl.status), brokerMatch: true },
        });
        const city = str(xl.city), nbhd = str(xl.neighborhood), street = str(xl.street);
        if (city) out.push({ agencyId, entityType: "city", entityId: areaKey(city), relationshipType: "area_activity", confidence: 0.55, source: "broker_match", evidence: { label: city } });
        if (nbhd) out.push({ agencyId, entityType: "neighborhood", entityId: areaKey(nbhd), relationshipType: "area_activity", confidence: 0.5, source: "broker_match", evidence: { label: nbhd, city } });
        if (street) out.push({ agencyId, entityType: "street", entityId: areaKey(street), relationshipType: "area_activity", confidence: 0.45, source: "broker_match", evidence: { label: street, neighborhood: nbhd, city } });
      }
      // Mark which sources provide this agency's data (source_provider).
      out.push({ agencyId, entityType: "agent", entityId: `broker:${agency.normalizedName}`, relationshipType: "source_provider", confidence: 0.5, source: "broker_match", evidence: { brokers: brokerIds.length } });
    }
  }

  return dedupeRelationshipInputs(out);
}

/** Build (or rebuild) the knowledge graph for one agency. Idempotent. */
export async function buildAgencyGraphForAgency(agencyId: string): Promise<BuildAgencyGraphResult> {
  const agency = await getAgencyById(agencyId);
  if (!agency) {
    return { agencyId, created: 0, updated: 0, deactivated: 0, relationshipsDetected: 0, areasDetected: 0, before: [], after: [] };
  }
  const before = await listByAgency(agencyId);
  const inputs = await collectRelationshipsForAgency(agency);

  const { created, updated, keys } = await upsertRelationships(agencyId, inputs);
  const seen = new Set<string>(keys.length ? keys : inputs.map(relationshipKey));
  const deactivated = await deactivateStale(agencyId, seen);

  const after = await listByAgency(agencyId);
  const areasDetected = new Set(
    inputs.filter((i) => i.entityType === "city" || i.entityType === "neighborhood" || i.entityType === "street").map((i) => `${i.entityType}:${i.entityId}`),
  ).size;

  return {
    agencyId,
    created, updated, deactivated,
    relationshipsDetected: inputs.length,
    areasDetected,
    before, after,
  };
}

// Re-export the row mapper for callers that read rows directly.
export { toRelationship };
