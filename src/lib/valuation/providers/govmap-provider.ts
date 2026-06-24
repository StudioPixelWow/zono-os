// ============================================================================
// GovMap provider — REAL sold transactions the org already imported into
// property_transactions (GovMap / Tax-Authority deal feed). No live scraping
// here: we surface real, previously-imported deal rows as sold comparables.
// ============================================================================
import type { Comparable } from "../types";
import { type ProviderContext, type ProviderResult, distanceMeters } from "./types";

interface TxRow {
  id?: string; city_name?: string; neighborhood_name?: string; address?: string; street?: string;
  rooms?: number; sqm?: number; area?: number; floor?: number; building_year?: number;
  price?: number; deal_amount?: number; price_per_sqm?: number; property_type?: string;
  deal_date?: string; transaction_date?: string; lat?: number; lng?: number; source?: string;
}

export async function govmapProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const { db, orgId, input, limit } = ctx;
  let q = db
    .from("property_transactions" as never)
    .select("id,city_name,neighborhood_name,address,street,rooms,sqm,area,floor,price,deal_amount,price_per_sqm,property_type,deal_date,transaction_date,lat,lng,source")
    .eq("organization_id", orgId)
    .order("deal_date", { ascending: false })
    .limit(limit);
  if (input.city) q = q.eq("city_name", input.city);

  const { data, error } = await q;
  if (error) return { source: "govmap", status: "error", comparables: [], message: error.message };
  const rows = (data ?? []) as unknown as TxRow[];
  if (rows.length === 0) {
    return { source: "govmap", status: "not_connected", comparables: [], message: "אין עסקאות GovMap מיובאות לעיר זו. ייבוא דרך מודול עסקאות שוק." };
  }

  const comparables: Comparable[] = rows.map((r) => {
    const sqm = r.sqm ?? r.area ?? null;
    const price = r.price ?? r.deal_amount ?? null;
    const ppsqm = r.price_per_sqm ?? (price && sqm ? Math.round(price / sqm) : null);
    return {
      source: "govmap",
      comparableType: "sold",
      externalId: r.id ?? null,
      city: r.city_name ?? null,
      neighborhood: r.neighborhood_name ?? null,
      street: r.street ?? r.address ?? null,
      distanceMeters: distanceMeters(input, r.lat, r.lng),
      propertyType: r.property_type ?? null,
      rooms: r.rooms ?? null,
      sqm,
      floor: r.floor ?? null,
      price,
      pricePerSqm: ppsqm,
      saleDate: r.deal_date ?? r.transaction_date ?? null,
      isDemo: false,
    };
  });
  return { source: "govmap", status: "ok", comparables };
}
