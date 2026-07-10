// ============================================================================
// 🔁 ZONO OS 2.0 — Stage 4 · Search backfill (server-only).
// Seeds the canonical search_documents projection from existing entity rows,
// idempotently (upsert on the unique key — safe to re-run). Uses the SAME pure
// document builder as the live indexer, so backfilled + event-driven rows are
// identical. Source tables are READ ONLY. Never throws — returns diagnostics.
// Never fabricates a title: an entity with no safe title is skipped + reported.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildSearchDocument, SEARCHABLE_ENTITY_TYPES } from "./document";
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
}

export interface SearchBackfillResult {
  perEntity: SearchBackfillDiagnostics[];
  totalScanned: number;
  totalIndexed: number;
  finishedAt: string;
}

type Row = Record<string, unknown>;

function rowOrg(row: Row): string | null {
  const v = row["org_id"] ?? row["organization_id"];
  return typeof v === "string" ? v : null;
}

function isArchived(row: Row): boolean {
  const s = row["status"];
  const status = typeof s === "string" ? s.toLowerCase() : "";
  return status === "archived" || status === "deleted" || row["deleted_at"] != null || row["archived_at"] != null;
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
        const { error: upErr } = await db.from("search_documents" as never).upsert({
          organization_id: doc.organization_id, entity_type: doc.entity_type, entity_id: doc.entity_id,
          title: doc.title, subtitle: doc.subtitle, normalized_text: doc.normalized_text, keywords: doc.keywords,
          route: doc.route, owner_user_id: doc.owner_user_id, visibility: doc.visibility, metadata: doc.metadata,
          source_updated_at: doc.source_updated_at, indexed_at: new Date().toISOString(), deleted_at: null,
        } as never, { onConflict: "organization_id,entity_type,entity_id" });
        if (upErr) d.errors++; else d.indexed++;
      }
    } catch { d.errors++; }
    perEntity.push(d);
  }

  return {
    perEntity,
    totalScanned: perEntity.reduce((s, d) => s + d.scanned, 0),
    totalIndexed: perEntity.reduce((s, d) => s + d.indexed, 0),
    finishedAt: new Date().toISOString(),
  };
}
