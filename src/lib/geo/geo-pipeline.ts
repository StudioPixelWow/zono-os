// ============================================================================
// ZONO GEO — Automatic fast geocoding pipeline (server-only orchestrator).
// ----------------------------------------------------------------------------
// One canonical, bounded, background pipeline that enriches un-located properties
// and transactions WITHOUT paying a provider for what we already know:
//   1. build the org's real geocoded evidence index + load the shared cache,
//   2. dedupe pending rows by canonical address (N identical addresses → 1 lookup),
//   3. resolve each group: cache → exact → street → neighborhood → city → provider,
//   4. fan the one coordinate out to every row in the group, honouring no-promote
//      (a coarse coordinate never overwrites a precise one),
//   5. record cost/rate metrics and a run row for ops.
// It NEVER geocodes on render and NEVER invents coordinates (provider failure →
// the row is marked failed for a later bounded retry). Reuses the ONE canonical
// geocoder (geocodeAddress → Google→OSM); no second geocoder.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/maps/geocoding";
import { buildGeoQuery, resolveGeoResolution, resolutionRank, type GeoResolution } from "./address";
import { buildCacheKeyCandidates, writeKeyForResolution, type CacheKeyParts } from "./geo-cache-key";
import {
  createEvidenceIndex, addEvidencePoint, resolveInternal, outranks,
  type EvidenceIndex, type CachedCoord, type InternalMatch,
} from "./geo-evidence-index";

type DB = ReturnType<typeof createServiceRoleClient>;

// ── Cost / rate protection (§10) ────────────────────────────────────────────
export interface GeoPipelineOptions {
  orgId?: string;              // acceptance / targeted run; omit = all orgs with backlog
  maxRowsPerOrg?: number;      // rows considered per org per run
  maxProviderCalls?: number;   // hard provider-call ceiling for the whole run
  timeBudgetMs?: number;       // wall-clock budget for the whole run
  evidenceScanCap?: number;    // max evidence rows scanned per source per org
}
const DEFAULTS = { maxRowsPerOrg: 100, maxProviderCalls: 40, timeBudgetMs: 60_000, evidenceScanCap: 5_000 };

export interface GeoPipelineMetrics {
  orgs: number;
  rowsConsidered: number;
  cacheHits: number;
  internalExact: number;
  internalStreet: number;
  internalNeighborhood: number;
  internalCity: number;
  googleCalls: number;
  osmCalls: number;
  providerFailures: number;
  resolved: number;
  skipped: number;   // no city / gush-helka only, or already-better (no-promote)
  failed: number;    // provider attempted and failed
}
function emptyMetrics(): GeoPipelineMetrics {
  return { orgs: 0, rowsConsidered: 0, cacheHits: 0, internalExact: 0, internalStreet: 0, internalNeighborhood: 0, internalCity: 0, googleCalls: 0, osmCalls: 0, providerFailures: 0, resolved: 0, skipped: 0, failed: 0 };
}

const CONFIDENCE_FOR_RES: Record<GeoResolution, number> = { ROOFTOP: 0.9, STREET: 0.75, NEIGHBORHOOD: 0.5, CITY: 0.3, UNRESOLVED: 0 };

interface PendingRow {
  table: "properties" | "property_transactions";
  id: string;
  orgId: string;
  parts: CacheKeyParts;
  existingResolution: GeoResolution | null;
}

// ── Evidence + cache loading ────────────────────────────────────────────────
async function loadCache(db: DB): Promise<Map<string, CachedCoord>> {
  const map = new Map<string, CachedCoord>();
  const { data } = await db.from("geocoding_cache" as never).select("cache_key,lat,lng,resolution,provider").limit(50_000);
  for (const r of (data ?? []) as unknown as { cache_key: string; lat: number; lng: number; resolution: GeoResolution; provider: string }[]) {
    map.set(r.cache_key, { lat: Number(r.lat), lng: Number(r.lng), resolution: r.resolution, provider: r.provider });
  }
  return map;
}

async function buildEvidenceIndex(db: DB, orgId: string, cap: number): Promise<EvidenceIndex> {
  const index = createEvidenceIndex();
  const { data: listings } = await db.from("external_listings" as never)
    .select("city,neighborhood,street,street_number,lat,lng").eq("org_id", orgId).not("lat", "is", null).limit(cap);
  for (const r of (listings ?? []) as unknown as { city: string | null; neighborhood: string | null; street: string | null; street_number: string | null; lat: number; lng: number }[]) {
    addEvidencePoint(index, { city: r.city, neighborhood: r.neighborhood, street: r.street, streetNumber: r.street_number }, { lat: Number(r.lat), lng: Number(r.lng) });
  }
  const { data: txs } = await db.from("property_transactions" as never)
    .select("city_name,neighborhood_name,street,street_number,lat,lng").eq("organization_id", orgId).not("lat", "is", null).limit(cap);
  for (const r of (txs ?? []) as unknown as { city_name: string | null; neighborhood_name: string | null; street: string | null; street_number: string | null; lat: number; lng: number }[]) {
    addEvidencePoint(index, { city: r.city_name, neighborhood: r.neighborhood_name, street: r.street, streetNumber: r.street_number }, { lat: Number(r.lat), lng: Number(r.lng) });
  }
  const { data: props } = await db.from("properties" as never)
    .select("city,neighborhood,latitude,longitude").eq("org_id", orgId).not("latitude", "is", null).limit(cap);
  for (const r of (props ?? []) as unknown as { city: string | null; neighborhood: string | null; latitude: number; longitude: number }[]) {
    addEvidencePoint(index, { city: r.city, neighborhood: r.neighborhood }, { lat: Number(r.latitude), lng: Number(r.longitude) });
  }
  return index;
}

async function loadPending(db: DB, orgId: string, limit: number): Promise<PendingRow[]> {
  const rows: PendingRow[] = [];
  // Priority 1: properties (active inventory the broker actually values).
  const { data: props } = await db.from("properties" as never)
    .select("id,city,neighborhood,geocode_resolution").eq("org_id", orgId).is("latitude", null)
    .order("updated_at", { ascending: false }).limit(limit);
  for (const r of (props ?? []) as unknown as { id: string; city: string | null; neighborhood: string | null; geocode_resolution: GeoResolution | null }[]) {
    rows.push({ table: "properties", id: r.id, orgId, parts: { city: r.city, neighborhood: r.neighborhood }, existingResolution: r.geocode_resolution });
  }
  // Priority 2/3: transactions, most recent deals first.
  const remaining = Math.max(0, limit - rows.length);
  if (remaining > 0) {
    const { data: txs } = await db.from("property_transactions" as never)
      .select("id,city_name,neighborhood_name,street,street_number,geocode_resolution,deal_date").eq("organization_id", orgId).is("lat", null)
      .order("deal_date", { ascending: false, nullsFirst: false }).limit(remaining);
    for (const r of (txs ?? []) as unknown as { id: string; city_name: string | null; neighborhood_name: string | null; street: string | null; street_number: string | null; geocode_resolution: GeoResolution | null }[]) {
      rows.push({ table: "property_transactions", id: r.id, orgId, parts: { city: r.city_name, neighborhood: r.neighborhood_name, street: r.street, streetNumber: r.street_number }, existingResolution: r.geocode_resolution });
    }
  }
  return rows;
}

// ── Persist helpers (no-promote) ────────────────────────────────────────────
async function persistRow(db: DB, row: PendingRow, lat: number, lng: number, resolution: GeoResolution, provider: string, confidence: number, formattedAddress: string | null): Promise<"resolved" | "skipped"> {
  if (!outranks(resolution, row.existingResolution)) return "skipped"; // never downgrade a precise coord
  const now = new Date().toISOString();
  if (row.table === "properties") {
    await db.from("properties" as never).update({
      latitude: lat, longitude: lng, geocode_resolution: resolution, geocode_provider: provider,
      geocode_confidence: confidence, geocode_status: "geocoded", geocoded_at: now,
      ...(formattedAddress ? { formatted_address: formattedAddress } : {}),
    } as never).eq("id", row.id).eq("org_id", row.orgId);
  } else {
    await db.from("property_transactions" as never).update({
      lat, lng, geocode_resolution: resolution, geocode_provider: provider,
      geocode_confidence: confidence, geocode_status: "geocoded", geocoded_at: now,
      ...(formattedAddress ? { formatted_address: formattedAddress } : {}),
    } as never).eq("id", row.id).eq("organization_id", row.orgId);
  }
  return "resolved";
}

async function markFailed(db: DB, row: PendingRow, message: string): Promise<void> {
  if (row.table === "properties") {
    await db.from("properties" as never).update({ geocode_status: "failed", geocode_error: message } as never).eq("id", row.id).eq("org_id", row.orgId);
  } else {
    await db.from("property_transactions" as never).update({ geocode_status: "failed", geocode_error: message } as never).eq("id", row.id).eq("organization_id", row.orgId);
  }
}

async function upsertCache(db: DB, cache: Map<string, CachedCoord>, writeKey: string, keyType: string, parts: CacheKeyParts, lat: number, lng: number, resolution: GeoResolution, provider: string, formattedAddress: string | null, confidence: number): Promise<void> {
  if (!writeKey) return;
  const existing = cache.get(writeKey);
  if (existing && !outranks(resolution, existing.resolution)) return; // no downgrade
  await db.from("geocoding_cache" as never).upsert({
    cache_key: writeKey, key_type: keyType, city: parts.city ?? null, street: parts.street ?? null,
    street_number: parts.streetNumber ?? null, neighborhood: parts.neighborhood ?? null,
    lat, lng, resolution, provider, formatted_address: formattedAddress, confidence, updated_at: new Date().toISOString(),
  } as never, { onConflict: "cache_key" } as never);
  cache.set(writeKey, { lat, lng, resolution, provider });
}

function classifyInternal(m: InternalMatch, metrics: GeoPipelineMetrics): void {
  if (m.source === "internal_cache") metrics.cacheHits++;
  else if (m.source === "internal_exact") metrics.internalExact++;
  else if (m.source === "internal_street") metrics.internalStreet++;
  else if (m.source === "internal_neighborhood") metrics.internalNeighborhood++;
  else if (m.source === "internal_city") metrics.internalCity++;
}

// ── Per-org run ─────────────────────────────────────────────────────────────
async function runForOrg(db: DB, orgId: string, opts: Required<GeoPipelineOptions>, metrics: GeoPipelineMetrics, deadline: number, providerBudget: { left: number }): Promise<void> {
  const cache = await loadCache(db);
  const index = await buildEvidenceIndex(db, orgId, opts.evidenceScanCap);
  const pending = await loadPending(db, orgId, opts.maxRowsPerOrg);
  metrics.rowsConsidered += pending.length;

  // Dedupe: group rows by their finest canonical key (identical addresses collapse).
  const groups = new Map<string, PendingRow[]>();
  for (const row of pending) {
    const cands = buildCacheKeyCandidates(row.parts);
    if (cands.length === 0) { metrics.skipped++; continue; } // no city → cannot key (gush/helka only)
    const k = cands[0].key;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(row);
  }

  for (const [, rowsInGroup] of groups) {
    if (Date.now() > deadline) break;
    const rep = rowsInGroup[0];

    // 1. Internal-first (free): cache → evidence.
    const match = resolveInternal(index, cache, rep.parts);
    if (match) {
      classifyInternal(match, metrics);
      const conf = CONFIDENCE_FOR_RES[match.resolution] ?? 0.3;
      for (const row of rowsInGroup) {
        const r = await persistRow(db, row, match.lat, match.lng, match.resolution, match.source, conf, null);
        if (r === "resolved") metrics.resolved++; else metrics.skipped++;
      }
      if (match.source !== "internal_cache") {
        await upsertCache(db, cache, match.writeKey, match.writeKeyType, rep.parts, match.lat, match.lng, match.resolution, match.source, null, conf);
      }
      continue;
    }

    // 2. Provider fallback (costs money) — only within the run budget.
    if (providerBudget.left <= 0) { metrics.skipped += rowsInGroup.length; continue; }
    providerBudget.left--;
    const out = await geocodeAddress({ street: rep.parts.street, streetNumber: rep.parts.streetNumber, neighborhood: rep.parts.neighborhood, city: rep.parts.city, region: "il" });
    if (!out.ok) {
      metrics.providerFailures++;
      for (const row of rowsInGroup) { await markFailed(db, row, out.message); metrics.failed++; }
      continue;
    }
    if (out.result.provider === "google") metrics.googleCalls++; else metrics.osmCalls++;
    const maxRes = buildGeoQuery({ street: rep.parts.street, streetNumber: rep.parts.streetNumber, neighborhood: rep.parts.neighborhood, city: rep.parts.city }).maxResolution;
    const resolution = resolveGeoResolution(maxRes, out.result.confidence);
    const wk = writeKeyForResolution(rep.parts, resolution);
    for (const row of rowsInGroup) {
      const r = await persistRow(db, row, out.result.lat, out.result.lng, resolution, out.result.provider, out.result.confidence, out.result.formattedAddress);
      if (r === "resolved") metrics.resolved++; else metrics.skipped++;
    }
    if (wk) await upsertCache(db, cache, wk.key, wk.keyType, rep.parts, out.result.lat, out.result.lng, resolution, out.result.provider, out.result.formattedAddress, out.result.confidence);
    // Feed the fresh coordinate back into the index so later groups can reuse it.
    if (resolutionRank(resolution) >= resolutionRank("STREET")) addEvidencePoint(index, rep.parts, { lat: out.result.lat, lng: out.result.lng });
  }
}

/** Which orgs still have un-located rows (bounded discovery). */
async function orgsWithBacklog(db: DB): Promise<string[]> {
  const orgs = new Set<string>();
  const { data: p } = await db.from("properties" as never).select("org_id").is("latitude", null).limit(5000);
  for (const r of (p ?? []) as unknown as { org_id: string | null }[]) if (r.org_id) orgs.add(r.org_id);
  const { data: t } = await db.from("property_transactions" as never).select("organization_id").is("lat", null).limit(5000);
  for (const r of (t ?? []) as unknown as { organization_id: string | null }[]) if (r.organization_id) orgs.add(r.organization_id);
  return [...orgs];
}

/**
 * Run the bounded backfill (one org or every org with backlog), then record a
 * run row for ops. Reuses the one canonical geocoder; internal-first keeps
 * provider calls (and cost) low.
 */
export async function runGeoBackfill(options: GeoPipelineOptions = {}): Promise<GeoPipelineMetrics> {
  const opts: Required<GeoPipelineOptions> = {
    orgId: options.orgId ?? "",
    maxRowsPerOrg: options.maxRowsPerOrg ?? DEFAULTS.maxRowsPerOrg,
    maxProviderCalls: options.maxProviderCalls ?? DEFAULTS.maxProviderCalls,
    timeBudgetMs: options.timeBudgetMs ?? DEFAULTS.timeBudgetMs,
    evidenceScanCap: options.evidenceScanCap ?? DEFAULTS.evidenceScanCap,
  };
  const db = createServiceRoleClient() as unknown as DB;
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + opts.timeBudgetMs;
  const providerBudget = { left: opts.maxProviderCalls };
  const metrics = emptyMetrics();

  const orgIds = opts.orgId ? [opts.orgId] : await orgsWithBacklog(db);
  for (const orgId of orgIds) {
    if (Date.now() > deadline) break;
    await runForOrg(db, orgId, opts, metrics, deadline, providerBudget);
    metrics.orgs++;
  }

  // Record the run (ops observability). Best-effort — never fail the pipeline on logging.
  try {
    await db.from("geocoding_runs" as never).insert({
      started_at: startedAt, finished_at: new Date().toISOString(), ok: true, orgs: metrics.orgs,
      rows_considered: metrics.rowsConsidered, cache_hits: metrics.cacheHits,
      internal_exact: metrics.internalExact, internal_street: metrics.internalStreet,
      internal_neighborhood: metrics.internalNeighborhood + metrics.internalCity,
      google_calls: metrics.googleCalls, osm_calls: metrics.osmCalls, resolved: metrics.resolved,
      skipped: metrics.skipped, failed: metrics.failed,
      detail: { internalCity: metrics.internalCity, providerFailures: metrics.providerFailures, providerCallsUsed: opts.maxProviderCalls - providerBudget.left },
    } as never);
  } catch { /* logging is best-effort */ }

  return metrics;
}
