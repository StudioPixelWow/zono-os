"use server";
// ============================================================================
// ZONO — Admin geocoding actions (Phase 24).
// ----------------------------------------------------------------------------
// "Geocode missing locations" for properties / external listings / transactions.
// Loads org rows that have an address but NO coordinates, geocodes them via the
// server-side Google Geocoding API, and PERSISTS lat/lng + metadata so we never
// re-geocode on render. Returns honest per-run stats (success/failed/skipped/
// lowConfidence). Invents nothing: rows that can't be resolved stay without
// coordinates and simply don't appear on a map.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { geocodeBatch, type GeocodeInput, type BatchGeocodeStats } from "./geocoding";

export type GeocodeEntity = "properties" | "external_listings" | "property_transactions";

export interface GeocodeRunResult {
  ok: boolean;
  entity: GeocodeEntity;
  candidates: number;
  stats?: BatchGeocodeStats;
  message: string;
}

interface Row { id: string; [k: string]: unknown }

const CONFIG: Record<GeocodeEntity, {
  orgCol: "org_id" | "organization_id";
  latCol: "lat" | "latitude";
  lngCol: "lng" | "longitude";
  select: string;
  toInput: (r: Row) => GeocodeInput;
}> = {
  properties: {
    orgCol: "org_id", latCol: "latitude", lngCol: "longitude",
    select: "id,formatted_address,neighborhood,city,latitude,longitude",
    toInput: (r) => ({ address: (r.formatted_address as string) ?? null, neighborhood: (r.neighborhood as string) ?? null, city: (r.city as string) ?? null }),
  },
  external_listings: {
    orgCol: "org_id", latCol: "lat", lngCol: "lng",
    select: "id,address,street,street_number,neighborhood,city,lat,lng",
    toInput: (r) => ({ address: (r.address as string) ?? null, street: (r.street as string) ?? null, streetNumber: (r.street_number as string) ?? null, neighborhood: (r.neighborhood as string) ?? null, city: (r.city as string) ?? null }),
  },
  property_transactions: {
    orgCol: "organization_id", latCol: "lat", lngCol: "lng",
    select: "id,address,normalized_address,neighborhood_name,city_name,street,lat,lng",
    toInput: (r) => ({ address: ((r.address as string) || (r.normalized_address as string)) ?? null, street: (r.street as string) ?? null, neighborhood: (r.neighborhood_name as string) ?? null, city: (r.city_name as string) ?? null }),
  },
};

/**
 * Geocode up to `limit` rows of one entity that are missing coordinates.
 * Writes via the RLS client (manager/agent policies apply). Never fabricates.
 */
export async function geocodeMissingAction(entity: GeocodeEntity, limit = 50): Promise<GeocodeRunResult> {
  const cfg = CONFIG[entity];
  if (!cfg) return { ok: false, entity, candidates: 0, message: "ישות לא נתמכת." };

  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { ok: false, entity, candidates: 0, message: "אין הרשאה." };

  const db = await createClient();
  const { data, error } = await db.from(entity as never)
    .select(cfg.select)
    .eq(cfg.orgCol, profile.org_id)
    .is(cfg.latCol, null)
    .limit(limit);
  if (error) return { ok: false, entity, candidates: 0, message: `טעינת הרשומות נכשלה: ${error.message}` };

  const rows = ((data ?? []) as unknown as Row[]);
  if (rows.length === 0) return { ok: true, entity, candidates: 0, stats: { success: 0, failed: 0, skipped: 0, lowConfidence: 0 }, message: "אין רשומות ללא מיקום — הכול מגאוקודד." };

  const stats = await geocodeBatch<Row>(
    rows,
    (r) => cfg.toInput(r),
    async (r, result) => {
      const patch: Record<string, unknown> = {
        [cfg.latCol]: result.lat, [cfg.lngCol]: result.lng,
        formatted_address: result.formattedAddress,
        geocoded_at: new Date().toISOString(),
        geocode_provider: result.provider,
        geocode_confidence: result.confidence,
      };
      const { error: upErr } = await db.from(entity as never).update(patch as never).eq("id", r.id).eq(cfg.orgCol, profile.org_id);
      if (upErr) throw new Error(upErr.message);
    },
    { lowConfidenceThreshold: 0.5, delayMs: 120 },
  );

  return {
    ok: true, entity, candidates: rows.length, stats,
    message: `גאוקודינג הושלם: ${stats.success} הצליחו · ${stats.failed} נכשלו · ${stats.skipped} דולגו · ${stats.lowConfidence} בביטחון נמוך.`,
  };
}
