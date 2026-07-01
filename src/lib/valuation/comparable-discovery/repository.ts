// ============================================================================
// 🗄️ Discovery repository (server-only). VAL-QA-10.
// ----------------------------------------------------------------------------
// Reads EVERY comparable source defensively (select * so a missing column never
// errors), org-scoped. Reuses the Evidence Search Engine's SOURCE_SPECS field
// maps. Unlike the live valuation providers, it does NOT hard-filter is_active
// in the query (null is treated as active in memory) so external listings are
// never silently skipped. No writes, no scraping, no fabrication.
// ============================================================================
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { SOURCE_SPECS, type SourceSpec } from "@/lib/evidence-search/repository";

type DB = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

export { SOURCE_SPECS };
export type { SourceSpec };

export interface RawSourceFetch {
  spec: SourceSpec;
  rows: Row[];
  error: string | null;
  startedAt: string; finishedAt: string; durationMs: number;
}

/** Defensive read of one source — tries each org column; drops is_active=false only. */
async function fetchOne(db: DB, orgId: string, spec: SourceSpec): Promise<RawSourceFetch> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  let rows: Row[] = [];
  let error: string | null = null;
  let ok = false;
  for (const orgCol of spec.orgCols) {
    try {
      const { data, error: e } = await db.from(spec.table as never).select("*").eq(orgCol, orgId).limit(8000);
      if (e) { error = e.message; continue; }
      rows = (data ?? []) as Row[]; error = null; ok = true; break;
    } catch (ex) { error = ex instanceof Error ? ex.message : String(ex); }
  }
  // Treat missing/null is_active as active — only explicit false is inactive.
  if (ok && spec.activeFilter) rows = rows.filter((r) => r[spec.activeFilter!.col] !== false);
  return { spec, rows, error, startedAt, finishedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - t0) };
}

/** Scan all table sources in parallel (property_transactions, external_listings,
 *  properties, market_property_sources). broker_sold is handled by the engine
 *  via the existing provider. */
export async function fetchAllSourceRows(db: DB, orgId: string): Promise<RawSourceFetch[]> {
  return Promise.all(SOURCE_SPECS.map((spec) => fetchOne(db, orgId, spec)));
}
