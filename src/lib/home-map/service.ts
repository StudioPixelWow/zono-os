// ============================================================================
// ZONO — Home live-property map service (server-only). Builds the Home Dashboard
// heatmap from REAL data only:
//   • Internal: public.properties (org_id, real latitude/longitude).
//   • External: public.external_listings (Yad2/Madlan/…, real lat/lng), scoped
//     to the agent's operating-area cities.
// No invented coordinates, no mock heat. Rows without real coords are excluded.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getMyOperatingAreas } from "@/lib/operating-areas/service";
import { DEFAULT_HOME_MAP_FILTERS, type HomeMapData, type HomeMapFilters, type HomeMapPoint } from "./types";

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// property_type filter → internal enum values + external Hebrew/eng tokens.
const TYPE_MAP: Record<string, { internal: string[]; tokens: string[] }> = {
  apartment: { internal: ["apartment", "garden_apartment", "penthouse", "duplex", "studio"], tokens: ["דירה", "apartment", "פנטהאוז", "גן", "דופלקס", "סטודיו"] },
  house: { internal: ["private_house", "cottage"], tokens: ["בית", "קוטג", "וילה", "house", "cottage"] },
  commercial: { internal: ["commercial", "office"], tokens: ["מסחר", "משרד", "חנות", "commercial", "office"] },
  land: { internal: ["land"], tokens: ["מגרש", "קרקע", "land", "plot"] },
};

function num(v: unknown): number | null { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? (n as number) : null; }
function ils(n: number | null): string { return n == null ? "מחיר לא ידוע" : `₪${Math.round(n).toLocaleString("he-IL")}`; }

// Normalize an Israeli city name so an operating-area city matches a scraped one
// even when the spelling differs (קריית↔קרית, leading ה, punctuation, spacing).
function normCity(s: unknown): string {
  return String(s ?? "")
    .replace(/קריית/g, "קרית")
    .replace(/["'`.,־-]/g, " ")
    .replace(/^ה(?=[א-ת])/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getHomeMapData(filters: HomeMapFilters = DEFAULT_HOME_MAP_FILTERS): Promise<HomeMapData> {
  const hasGoogleKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;

  const empty: HomeMapData = { points: [], internalCount: 0, externalCount: 0, total: 0, hasGoogleKey, hasOperatingArea: false, areaCities: [], areaLabel: null };
  if (!orgId) return empty;

  const db = createServiceRoleClient();

  // Operating area → active cities (best-effort).
  let areaCities: string[] = [];
  try {
    const { areas } = await getMyOperatingAreas();
    areaCities = [...new Set(areas.filter((a) => a.isActive).map((a) => a.cityName).filter(Boolean))];
  } catch { areaCities = []; }
  const hasOperatingArea = areaCities.length > 0;
  const areaLabel = areaCities.length ? areaCities.slice(0, 3).join(", ") + (areaCities.length > 3 ? "…" : "") : null;
  const cityFilter = filters.city && areaCities.includes(filters.city) ? [filters.city] : areaCities;

  const nowIso = new Date(Date.now() - NEW_WINDOW_MS).toISOString();
  const wantInternal = filters.scope !== "external";
  const wantExternal = filters.scope !== "internal";

  const points: HomeMapPoint[] = [];
  let internalCount = 0;
  let externalCount = 0;

  // ── Internal properties (org inventory) ─────────────────────────────────────
  if (wantInternal && !filters.privateOnly) { // privateOnly is an external-only concept
    try {
      let q = db.from("properties" as never)
        .select("id,title,city,neighborhood,price,monthly_rent,latitude,longitude,listing_kind,type,created_at,primary_image_url")
        .eq("org_id", orgId)
        .not("latitude", "is", null).not("longitude", "is", null)
        .limit(600);
      if (filters.deal !== "all") q = q.eq("listing_kind", filters.deal);
      if (filters.propertyType !== "all") q = q.in("type", TYPE_MAP[filters.propertyType]!.internal);
      if (filters.newOnly) q = q.gte("created_at", nowIso);
      if (filters.priceMin != null) q = q.gte("price", filters.priceMin);
      if (filters.priceMax != null) q = q.lte("price", filters.priceMax);
      if (filters.city && areaCities.includes(filters.city)) q = q.eq("city", filters.city);
      const { data } = await q;
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const lat = num(r.latitude), lng = num(r.longitude);
        if (lat == null || lng == null) continue;
        const isRent = r.listing_kind === "rent";
        const price = isRent ? num(r.monthly_rent) : num(r.price);
        points.push({
          id: `int_${String(r.id)}`, lat, lng, origin: "internal", source: "internal",
          title: String(r.title ?? "נכס מהמשרד"),
          details: [
            [r.city, r.neighborhood].filter(Boolean).join(" · ") || "—",
            `${isRent ? "להשכרה" : "למכירה"} · ${ils(price)}${isRent ? "/חודש" : ""}`,
            "נכס פנימי (מהמשרד)",
          ],
          href: `/properties/${String(r.id)}`,
          imageUrl: typeof r.primary_image_url === "string" && r.primary_image_url ? r.primary_image_url : null,
        });
        internalCount++;
      }
    } catch { /* internal best-effort */ }
  }

  // ── External listings (Yad2 / Madlan / …) scoped to operating area ──────────-
  if (wantExternal) {
    try {
      let q = db.from("external_listings" as never)
        .select("id,title,city,neighborhood,price,property_type,deal_type,source,lat,lng,has_agent,first_seen_at,listing_url,status,images")
        .eq("org_id", orgId).eq("status", "active")
        .not("lat", "is", null).not("lng", "is", null)
        .limit(1000);
      // City scoping is applied in JS with normalized comparison (below) so
      // spelling variants like קריית/קרית don't drop real listings.
      if (filters.deal !== "all") q = q.eq("deal_type", filters.deal);
      if (filters.source !== "all") q = q.eq("source", filters.source);
      if (filters.privateOnly) q = q.eq("has_agent", false);
      if (filters.newOnly) q = q.gte("first_seen_at", nowIso);
      if (filters.priceMin != null) q = q.gte("price", filters.priceMin);
      if (filters.priceMax != null) q = q.lte("price", filters.priceMax);
      if (filters.propertyType !== "all") {
        const tokens = TYPE_MAP[filters.propertyType]!.tokens;
        q = q.or(tokens.map((t) => `property_type.ilike.%${t}%`).join(","));
      }
      const { data } = await q;
      // Normalized operating-area city scope (empty ⇒ no city restriction).
      const allowCities = cityFilter.length ? new Set(cityFilter.map(normCity)) : null;
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const lat = num(r.lat), lng = num(r.lng);
        if (lat == null || lng == null) continue;
        if (allowCities && !allowCities.has(normCity(r.city))) continue; // city-scope (normalized)
        const src = String(r.source ?? "external");
        points.push({
          id: `ext_${String(r.id)}`, lat, lng, origin: "external", source: src,
          title: String(r.title ?? "נכס חיצוני"),
          details: [
            [r.city, r.neighborhood].filter(Boolean).join(" · ") || "—",
            `${r.deal_type === "rent" ? "להשכרה" : "למכירה"} · ${ils(num(r.price))}`,
            `מקור: ${src}${r.has_agent === false ? " · בעל בית פרטי" : ""}`,
          ],
          href: r.listing_url ? String(r.listing_url) : null,
          imageUrl: (() => { const im = Array.isArray(r.images) ? r.images : []; const first = im[0]; return typeof first === "string" ? first : (first && typeof first === "object" && typeof (first as { url?: string }).url === "string" ? (first as { url: string }).url : null); })(),
        });
        externalCount++;
      }
    } catch { /* external best-effort */ }
  }

  return { points, internalCount, externalCount, total: points.length, hasGoogleKey, hasOperatingArea, areaCities, areaLabel };
}
