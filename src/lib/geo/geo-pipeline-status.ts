// ============================================================================
// ZONO GEO — Pipeline ops status (server-only). §12 observability.
// ----------------------------------------------------------------------------
// A small operational snapshot for admins/ops: geocode coverage for the org's
// properties + transactions, the shared cache size (by resolution), the last run,
// provider calls used today, and the recent cache-hit rate. Reads the service-role
// cache/runs tables (RLS-closed to brokers) + org-scoped entity counts. Never
// exposed to brokers — the route guards on manager/owner role.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

type DB = ReturnType<typeof createServiceRoleClient>;

export interface GeoEntityStatus { total: number; geocoded: number; pending: number; failed: number }
export interface GeoLastRun {
  startedAt: string | null; finishedAt: string | null; ok: boolean;
  resolved: number; cacheHits: number; internalStreet: number; internalNeighborhood: number;
  googleCalls: number; osmCalls: number;
}
export interface GeoPipelineStatus {
  orgId: string;
  properties: GeoEntityStatus;
  transactions: GeoEntityStatus;
  cacheEntries: number;
  cacheByResolution: Record<string, number>;
  lastRun: GeoLastRun | null;
  providerCallsToday: number;
  cacheHitRatePct: number;
}

async function entityStatus(db: DB, table: string, orgCol: string, latCol: string, orgId: string): Promise<GeoEntityStatus> {
  const totalRes = (await db.from(table as never).select("*", { count: "exact", head: true }).eq(orgCol, orgId)) as { count: number | null };
  const geoRes = (await db.from(table as never).select("*", { count: "exact", head: true }).eq(orgCol, orgId).not(latCol, "is", null)) as { count: number | null };
  const failRes = (await db.from(table as never).select("*", { count: "exact", head: true }).eq(orgCol, orgId).eq("geocode_status", "failed")) as { count: number | null };
  const total = totalRes.count ?? 0;
  const geocoded = geoRes.count ?? 0;
  return { total, geocoded, pending: Math.max(0, total - geocoded), failed: failRes.count ?? 0 };
}

export async function getGeoPipelineStatus(orgId: string): Promise<GeoPipelineStatus> {
  const db = createServiceRoleClient() as unknown as DB;

  const properties = await entityStatus(db, "properties", "org_id", "latitude", orgId);
  const transactions = await entityStatus(db, "property_transactions", "organization_id", "lat", orgId);

  // Cache size + resolution breakdown (small table → fetch resolutions and tally).
  const cacheByResolution: Record<string, number> = {};
  let cacheEntries = 0;
  const { data: cacheRows } = await db.from("geocoding_cache" as never).select("resolution").limit(50_000);
  for (const r of (cacheRows ?? []) as unknown as { resolution: string }[]) {
    cacheEntries++;
    cacheByResolution[r.resolution] = (cacheByResolution[r.resolution] ?? 0) + 1;
  }

  // Last run + today's provider calls + recent cache-hit rate.
  const { data: runs } = await db.from("geocoding_runs" as never)
    .select("started_at,finished_at,ok,resolved,cache_hits,internal_street,internal_neighborhood,google_calls,osm_calls,rows_considered")
    .order("started_at", { ascending: false }).limit(50);
  const runRows = (runs ?? []) as unknown as Array<{ started_at: string; finished_at: string | null; ok: boolean; resolved: number; cache_hits: number; internal_street: number; internal_neighborhood: number; google_calls: number; osm_calls: number; rows_considered: number }>;

  const lastRun: GeoLastRun | null = runRows[0]
    ? { startedAt: runRows[0].started_at, finishedAt: runRows[0].finished_at, ok: runRows[0].ok, resolved: runRows[0].resolved, cacheHits: runRows[0].cache_hits, internalStreet: runRows[0].internal_street, internalNeighborhood: runRows[0].internal_neighborhood, googleCalls: runRows[0].google_calls, osmCalls: runRows[0].osm_calls }
    : null;

  const todayPrefix = new Date().toISOString().slice(0, 10);
  let providerCallsToday = 0;
  for (const r of runRows) if ((r.started_at ?? "").slice(0, 10) === todayPrefix) providerCallsToday += (r.google_calls ?? 0) + (r.osm_calls ?? 0);

  let hits = 0, considered = 0;
  for (const r of runRows) { hits += r.cache_hits ?? 0; considered += r.rows_considered ?? 0; }
  const cacheHitRatePct = considered > 0 ? Math.round((hits / considered) * 100) : 0;

  return { orgId, properties, transactions, cacheEntries, cacheByResolution, lastRun, providerCallsToday, cacheHitRatePct };
}
