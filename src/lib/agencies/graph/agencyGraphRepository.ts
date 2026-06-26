// ============================================================================
// ZONO — Agency Knowledge Graph repository (Phase 26.3, SERVER-ONLY). Org-scoped.
// Idempotent reads/writes over agency_entity_relationships. Writes stamp
// organization_id from the session; RLS still enforces isolation. The builder
// pre-merges (max confidence + merged evidence) using mergeRelationship() so a
// re-run never duplicates an edge — it refreshes confidence/evidence/last_seen.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { relationshipKey, mergeRelationship } from "./agencyGraphTypes";
import type { AgencyEntityRelationship, RelationshipInput } from "./agencyGraphTypes";

const COLS =
  "id,organization_id,agency_id,entity_type,entity_id,relationship_type,confidence,source,evidence,first_detected_at,last_seen_at,active,created_at,updated_at";

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function toRelationship(r: Obj): AgencyEntityRelationship {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    agencyId: r.agency_id as string,
    entityType: r.entity_type as string,
    entityId: r.entity_id as string,
    relationshipType: r.relationship_type as string,
    confidence: typeof r.confidence === "number" ? r.confidence : Number(r.confidence ?? 0),
    source: (r.source as string) ?? null,
    evidence: asObj(r.evidence),
    firstDetectedAt: r.first_detected_at as string,
    lastSeenAt: r.last_seen_at as string,
    active: Boolean(r.active),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listByAgency(
  agencyId: string,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<AgencyEntityRelationship[]> {
  const db = await createClient();
  let req = db.from("agency_entity_relationships").select(COLS).eq("agency_id", agencyId);
  if (opts.activeOnly) req = req.eq("active", true);
  const { data } = await req.order("last_seen_at", { ascending: false }).limit(opts.limit ?? 2000);
  return ((data as Obj[] | null) ?? []).map(toRelationship);
}

export async function listByAgencyAndType(
  agencyId: string,
  entityType: string,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<AgencyEntityRelationship[]> {
  const db = await createClient();
  let req = db.from("agency_entity_relationships").select(COLS).eq("agency_id", agencyId).eq("entity_type", entityType);
  if (opts.activeOnly) req = req.eq("active", true);
  const { data } = await req.order("confidence", { ascending: false }).limit(opts.limit ?? 1000);
  return ((data as Obj[] | null) ?? []).map(toRelationship);
}

export async function listByAgencyAndRelationship(
  agencyId: string,
  relationshipType: string,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<AgencyEntityRelationship[]> {
  const db = await createClient();
  let req = db.from("agency_entity_relationships").select(COLS).eq("agency_id", agencyId).eq("relationship_type", relationshipType);
  if (opts.activeOnly) req = req.eq("active", true);
  const { data } = await req.order("confidence", { ascending: false }).limit(opts.limit ?? 1000);
  return ((data as Obj[] | null) ?? []).map(toRelationship);
}

/** Which agencies are connected to a given entity (e.g. agencies in a city). */
export async function listByEntity(
  entityType: string,
  entityId: string,
  opts: { activeOnly?: boolean; relationshipType?: string; limit?: number } = {},
): Promise<AgencyEntityRelationship[]> {
  const org = await currentOrgId();
  const db = await createClient();
  let req = db.from("agency_entity_relationships").select(COLS)
    .eq("organization_id", org).eq("entity_type", entityType).eq("entity_id", entityId);
  if (opts.activeOnly) req = req.eq("active", true);
  if (opts.relationshipType) req = req.eq("relationship_type", opts.relationshipType);
  const { data } = await req.order("confidence", { ascending: false }).limit(opts.limit ?? 500);
  return ((data as Obj[] | null) ?? []).map(toRelationship);
}

/**
 * Idempotently upsert a batch of detected relationships for ONE agency.
 * Pre-fetches the agency's current rows, merges (max confidence + merged
 * evidence, preserved first_detected_at), then upserts on the unique key.
 * Returns counts so the batch job can report created vs updated.
 */
export async function upsertRelationships(
  agencyId: string,
  inputs: RelationshipInput[],
  now = new Date().toISOString(),
): Promise<{ created: number; updated: number; keys: string[] }> {
  if (inputs.length === 0) return { created: 0, updated: 0, keys: [] };
  const org = await currentOrgId();
  const db = await createClient();

  const existing = await listByAgency(agencyId);
  const byKey = new Map(existing.map((r) => [relationshipKey({
    agencyId: r.agencyId, entityType: r.entityType, entityId: r.entityId, relationshipType: r.relationshipType,
  }), r]));

  let created = 0, updated = 0;
  const keys: string[] = [];
  const rows = inputs.map((inc) => {
    const key = relationshipKey(inc);
    keys.push(key);
    const prev = byKey.get(key) ?? null;
    if (prev) updated++; else created++;
    const merged = mergeRelationship(prev, inc, now);
    return {
      organization_id: org,
      agency_id: agencyId,
      entity_type: inc.entityType,
      entity_id: inc.entityId,
      relationship_type: inc.relationshipType,
      confidence: merged.confidence,
      source: merged.source,
      evidence: merged.evidence,
      first_detected_at: prev?.firstDetectedAt ?? now,
      last_seen_at: merged.lastSeenAt,
      active: merged.active,
    };
  });

  const { error } = await db
    .from("agency_entity_relationships")
    .upsert(rows as never, { onConflict: "organization_id,agency_id,entity_type,entity_id,relationship_type" });
  if (error) throw new Error(error.message);
  return { created, updated, keys };
}

/**
 * Soft-deactivate relationships for an agency whose keys were NOT seen in this
 * run. SAFE: only call after a FULL scan of the agency's data — never destroys
 * rows, only sets active = false so history is preserved.
 */
export async function deactivateStale(
  agencyId: string,
  seenKeys: Set<string>,
  now = new Date().toISOString(),
): Promise<number> {
  const db = await createClient();
  const existing = await listByAgency(agencyId, { activeOnly: true });
  const staleIds = existing
    .filter((r) => !seenKeys.has(relationshipKey({
      agencyId: r.agencyId, entityType: r.entityType, entityId: r.entityId, relationshipType: r.relationshipType,
    })))
    .map((r) => r.id);
  if (staleIds.length === 0) return 0;
  const { error } = await db
    .from("agency_entity_relationships")
    .update({ active: false, last_seen_at: now } as never)
    .in("id", staleIds);
  if (error) throw new Error(error.message);
  return staleIds.length;
}
