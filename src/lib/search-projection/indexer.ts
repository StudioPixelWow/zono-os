// ============================================================================
// 🗂️ ZONO OS 2.0 — Stage 4 · Search indexer (server-only).
// Fetches an entity's CURRENT row and upserts (or soft-deletes) its canonical
// search_documents row via the pure builder. Runs under the service role
// (kernel subscriber + backfill). Idempotent: upsert on
// (organization_id, entity_type, entity_id) — reprocessing never duplicates.
// Cross-org safe: verifies the fetched row's org matches the event's org.
// Never throws — returns an outcome (status + reason) the caller records.
//
// Batch 5.6B: journeys are first-class search documents. entity_type='journey'
// dispatches to indexJourney(), which resolves the SUBJECT entity to build the
// title/route via the dedicated journey document builder.
// ============================================================================
import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { buildSearchDocument, type SearchDocument } from "./document";
import { buildJourneySearchDocument } from "./journey-document";

type Db = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

export type IndexStatus = "done" | "skipped" | "anomaly" | "error";

/** Result of an index attempt — status plus a machine reason (no silent skips). */
export interface IndexOutcome { status: IndexStatus; reason?: string }
const outcome = (status: IndexStatus, reason?: string): IndexOutcome => ({ status, reason });

// Entity type → source table. `journey` reads the journeys spine; its subject is
// resolved separately (see indexJourney).
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

function str(row: Row, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Upsert a built search document (idempotent on the unique key). */
async function upsertDoc(db: Db, doc: SearchDocument): Promise<boolean> {
  const { error } = await db.from("search_documents" as never).upsert({
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
  return !error;
}

/**
 * Upsert the search document for one entity from its current row.
 * Journeys dispatch to indexJourney(). Returns an outcome the caller records.
 */
export async function indexEntity(
  db: Db,
  orgId: string,
  entityType: string,
  entityId: string,
  eventId: string | null = null,
): Promise<IndexOutcome> {
  if (entityType === "journey") return indexJourney(db, orgId, entityId, eventId);

  const table = SEARCH_TABLE_MAP[entityType];
  if (!table || !orgId || !entityId) return outcome("skipped", "unindexable_type");
  try {
    const { data, error } = await db.from(table as never).select("*").eq("id", entityId).maybeSingle();
    if (error || !data) return outcome("skipped", "row_not_found");
    const row = data as unknown as Row;

    const ro = rowOrg(row);
    if (ro && ro !== orgId) return outcome("anomaly", "cross_org"); // never index across orgs

    const doc = buildSearchDocument(entityType, entityId, orgId, row, eventId);
    if (!doc) return outcome("skipped", "no_title"); // never fabricate a title

    return (await upsertDoc(db, doc)) ? outcome("done") : outcome("error", "upsert_failed");
  } catch {
    return outcome("error", "exception");
  }
}

/**
 * Index a canonical journey as a first-class search document: fetch the journey
 * row, resolve its SUBJECT entity (org-scoped), and build via the dedicated
 * journey builder. Named skip reasons flow to the delivery ledger. Batch 5.6B.
 */
export async function indexJourney(
  db: Db,
  orgId: string,
  journeyId: string,
  eventId: string | null = null,
): Promise<IndexOutcome> {
  if (!orgId || !journeyId) return outcome("skipped", "invalid_input");
  try {
    const { data: jdata, error: jerr } = await db.from("journeys" as never).select("*").eq("id", journeyId).maybeSingle();
    if (jerr || !jdata) return outcome("skipped", "journey_not_found");
    const journey = jdata as unknown as Row;

    const jorg = rowOrg(journey);
    if (jorg && jorg !== orgId) return outcome("anomaly", "cross_org"); // never index across orgs

    // Resolve the subject entity (org-verified) for the title/route.
    let subject: Row | null = null;
    const subjectType = str(journey, "entity_type");
    const subjectId = str(journey, "entity_id");
    if (subjectType && subjectId) {
      const subjectTable = SEARCH_TABLE_MAP[subjectType];
      if (subjectTable) {
        const { data: sdata } = await db.from(subjectTable as never).select("*").eq("id", subjectId).maybeSingle();
        if (sdata) {
          const srow = sdata as unknown as Row;
          const sorg = rowOrg(srow);
          if (sorg && sorg !== orgId) return outcome("anomaly", "cross_org_subject");
          subject = srow;
        }
      }
    }

    const { doc, skipReason } = buildJourneySearchDocument(journey, subject, orgId, eventId);
    if (!doc) return outcome("skipped", skipReason ?? "journey_skipped");

    return (await upsertDoc(db, doc)) ? outcome("done") : outcome("error", "upsert_failed");
  } catch {
    return outcome("error", "exception");
  }
}

/** Soft-delete (hide) the search document for an archived/removed entity. */
export async function softDeleteEntity(
  db: Db,
  orgId: string,
  entityType: string,
  entityId: string,
  eventId: string | null = null,
): Promise<IndexOutcome> {
  if (!orgId || !entityId) return outcome("skipped", "invalid_input");
  try {
    const { error } = await db.from("search_documents" as never)
      .update({ deleted_at: new Date().toISOString(), indexed_at: new Date().toISOString(), event_id: eventId } as never)
      .eq("organization_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);
    return error ? outcome("error", "update_failed") : outcome("done");
  } catch {
    return outcome("error", "exception");
  }
}
