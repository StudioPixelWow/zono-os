// ============================================================================
// ZONO internal provider — REAL comparables from the org's own inventory
// (public.properties). Active priced inventory in the same city contributes as
// listing-grade evidence (the org's own asking levels). Sold internal inventory
// (status='sold') contributes as sold-grade evidence.
// ============================================================================
import type { Comparable } from "../types";
import { type ProviderContext, type ProviderResult, distanceMeters } from "./types";

interface PropRow {
  id?: string; city?: string; neighborhood?: string; name?: string; street?: string;
  rooms?: number; size_sqm?: number; floor?: number; property_type?: string; status?: string;
  price?: number; price_per_sqm?: number; latitude?: number; longitude?: number;
  primary_image_url?: string; updated_at?: string; listed_at?: string;
}

export async function zonoInternalProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const { db, orgId, input, limit } = ctx;
  let q = db
    .from("properties" as never)
    .select("id,city,neighborhood,name,rooms,size_sqm,floor,property_type,status,price,price_per_sqm,latitude,longitude,primary_image_url,updated_at,listed_at")
    .eq("org_id", orgId)
    .not("price", "is", null)
    .limit(limit);
  if (input.city) q = q.eq("city", input.city);

  const { data, error } = await q;
  if (error) return { source: "zono", status: "error", comparables: [], message: error.message };
  const rows = (data ?? []) as unknown as PropRow[];
  if (rows.length === 0) {
    return { source: "zono", status: "not_connected", comparables: [], message: "אין מלאי פנימי מתומחר בעיר זו." };
  }

  const comparables: Comparable[] = rows.map((r) => {
    const sqm = r.size_sqm ?? null;
    const ppsqm = r.price_per_sqm ?? (r.price && sqm ? Math.round(r.price / sqm) : null);
    const sold = r.status === "sold";
    return {
      source: "zono",
      comparableType: sold ? "sold" : "listing",
      externalId: r.id ?? null,
      city: r.city ?? null,
      neighborhood: r.neighborhood ?? null,
      street: r.street ?? r.name ?? null,
      distanceMeters: distanceMeters(input, r.latitude, r.longitude),
      propertyType: r.property_type ?? null,
      rooms: r.rooms ?? null,
      sqm,
      floor: r.floor ?? null,
      price: r.price ?? null,
      pricePerSqm: ppsqm,
      saleDate: sold ? r.updated_at?.slice(0, 10) ?? null : null,
      listingDate: !sold ? (r.listed_at ?? r.updated_at)?.slice(0, 10) ?? null : null,
      imageUrl: r.primary_image_url ?? null,
      isDemo: false,
    };
  });
  return { source: "zono", status: "ok", comparables };
}
