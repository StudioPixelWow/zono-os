// ============================================================================
// ZONO — Geospatial enrichment backlogs for SUBJECT properties + SOLD
// transactions (server-only). AVM 3.2 §3/§4/§17.
// ----------------------------------------------------------------------------
// The missing canonical piece: the external-listings backlog already geocodes
// listings; these two functions do the same for `properties` and
// `property_transactions`, REUSING the one canonical geocoder
// (geocodeAddress/geocodeBatch — Google→OSM). They are:
//   • org-scoped, bounded, background-only (never on render),
//   • idempotent — only rows with a NULL coordinate are attempted,
//   • precision-honest — every write records geocode_resolution + provider, and a
//     coarse result never overwrites an existing precise coordinate.
// Coordinates are never fabricated: on failure the geocoder returns null and we
// record the failure (geocode_status='failed') for a later retry.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { geocodeBatch, type GeocodeResult } from "@/lib/maps/geocoding";
import { buildGeoQuery, resolveGeoResolution, shouldReplaceCoordinate, type GeoResolution } from "./address";

type DB = Awaited<ReturnType<typeof createClient>>;
const DEFAULT_BATCH = 50;

export interface GeoEnrichStats { attempted: number; resolved: number; failed: number; skipped: number; coarseOnly: number }

interface PropRow { id: string; city: string | null; neighborhood: string | null; building_number: string | null; title: string | null; geocode_resolution: GeoResolution | null }
interface TxRow { id: string; city_name: string | null; neighborhood_name: string | null; street: string | null; street_number: string | null; address: string | null; geocode_resolution: GeoResolution | null }

/**
 * Geocode the org's un-located SUBJECT properties (bounded). Reuses geocodeBatch.
 * Only rows with latitude IS NULL are attempted; a coarse result never downgrades
 * an existing precise coordinate.
 */
export async function geocodeOrgProperties(db: DB, orgId: string, opts: { limit?: number } = {}): Promise<GeoEnrichStats> {
  const limit = opts.limit ?? DEFAULT_BATCH;
  const { data } = await db.from("properties" as never)
    .select("id,city,neighborhood,building_number,title,geocode_resolution")
    .eq("org_id", orgId).is("latitude", null).limit(limit);
  const rows = (data ?? []) as unknown as PropRow[];
  const stats: GeoEnrichStats = { attempted: rows.length, resolved: 0, failed: 0, skipped: 0, coarseOnly: 0 };

  await geocodeBatch(
    rows,
    (r) => { const q = buildGeoQuery({ city: r.city, neighborhood: r.neighborhood, buildingNumber: r.building_number, title: r.title }); return { street: q.street, streetNumber: q.streetNumber, neighborhood: q.neighborhood, city: q.city, address: q.address, region: "il" }; },
    async (r, result: GeocodeResult) => {
      const maxRes = buildGeoQuery({ city: r.city, neighborhood: r.neighborhood, buildingNumber: r.building_number, title: r.title }).maxResolution;
      const resolution = resolveGeoResolution(maxRes, result.confidence);
      if (!shouldReplaceCoordinate(r.geocode_resolution, resolution)) { stats.skipped++; return; }
      if (resolution === "CITY" || resolution === "NEIGHBORHOOD") stats.coarseOnly++;
      await db.from("properties" as never).update({
        latitude: result.lat, longitude: result.lng, formatted_address: result.formattedAddress,
        geocode_provider: result.provider, geocode_confidence: result.confidence, geocode_resolution: resolution,
        geocode_status: "geocoded", geocoded_at: new Date().toISOString(),
      } as never).eq("id", r.id).eq("org_id", orgId);
      stats.resolved++;
    },
    { delayMs: 120 },
  );
  stats.failed = stats.attempted - stats.resolved - stats.skipped;
  return stats;
}

/**
 * Geocode the org's un-located SOLD transactions (bounded). Same contract. NOTE:
 * if a future ingestion payload carries source coordinates, map those on insert
 * (see ingestion) — do NOT geocode a transaction that already has trustworthy
 * source coordinates.
 */
export async function geocodeOrgTransactions(db: DB, orgId: string, opts: { limit?: number } = {}): Promise<GeoEnrichStats> {
  const limit = opts.limit ?? DEFAULT_BATCH;
  const { data } = await db.from("property_transactions" as never)
    .select("id,city_name,neighborhood_name,street,street_number,address,geocode_resolution")
    .eq("organization_id", orgId).is("lat", null).limit(limit);
  const rows = (data ?? []) as unknown as TxRow[];
  const stats: GeoEnrichStats = { attempted: rows.length, resolved: 0, failed: 0, skipped: 0, coarseOnly: 0 };

  await geocodeBatch(
    rows,
    (r) => { const q = buildGeoQuery({ city: r.city_name, neighborhood: r.neighborhood_name, street: r.street, streetNumber: r.street_number, address: r.address }); return { street: q.street, streetNumber: q.streetNumber, neighborhood: q.neighborhood, city: q.city, address: q.address, region: "il" }; },
    async (r, result: GeocodeResult) => {
      const maxRes = buildGeoQuery({ city: r.city_name, neighborhood: r.neighborhood_name, street: r.street, streetNumber: r.street_number, address: r.address }).maxResolution;
      const resolution = resolveGeoResolution(maxRes, result.confidence);
      if (!shouldReplaceCoordinate(r.geocode_resolution, resolution)) { stats.skipped++; return; }
      if (resolution === "CITY" || resolution === "NEIGHBORHOOD") stats.coarseOnly++;
      await db.from("property_transactions" as never).update({
        lat: result.lat, lng: result.lng, formatted_address: result.formattedAddress,
        geocode_provider: result.provider, geocode_confidence: result.confidence, geocode_resolution: resolution,
        geocode_status: "geocoded", geocoded_at: new Date().toISOString(),
      } as never).eq("id", r.id).eq("organization_id", orgId);
      stats.resolved++;
    },
    { delayMs: 120 },
  );
  stats.failed = stats.attempted - stats.resolved - stats.skipped;
  return stats;
}

/**
 * @deprecated Superseded by runGeoBackfill() in ./geo-pipeline, which resolves
 * most rows internally (cache → exact → street → neighborhood → city) before ever
 * calling the paid provider. The canonical cron now calls runGeoBackfill. These
 * per-org helpers above remain valid provider-only building blocks; this all-orgs
 * drainer (provider-for-every-row) is kept only for backward compatibility and is
 * no longer wired to any cron. Do NOT add a second cron for it.
 *
 * Nightly all-orgs drainer (AVM 3.2 §17) — bounded per-org enrichment of subject
 * properties + sold transactions that still lack coordinates. Reuses the canonical
 * geocoder; org-scoped; idempotent (only NULL-coordinate rows).
 */
export async function geocodeGeoBacklogForAllOrganizations(opts: { perOrg?: number } = {}): Promise<Array<{ orgId: string; properties: GeoEnrichStats; transactions: GeoEnrichStats }>> {
  const perOrg = opts.perOrg ?? DEFAULT_BATCH;
  const db = createServiceRoleClient() as unknown as DB;
  const orgs = new Set<string>();
  const { data: p } = await db.from("properties" as never).select("org_id").is("latitude", null).limit(5000);
  for (const r of (p ?? []) as unknown as { org_id: string | null }[]) if (r.org_id) orgs.add(r.org_id);
  const { data: t } = await db.from("property_transactions" as never).select("organization_id").is("lat", null).limit(5000);
  for (const r of (t ?? []) as unknown as { organization_id: string | null }[]) if (r.organization_id) orgs.add(r.organization_id);

  const results: Array<{ orgId: string; properties: GeoEnrichStats; transactions: GeoEnrichStats }> = [];
  for (const orgId of orgs) {
    const properties = await geocodeOrgProperties(db, orgId, { limit: perOrg });
    const transactions = await geocodeOrgTransactions(db, orgId, { limit: perOrg });
    results.push({ orgId, properties, transactions });
  }
  return results;
}
