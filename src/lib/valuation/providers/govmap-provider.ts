// ============================================================================
// GovMap provider — REAL sold transactions the org already imported into
// property_transactions (GovMap / Tax-Authority deal feed). No live scraping
// here: we surface real, previously-imported deal rows as sold comparables.
// ============================================================================
import type { Comparable } from "../types";
import { type ProviderContext, type ProviderResult, distanceMeters } from "./types";

interface TxRow {
  id?: string; city_name?: string; neighborhood_name?: string; address?: string; street?: string;
  rooms?: number | string; sqm?: number | string; area?: number | string; floor?: number | string; building_year?: number;
  price?: number | string; deal_amount?: number | string; price_per_sqm?: number | string; property_type?: string;
  deal_date?: string; transaction_date?: string; lat?: number; lng?: number; source?: string;
}

/** Coerce DB scalars (numeric columns can arrive as strings) → finite number | null. */
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function govmapProvider(ctx: ProviderContext): Promise<ProviderResult> {
  const { db, orgId, input, limit } = ctx;
  // Schema-safe read: select * so a column the real schema lacks (e.g. `price`)
  // can never error the query, and any future column (price / deal_amount / sqm /
  // area) is picked up automatically. No SQL order — it would depend on a date
  // column we can't guarantee exists; the engine ranks by proximity/recency itself.
  let q = db
    .from("property_transactions" as never)
    .select("*")
    .eq("organization_id", orgId)
    .limit(limit);
  if (input.city) q = q.eq("city_name", input.city);

  const { data, error } = await q;
  if (error) return { source: "govmap", status: "error", comparables: [], message: error.message };
  const rows = (data ?? []) as unknown as TxRow[];
  if (rows.length === 0) {
    return { source: "govmap", status: "not_connected", comparables: [], message: "אין עסקאות GovMap מיובאות לעיר זו. ייבוא דרך מודול עסקאות שוק." };
  }

  const comparables: Comparable[] = rows.map((r) => {
    const sqm = num(r.sqm) ?? num(r.area);
    // Backward + forward compatible: prefer an explicit price if present, else the
    // real schema's deal_amount. Never produce NaN — num() guarantees number|null.
    const price = num(r.price) ?? num(r.deal_amount);
    const ppsqmDirect = num(r.price_per_sqm);
    const ppsqm = ppsqmDirect && ppsqmDirect > 0
      ? ppsqmDirect
      : (price && price > 0 && sqm && sqm > 0 ? Math.round(price / sqm) : null);
    return {
      source: "govmap",
      comparableType: "sold",
      externalId: r.id ?? null,
      city: r.city_name ?? null,
      neighborhood: r.neighborhood_name ?? null,
      street: r.street ?? r.address ?? null,
      distanceMeters: distanceMeters(input, r.lat, r.lng),
      propertyType: r.property_type ?? null,
      rooms: num(r.rooms),
      sqm,
      floor: num(r.floor),
      price: price && price > 0 ? price : null,
      pricePerSqm: ppsqm,
      saleDate: r.deal_date ?? r.transaction_date ?? null,
      sourceTable: "property_transactions",
      isDemo: false,
    };
  });
  return { source: "govmap", status: "ok", comparables };
}
