// ============================================================================
// 🗂️ ZONO OS 2.0 — Stage 4 · Search indexer (server-only).
// Fetches an entity's CURRENT row and upserts (or soft-deletes) its canonical
// search_documents row via the pure builder. Runs under the service role
// (kernel subscriber + backfill). Idempotent: upsert on
// (organization_id, entity_type, entity_id) — reprocessing never duplicates.
// Cross-org safe: verifies the fetched row's org matches the event's org.
// Never throws — returns a status the caller records as a delivery.
// ============================================================================
import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { buildSearchDocument } from "./document";

type Db = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

export type IndexStatus = "done" | "skipped" | "anomaly" | "error";

// Entity type → source table. Only these are indexable; others are skipped.
export const SEARCH_TABLE_MAP: Record<string, string> = {
  property: "properties",
  external_listing: "external_listings",
  buyer: "buyers",
  seller: "sellers",
  lead: "leads",
  deal: "deals",
  meeting: "meetings",
  task: "tasks",
  journey: "journeys",
  document: "documents",
  agent: "users",
};

function rowOrg(row: Row): string | null {
  const v = row["org_id"] ?? row["organization_id"];
  return typeof v === "string" ? v : null;
}

/**
 * Upsert the search document for one entity from its current row.
 * Returns 'skipped' when the row is gone or has no safe title, 'anomaly' on a
 * cross-org mismatch, 'error' on a write failure.
 */
export async function indexEntity(
  db: Db,
  orgId: string,
  entityType: string,
  entityId: string,
  eventId: string | null = null,
): Promise<IndexStatus> {
  const table = SEARCH_TABLE_MAP[entityType];
  if (!table || !orgId || !entityId) return "skipped";
  try {
    const { data, error } = await db.from(table as never).select("*").eq("id", entityId).maybeSingle();
    if (error || !data) return "skipped";
    const row = data as unknown as Row;

    const ro = rowOrg(row);
    if (ro && ro !== orgId) return "anomaly"; // cross-org — never index across orgs

    const doc = buildSearchDocument(entityType, entityId, orgId, row, eventId);
    if (!doc) return "skipped"; // no safe title — never fabricate one

    const { error: upErr } = await db.from("search_documents" as never).upsert({
      organization_id: doc.organization_id,
      entity_type: doc.entity_type,
      entity_id: doc.entity_id,
      title: doc.title,
      subtitle: doc.subtitle,
      normalized_text: doc.normalized_text,
      keywords: doc.keywords,
      route: doc.route,
      owner_user_id: doc.owner_user_id,
      visibility: doc.visibility,
      metadata: doc.metadata,
      source_updated_at: doc.source_updated_at,
      indexed_at: new Date().toISOString(),
      deleted_at: null, // revive if it had been soft-deleted
      event_id: doc.event_id,
    } as never, { onConflict: "organization_id,entity_type,entity_id" });
    if (upErr) return "error";
    return "done";
  } catch {
    return "error";
  }
}

/** Soft-delete (hide) the search document for an archived/removed entity. */
export async function softDeleteEntity(
  db: Db,
  orgId: string,
  entityType: string,
  entityId: string,
  eventId: string | null = null,
): Promise<IndexStatus> {
  if (!orgId || !entityId) return "skipped";
  try {
    const { error } = await db.from("search_documents" as never)
      .update({ deleted_at: new Date().toISOString(), indexed_at: new Date().toISOString(), event_id: eventId } as never)
      .eq("organization_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);
    return error ? "error" : "done";
  } catch {
    return "error";
  }
}
