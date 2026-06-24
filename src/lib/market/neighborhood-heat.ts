// ============================================================================
// ZONO — Neighborhood demand/price heat (server-only).
// ----------------------------------------------------------------------------
// Builds a REAL neighborhood-level heat map for a city:
//   • coordinates  → public.israel_neighborhoods (real lat/lng centroids).
//   • heat metric  → the org's REAL market activity per neighborhood, aggregated
//     from external_listings + property_transactions (count + avg price).
// No fake coordinates, no invented prices. Neighborhoods with no activity are
// still shown (real centroid) but flagged as "no data" — never fabricated.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export interface NeighborhoodHeatPoint {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  listings: number;       // real active external listings in this neighborhood
  transactions: number;   // real recorded transactions
  avgPrice: number | null; // real avg price (₪) from the activity above
  activity: number;        // listings + transactions (raw)
  intensity: number;       // 0..100 relative heat within the city
  tone: "danger" | "warning" | "brand" | "success";
}

export interface NeighborhoodHeat {
  city: string | null;
  points: NeighborhoodHeatPoint[];
  withCoords: number;
  hasData: boolean;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/['"׳״]/g, "");

export async function getCityNeighborhoodHeat(cityInput?: string | null): Promise<NeighborhoodHeat> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { city: null, points: [], withCoords: 0, hasData: false };
  const db = await createClient();
  const orgId = profile.org_id;

  // Resolve the city: explicit arg → else the org's primary operating city.
  let city = cityInput?.trim() || null;
  if (!city) {
    const { data } = await db.from("organizations" as never).select("settings").eq("id", orgId).maybeSingle();
    city = ((data as unknown as { settings?: { primary_city?: string } } | null)?.settings?.primary_city) ?? null;
  }
  if (!city) return { city: null, points: [], withCoords: 0, hasData: false };

  // Real neighborhood centroids for the city (national reference).
  const { data: nRows } = await db
    .from("israel_neighborhoods" as never)
    .select("id,name_he,lat,lng,city_name")
    .ilike("city_name", `%${city}%`).limit(400);
  const neighborhoods = (nRows ?? []) as unknown as { id: string; name_he: string; lat: number | null; lng: number | null }[];

  // Real org activity in this city.
  const [{ data: listingRows }, { data: txRows }] = await Promise.all([
    db.from("external_listings" as never).select("neighborhood,price").eq("org_id", orgId).ilike("city", `%${city}%`).limit(4000),
    db.from("property_transactions" as never).select("neighborhood_name,price,deal_amount").eq("organization_id", orgId).ilike("city_name", `%${city}%`).limit(4000),
  ]);

  // Aggregate activity per normalized neighborhood name.
  const agg = new Map<string, { listings: number; transactions: number; priceSum: number; priceCount: number }>();
  const bump = (name: string | null | undefined, price: number | null, kind: "l" | "t") => {
    const k = norm(name);
    if (!k) return;
    let a = agg.get(k);
    if (!a) { a = { listings: 0, transactions: 0, priceSum: 0, priceCount: 0 }; agg.set(k, a); }
    if (kind === "l") a.listings++; else a.transactions++;
    if (price && price > 0) { a.priceSum += price; a.priceCount++; }
  };
  for (const r of (listingRows ?? []) as { neighborhood?: string; price?: number }[]) bump(r.neighborhood, r.price ?? null, "l");
  for (const r of (txRows ?? []) as { neighborhood_name?: string; price?: number; deal_amount?: number }[]) bump(r.neighborhood_name, r.price ?? r.deal_amount ?? null, "t");

  // Merge centroids + activity. Include neighborhoods that have a centroid OR activity.
  const seen = new Set<string>();
  const raw: Omit<NeighborhoodHeatPoint, "intensity" | "tone">[] = [];
  for (const n of neighborhoods) {
    const k = norm(n.name_he);
    seen.add(k);
    const a = agg.get(k);
    raw.push({
      id: n.id, name: n.name_he, lat: n.lat, lng: n.lng,
      listings: a?.listings ?? 0, transactions: a?.transactions ?? 0,
      avgPrice: a && a.priceCount ? Math.round(a.priceSum / a.priceCount) : null,
      activity: (a?.listings ?? 0) + (a?.transactions ?? 0),
    });
  }
  // Activity in neighborhoods we have no centroid for — still real, show in list (no map pin).
  for (const [k, a] of agg) {
    if (seen.has(k)) continue;
    raw.push({
      id: `act:${k}`, name: k, lat: null, lng: null,
      listings: a.listings, transactions: a.transactions,
      avgPrice: a.priceCount ? Math.round(a.priceSum / a.priceCount) : null,
      activity: a.listings + a.transactions,
    });
  }

  const maxActivity = Math.max(1, ...raw.map((r) => r.activity));
  const points: NeighborhoodHeatPoint[] = raw.map((r) => {
    const intensity = Math.round((r.activity / maxActivity) * 100);
    const tone: NeighborhoodHeatPoint["tone"] =
      intensity >= 70 ? "danger" : intensity >= 40 ? "warning" : intensity > 0 ? "brand" : "success";
    return { ...r, intensity, tone };
  }).sort((a, b) => b.activity - a.activity || (b.avgPrice ?? 0) - (a.avgPrice ?? 0));

  return {
    city,
    points,
    withCoords: points.filter((p) => p.lat != null && p.lng != null).length,
    hasData: raw.some((r) => r.activity > 0),
  };
}
