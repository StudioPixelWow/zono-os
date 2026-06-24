// ============================================================================
// Shared reader for active-listing portals (Yad2 / Madlan). Surfaces REAL
// external_listings the org already imported via the external-listings module.
// Does NOT scrape live — only reads previously-imported, stored rows. If a portal
// has no imported rows, the provider returns 'not_connected' (never demo unless
// explicitly flagged). Listings are weaker evidence than closed deals.
// ============================================================================
import type { Comparable, ComparableSource } from "../types";
import { type ProviderContext, type ProviderResult, distanceMeters } from "./types";

interface ListingRow {
  id?: string; external_id?: string; city?: string; neighborhood?: string; street?: string;
  rooms?: number; sqm?: number; area_sqm?: number; floor?: number; property_type?: string;
  price?: number; images?: unknown; lat?: number; lng?: number; published_at?: string;
  first_seen_at?: string; source?: string; provider?: string;
}

function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && images.length > 0) {
    const v = images[0];
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "url" in v) return String((v as { url: unknown }).url);
  }
  return null;
}

export async function readPortalListings(
  ctx: ProviderContext, portal: ComparableSource, match: string[],
): Promise<ProviderResult> {
  const { db, orgId, input, limit } = ctx;
  let q = db
    .from("external_listings" as never)
    .select("id,external_id,city,neighborhood,street,rooms,sqm,area_sqm,floor,property_type,price,images,lat,lng,published_at,first_seen_at,source,provider")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .or(match.map((m) => `source.eq.${m},provider.eq.${m}`).join(","))
    .limit(limit);
  if (input.city) q = q.eq("city", input.city);

  const { data, error } = await q;
  if (error) return { source: portal, status: "error", comparables: [], message: error.message };
  const rows = (data ?? []) as unknown as ListingRow[];
  if (rows.length === 0) {
    return { source: portal, status: "not_connected", comparables: [], message: `אין מודעות ${portal} מיובאות לעיר זו.` };
  }

  const comparables: Comparable[] = rows.map((r) => {
    const sqm = r.sqm ?? r.area_sqm ?? null;
    const ppsqm = r.price && sqm ? Math.round(r.price / sqm) : null;
    return {
      source: portal,
      comparableType: "listing",
      externalId: r.external_id ?? r.id ?? null,
      city: r.city ?? null,
      neighborhood: r.neighborhood ?? null,
      street: r.street ?? null,
      distanceMeters: distanceMeters(input, r.lat, r.lng),
      propertyType: r.property_type ?? null,
      rooms: r.rooms ?? null,
      sqm,
      floor: r.floor ?? null,
      price: r.price ?? null,
      pricePerSqm: ppsqm,
      listingDate: r.published_at ?? r.first_seen_at ?? null,
      imageUrl: firstImage(r.images),
      isDemo: false,
    };
  });
  return { source: portal, status: "ok", comparables };
}
