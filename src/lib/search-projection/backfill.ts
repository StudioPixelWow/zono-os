// ============================================================================
// 🔁 ZONO OS 2.0 — Stage 4 · Search backfill (server-only).
// Seeds the canonical search_documents projection from existing entity rows,
// idempotently (upsert on the unique key — safe to re-run). Uses the SAME pure
// document builders as the live indexer, so backfilled + event-driven rows are
// identical. Source tables are READ ONLY. Never throws — returns diagnostics.
// Never fabricates a title: an entity with no safe title is skipped + reported.
//
// Batch 5.6B: canonical journeys are backfilled as first-class documents with
// BATCHED subject resolution (no N+1) via backfillJourneys().
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildSearchDocument, SEARCHABLE_ENTITY_TYPES } from "./document";
import { buildJourneySearchDocument } from "./journey-document";
import { SEARCH_TABLE_MAP } from "./indexer";

export interface SearchBackfillDiagnostics {
  entityType: string;
  scanned: number;
  indexed: number;
  noTitleSkipped: number;   // no safe title → skipped (reported, not fabricated)
  deletedSkipped: number;   // archived/deleted rows not indexed
  unresolvedOrgs: number;   // row had no resolvable org
  crossOrgAnomalies: number;
  errors: number;
  // Journey-specific diagnostics (Batch 5.6B) — undefined for other types.
  missingSubjects?: number;
  invalidRoutes?: number;
  unsupportedTypes?: number;
}

export interface SearchBackfillResult {
  perEntity: SearchBackfillDiagnostics[];
  totalScanned: number;
  totalIndexed: number;
  finishedAt: string;
}

type Row = Record<string, unknown>;
type Db = ReturnType<typeof createServiceRoleClient>;

function rowOrg(row: Row): string | null {
  const v = row["org_id"] ?? row["organization_id"];
  return typeof v === "string" ? v : null;
}

function str(row: Row, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isArchived(row: Row): boolean {
  const s = row["status"];
  const status = typeof s === "string" ? s.toLowerCase() : "";
  return status === "archived" || status === "deleted" || row["deleted_at"] != null || row["archived_at"] != null;
}

async function upsertDoc(db: Db, doc: {
  organization_id: string; entity_type: string; entity_id: string; title: string; subtitle: string | null;
  normalized_text: string; keywords: string[]; route: string; owner_user_id: string | null;
  visibility: string; metadata: Record<string, unknown>; source_updated_at: string | null;
}): Promise<boolean> {
  const { error } = await db.from("search_documents" as never).upsert({
    organization_id: doc.organization_id, entity_type: doc.entity_type, entity_id: doc.entity_id,
    title: doc.title, subtitle: doc.subtitle, normalized_text: doc.normalized_text, keywords: doc.keywords,
    route: doc.route, owner_user_id: doc.owner_user_id, visibility: doc.visibility, metadata: doc.metadata,
    source_updated_at: doc.source_updated_at, indexed_at: new Date().toISOString(), deleted_at: null,
  } as never, { onConflict: "organization_id,entity_type,entity_id" });
  return !error;
}

/**
 * Backfill every canonical journey as a first-class search document, resolving
 * subjects in BATCH (one query per subject table — never N+1). Idempotent.
 * Batch 5.6B.
 */
export async function backfillJourneys(db: Db, orgId?: string, limit = 5000): Promise<SearchBackfillDiagnostics> {
  const d: SearchBackfillDiagnostics = {
    entityType: "journey", scanned: 0, indexed: 0, noTitleSkipped: 0, deletedSkipped: 0,
    unresolvedOrgs: 0, crossOrgAnomalies: 0, errors: 0, missingSubjects: 0, invalidRoutes: 0, unsupportedTypes: 0,
  };
  try {
    let jq = db.from("journeys" as never).select("*").limit(limit);
    if (orgId) jq = jq.eq("org_id", orgId);
    const { data: jdata, error: jerr } = await jq;
    if (jerr) { d.errors++; return d; }
    const journeys = (jdata as unknown as Row[]) ?? [];

    // Group subject ids by subject table for batched resolution (no N+1).
    const idsByType = new Map<string, Set<string>>();
    for (const j of journeys) {
      const st = str(j, "entity_type"); const sid = str(j, "entity_id");
      if (st && sid && SEARCH_TABLE_MAP[st]) {
        (idsByType.get(st) ?? idsByType.set(st, new Set()).get(st)!).add(sid);
      }
    }
    const subjectRows = new Map<string, Row>(); // key `${type}:${id}`
    for (const [st, ids] of idsByType) {
      const table = SEARCH_TABLE_MAP[st];
      const { data: sdata } = await db.from(table as never).select("*").in("id", [...ids] as never);
      for (const r of (sdata as unknown as Row[]) ?? []) {
        const id = str(r, "id");
        if (id) subjectRows.set(`${st}:${id}`, r);
      }
    }

    for (const j of journeys) {
      d.scanned++;
      const org = rowOrg(j);
      if (!org) { d.unresolvedOrgs++; continue; }
      if (orgId && org !== orgId) { d.crossOrgAnomalies++; continue; }
      const st = str(j, "entity_type"); const sid = str(j, "entity_id");
      const subject = st && sid ? subjectRows.get(`${st}:${sid}`) ?? null : null;
      // Reject cross-org subject rows before indexing.
      if (subject) { const so = rowOrg(subject); if (so && so !== org) { d.crossOrgAnomalies++; continue; } }

      const { doc, skipReason } = buildJourneySearchDocument(j, subject, org, null);
      if (!doc) {
        if (skipReason === "missing_subject" || skipReason === "subject_not_found") d.missingSubjects!++;
        else if (skipReason === "invalid_route") d.invalidRoutes!++;
        else if (skipReason === "unsupported_type") d.unsupportedTypes!++;
        else d.noTitleSkipped++;
        continue;
      }
      if (await upsertDoc(db, doc)) d.indexed++; else d.errors++;
    }
  } catch { d.errors++; }
  return d;
}

/**
 * Backfill one bounded page per entity type. `orgId` confines the sweep to one
 * org; omitted = all orgs (service-role). Idempotent + deterministic.
 */
export async function backfillSearch(opts: { orgId?: string; limitPerEntity?: number } = {}): Promise<SearchBackfillResult> {
  const db = createServiceRoleClient();
  const limit = opts.limitPerEntity ?? 1000;
  const perEntity: SearchBackfillDiagnostics[] = [];

  for (const entityType of SEARCHABLE_ENTITY_TYPES) {
    const table = SEARCH_TABLE_MAP[entityType];
    const d: SearchBackfillDiagnostics = { entityType, scanned: 0, indexed: 0, noTitleSkipped: 0, deletedSkipped: 0, unresolvedOrgs: 0, crossOrgAnomalies: 0, errors: 0 };
    if (!table) { perEntity.push(d); continue; }
    try {
      // Org column name varies per table, so we fetch a bounded page and
      // re-verify each row's org below (never index across orgs).
      const { data, error } = await db.from(table as never).select("*").limit(limit);
      if (error) { d.errors++; perEntity.push(d); continue; }
      for (const raw of (data as unknown as Row[]) ?? []) {
        d.scanned++;
        const id = raw["id"];
        if (typeof id !== "string") { d.errors++; continue; }
        const org = rowOrg(raw);
        if (!org) { d.unresolvedOrgs++; continue; }
        if (opts.orgId && org !== opts.orgId) { d.crossOrgAnomalies++; continue; }
        if (isArchived(raw)) { d.deletedSkipped++; continue; }
        const doc = buildSearchDocument(entityType, id, org, raw, null);
        if (!doc) { d.noTitleSkipped++; continue; }
        if (await upsertDoc(db, doc)) d.indexed++; else d.errors++;
      }
    } catch { d.errors++; }
    perEntity.push(d);
  }

  // Journeys — first-class documents with batched subject resolution (5.6B).
  perEntity.push(await backfillJourneys(db, opts.orgId, Math.max(limit, 5000)));

  return {
    perEntity,
    totalScanned: perEntity.reduce((s, d) => s + d.scanned, 0),
    totalIndexed: perEntity.reduce((s, d) => s + d.indexed, 0),
    finishedAt: new Date().toISOString(),
  };
}
