// ============================================================================
// Shared reader for active-listing portals (Yad2 / Madlan). Surfaces REAL
// external_listings the org already imported via the external-listings module.
// Does NOT scrape live — only reads previously-imported, stored rows. If a portal
// has no imported rows, the provider returns 'not_connected' (never demo unless
// explicitly flagged). Listings are weaker evidence than closed deals.
//
// VAL-QA-10 hard-check: reads defensively with select("*") (schema-tolerant),
// does NOT require is_active=true (null counts as active), and does NOT require a
// BYTE-EXACT city — it matches the NORMALIZED city, or falls back to a radius
// match when the subject has coordinates. This only changes RETRIEVAL; ranking,
// similarity and the AVM formula are untouched (weaker distance still down-weights
// far rows in the engine).
// ============================================================================
import type { Comparable, ComparableSource } from "../types";
import { type ProviderContext, type ProviderResult, distanceMeters } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const numOf = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};
const firstStr = (row: Row, fields: string[]): string => { for (const f of fields) { const v = str(row[f]); if (v) return v; } return ""; };
const firstNum = (row: Row, fields: string[]): number | null => { for (const f of fields) { const n = numOf(row[f]); if (n != null) return n; } return null; };

// Hebrew-aware city fold (same rules as the diagnostics/evidence-search engines).
const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
export function normalizeCityForPortal(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי").replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}

const PORTAL_RADIUS_M = 4000;  // fall back to a market radius when city text differs
const SCAN_CAP = 5000;         // defensive scan cap (we filter in memory)

function firstImage(row: Row): string | null {
  const images = row.images;
  if (Array.isArray(images) && images.length > 0) {
    const v = images[0];
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "url" in v) return String((v as { url: unknown }).url);
  }
  const single = firstStr(row, ["image_url", "main_image", "thumbnail"]);
  return single || null;
}

/** Read stored external_listings for one portal, schema-tolerant + city-flexible. */
export async function readPortalListings(
  ctx: ProviderContext, portal: ComparableSource, match: string[],
): Promise<ProviderResult> {
  const { db, orgId, input, limit } = ctx;

  // Defensive: select("*") and try both org-id column names. Never over-filter
  // in the DB query — we filter source/city/active in memory below.
  let rows: Row[] | null = null;
  let lastErr: string | null = null;
  for (const orgCol of ["org_id", "organization_id"]) {
    try {
      const { data, error } = await db.from("external_listings" as never).select("*").eq(orgCol, orgId).limit(SCAN_CAP);
      if (error) { lastErr = error.message; continue; }
      rows = (data ?? []) as Row[]; lastErr = null; break;
    } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
  }
  if (rows == null) return { source: portal, status: "error", comparables: [], message: lastErr ?? "query failed" };

  const wantCity = normalizeCityForPortal(input.city);
  const hasCoords = input.latitude != null && input.longitude != null;

  const matched: Comparable[] = [];
  for (const r of rows) {
    // Portal/source match (in memory — column may be `source` or `provider`).
    const src = `${firstStr(r, ["source"])} ${firstStr(r, ["provider"])}`.toLowerCase();
    if (!match.some((m) => src.includes(m.toLowerCase()))) continue;
    // Active: treat missing/null is_active as active; only drop explicit false.
    if (r.is_active === false) continue;

    const cityRaw = firstStr(r, ["city", "city_name"]);
    const rlat = firstNum(r, ["lat", "latitude"]);
    const rlng = firstNum(r, ["lng", "longitude"]);
    const dist = distanceMeters(input, rlat, rlng);
    // City match: normalized equal, OR (no city text) radius fallback.
    const cityOk = wantCity ? normalizeCityForPortal(cityRaw) === wantCity : true;
    const radiusOk = hasCoords && dist != null && dist <= PORTAL_RADIUS_M;
    if (!cityOk && !radiusOk) continue;

    const sqm = firstNum(r, ["sqm", "area_sqm", "size_sqm", "area", "built_sqm"]);
    const price = firstNum(r, ["price", "asking_price", "amount"]);
    const ppsqm = price && price > 0 && sqm && sqm > 0 ? Math.round(price / sqm) : null;
    matched.push({
      source: portal, comparableType: "listing",
      externalId: firstStr(r, ["external_id", "id"]) || null,
      city: cityRaw || null, neighborhood: firstStr(r, ["neighborhood", "neighborhood_name"]) || null,
      street: firstStr(r, ["street", "address"]) || null,
      distanceMeters: dist, propertyType: firstStr(r, ["property_type", "type"]) || null,
      rooms: firstNum(r, ["rooms"]), sqm, floor: firstNum(r, ["floor"]),
      price: price && price > 0 ? price : null, pricePerSqm: ppsqm,
      listingDate: firstStr(r, ["published_at", "first_seen_at", "created_at"]) || null,
      imageUrl: firstImage(r), originalUrl: firstStr(r, ["listing_url", "url"]) || null,
      sourceTable: "external_listings", isDemo: false,
    });
    if (matched.length >= limit) break;
  }

  if (matched.length === 0) {
    return { source: portal, status: "not_connected", comparables: [], message: `אין מודעות ${portal} מיובאות התואמות עיר/רדיוס זה.` };
  }
  return { source: portal, status: "ok", comparables: matched };
}
