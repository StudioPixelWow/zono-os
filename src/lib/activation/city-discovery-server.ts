// ============================================================================
// ZONO — City Discovery status (server-only, READ-ONLY). P9.0D: powers the
// "ZONO is scanning your city" first-login band with REAL signals only — never
// fabricated. Counts come straight from the org's own discovery tables; the
// phase is derived from real job/data state. If every source is 0, the honest
// phase is scanning/not_started/no_results — never demo data. Tenant isolation:
// every query is filtered by the caller's own orgId.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CityDiscovery, CityDiscoveryPhase } from "./activation";

export type { CityDiscovery, CityDiscoveryPhase } from "./activation";

type Db = ReturnType<typeof createServiceRoleClient>;

async function countScoped(db: Db, table: string, filters: [string, unknown][]): Promise<number> {
  try {
    let q = db.from(table as never).select("*", { count: "exact", head: true });
    for (const [col, val] of filters) q = q.eq(col as never, val as never);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Resolve the real city-discovery status for an office. All counts are honest
 * (0 when nothing has been discovered yet). Never throws — returns a safe
 * not_started snapshot on failure.
 */
export async function getCityDiscovery(orgId: string, city: string | null, localityCode: string | null): Promise<CityDiscovery> {
  const db = createServiceRoleClient();

  const [discoveredListings, noBrokerCount, mapPoints, neighborhoods] = await Promise.all([
    countScoped(db, "external_listings", [["org_id", orgId]]),
    countScoped(db, "external_listings", [["org_id", orgId], ["has_agent", false]]),
    countScoped(db, "external_listings", [["org_id", orgId], ["geocode_status", "success"]]),
    localityCode ? countScoped(db, "israel_neighborhoods", [["locality_code", localityCode]]) : Promise.resolve(0),
  ]);

  // Scan job state (best-effort; import_jobs is the external-listings sync tracker).
  let scanRunning = false;
  let lastScanAt: string | null = null;
  try {
    const { data } = await db
      .from("import_jobs" as never)
      .select("status,finished_at,created_at")
      .eq("org_id" as never, orgId as never)
      .order("created_at" as never, { ascending: false })
      .limit(5);
    const rows = (data ?? []) as Array<{ status: string | null; finished_at: string | null }>;
    scanRunning = rows.some((r) => r.status === "queued" || r.status === "running" || r.status === "pending");
    lastScanAt = rows.map((r) => r.finished_at).filter(Boolean)[0] ?? null;
  } catch { /* honest: no job info */ }

  const phase: CityDiscoveryPhase =
    discoveredListings > 0 ? "ready"
      : scanRunning ? "scanning"
        : lastScanAt ? "no_results"
          : "not_started";

  return { phase, city, discoveredListings, noBrokerCount, mapPoints, neighborhoods, scanRunning, lastScanAt };
}
