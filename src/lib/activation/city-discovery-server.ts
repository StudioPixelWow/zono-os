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

  // "On the map" = rows that actually have coordinates. The geocoder writes
  // status "geocoded" / "low_confidence" (never "success"), so counting by a
  // "success" status silently returned 0 and the map/count looked empty even
  // when every listing was geocoded — count real coordinates instead.
  const countWithCoords = async (): Promise<number> => {
    try {
      const { count } = await db
        .from("external_listings" as never)
        .select("*", { count: "exact", head: true })
        .eq("org_id" as never, orgId as never)
        .not("lat" as never, "is", null as never);
      return count ?? 0;
    } catch { return 0; }
  };
  const [discoveredListings, noBrokerCount, mapPoints, neighborhoods] = await Promise.all([
    countScoped(db, "external_listings", [["org_id", orgId]]),
    countScoped(db, "external_listings", [["org_id", orgId], ["has_agent", false]]),
    countWithCoords(),
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
    const rows = (data ?? []) as Array<{ status: string | null; finished_at: string | null; created_at: string | null }>;
    // A job counts as actively running ONLY if it's non-terminal AND recent — a
    // stale 'running' row (crashed / SIGKILLed / client-abandoned) must NOT pin the
    // UI to "scanning" forever. The stale window matches the job reconciler (20m).
    const STALE_MS = 20 * 60 * 1000;
    const isActive = (r: { status: string | null; created_at: string | null }) => {
      if (!(r.status === "queued" || r.status === "running" || r.status === "pending")) return false;
      const started = r.created_at ? Date.parse(r.created_at) : 0;
      return started > 0 && Date.now() - started < STALE_MS;
    };
    scanRunning = rows.some(isActive);
    lastScanAt = rows.map((r) => r.finished_at).filter(Boolean)[0] ?? null;
  } catch { /* honest: no job info */ }

  const phase: CityDiscoveryPhase =
    discoveredListings > 0 ? "ready"
      : scanRunning ? "scanning"
        : lastScanAt ? "no_results"
          : "not_started";

  return { phase, city, discoveredListings, noBrokerCount, mapPoints, neighborhoods, scanRunning, lastScanAt };
}
