"use server";
// ============================================================================
// ZONO — Admin geocoding actions (Phase 24 + 25.2).
// ----------------------------------------------------------------------------
// "Geocode missing / retry failed" for properties / external listings /
// transactions / neighborhood centroids. Server-only Google Geocoding. PERSISTS
// lat/lng + status + provider + confidence so we never re-geocode on render and
// every point is traceable. Invents nothing: unresolved rows are marked 'failed'
// (with the error), low-confidence rows are flagged separately and NOT trusted.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { geocodeAddress, buildQuery, type GeocodeInput } from "./geocoding";

export type GeocodeEntity = "properties" | "external_listings" | "property_transactions" | "neighborhoods";
export type GeocodeMode = "missing" | "failed";

export interface GeocodeRunStats { success: number; lowConfidence: number; failed: number; skipped: number }
export interface GeocodeRunResult {
  ok: boolean;
  entity: GeocodeEntity;
  candidates: number;
  stats?: GeocodeRunStats;
  message: string;
}

interface Row { id: string; [k: string]: unknown }

const LOW_CONF = 0.5; // below this → stored but flagged 'low_confidence', not trusted

const CONFIG: Record<GeocodeEntity, {
  orgCol: "org_id" | "organization_id" | null;
  latCol: string; lngCol: string;
  select: string;
  toInput: (r: Row) => GeocodeInput;
  /** Whether the table has geocode_status/error + formatted_address columns. */
  hasStatus: boolean;
}> = {
  properties: {
    orgCol: "org_id", latCol: "latitude", lngCol: "longitude", hasStatus: true,
    select: "id,formatted_address,neighborhood,city,latitude,longitude,geocode_confidence",
    toInput: (r) => ({ address: (r.formatted_address as string) ?? null, neighborhood: (r.neighborhood as string) ?? null, city: (r.city as string) ?? null }),
  },
  external_listings: {
    orgCol: "org_id", latCol: "lat", lngCol: "lng", hasStatus: true,
    select: "id,address,street,street_number,neighborhood,city,lat,lng,geocode_confidence",
    toInput: (r) => ({ address: (r.address as string) ?? null, street: (r.street as string) ?? null, streetNumber: (r.street_number as string) ?? null, neighborhood: (r.neighborhood as string) ?? null, city: (r.city as string) ?? null }),
  },
  property_transactions: {
    orgCol: "organization_id", latCol: "lat", lngCol: "lng", hasStatus: true,
    select: "id,address,normalized_address,neighborhood_name,city_name,street,lat,lng,geocode_confidence",
    toInput: (r) => ({ address: ((r.address as string) || (r.normalized_address as string)) ?? null, street: (r.street as string) ?? null, neighborhood: (r.neighborhood_name as string) ?? null, city: (r.city_name as string) ?? null }),
  },
  // Global enrichment table (no org filter); fills neighborhood centroids.
  neighborhoods: {
    orgCol: null, latCol: "centroid_lat", lngCol: "centroid_lng", hasStatus: false,
    select: "id,city_name,neighborhood_name,centroid_lat,centroid_lng,geocode_confidence",
    toInput: (r) => ({ neighborhood: (r.neighborhood_name as string) ?? null, city: (r.city_name as string) ?? null }),
  },
};

/**
 * Geocode rows for one entity. `mode='missing'` targets rows without coordinates;
 * `mode='failed'` retries rows previously marked failed. Up to `limit` rows/run.
 */
export async function geocodeMissingAction(entity: GeocodeEntity, limit = 50, mode: GeocodeMode = "missing"): Promise<GeocodeRunResult> {
  const cfg = CONFIG[entity];
  if (!cfg) return { ok: false, entity, candidates: 0, message: "ישות לא נתמכת." };

  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { ok: false, entity, candidates: 0, message: "אין הרשאה." };

  const db = await createClient();
  let q = db.from(entity as never).select(cfg.select).limit(limit);
  if (cfg.orgCol) q = q.eq(cfg.orgCol, profile.org_id);
  if (mode === "failed" && cfg.hasStatus) q = q.eq("geocode_status", "failed");
  else q = q.is(cfg.latCol, null);
  const { data, error } = await q;
  if (error) return { ok: false, entity, candidates: 0, message: `טעינת הרשומות נכשלה: ${error.message}` };

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) {
    return { ok: true, entity, candidates: 0, stats: { success: 0, lowConfidence: 0, failed: 0, skipped: 0 }, message: "אין רשומות מתאימות — הכול מטופל." };
  }

  const stats: GeocodeRunStats = { success: 0, lowConfidence: 0, failed: 0, skipped: 0 };
  for (const r of rows) {
    const input = cfg.toInput(r);
    if (!buildQuery(input)) { stats.skipped++; continue; }
    const out = await geocodeAddress(input);
    const now = new Date().toISOString();

    if (!out.ok) {
      stats.failed++;
      if (cfg.hasStatus) {
        await db.from(entity as never).update({ geocode_status: "failed", geocode_error: out.message } as never)
          .eq("id", r.id).eq(cfg.orgCol as string, profile.org_id).then(() => {}, () => {});
      }
      continue;
    }

    const low = out.result.confidence < LOW_CONF;
    // Confidence guard: never overwrite an existing better point with a worse one.
    const existingConf = typeof r.geocode_confidence === "number" ? (r.geocode_confidence as number) : null;
    const hasCoords = r[cfg.latCol] != null;
    if (hasCoords && existingConf != null && existingConf >= out.result.confidence) { stats.skipped++; continue; }

    const patch: Record<string, unknown> = {
      [cfg.latCol]: out.result.lat, [cfg.lngCol]: out.result.lng,
      geocode_confidence: out.result.confidence,
    };
    if (cfg.hasStatus) {
      patch.formatted_address = out.result.formattedAddress;
      patch.geocoded_at = now;
      patch.geocode_provider = out.result.provider;
      patch.geocode_status = low ? "low_confidence" : "geocoded";
      patch.geocode_error = null;
    }
    let upd = db.from(entity as never).update(patch as never).eq("id", r.id);
    if (cfg.orgCol) upd = upd.eq(cfg.orgCol, profile.org_id);
    const { error: upErr } = await upd;
    if (upErr) { stats.failed++; continue; }
    if (low) stats.lowConfidence++; else stats.success++;
    await new Promise((res) => setTimeout(res, 120)); // gentle rate limit
  }

  return {
    ok: true, entity, candidates: rows.length, stats,
    message: `הושלם: ${stats.success} מדויקים · ${stats.lowConfidence} ביטחון נמוך · ${stats.failed} נכשלו · ${stats.skipped} דולגו.`,
  };
}
