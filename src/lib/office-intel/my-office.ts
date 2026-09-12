// ============================================================================
// ZONO — MY OFFICE vs MARKET (server-only, READ-ONLY). Ties self-office identity
// to the competitor engine and expresses standing as a SHARE OF ZONO'S OBSERVED
// INVENTORY — never as an absolute market share we cannot know. "נתח מתוך המלאי
// שנצפה על ידי ZONO" is an honest, defensible number: of the listings ZONO has
// actually observed in your city, this fraction is yours.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { localityHe } from "@/lib/geo/locality";
import { resolveSelfOffice, type SelfOfficeResolution } from "./self-office";
import { getOfficeCompetitors, type OfficeCompetitorReport } from "./competitor";

/* eslint-disable @typescript-eslint/no-explicit-any -- shared observed graph outside generated types. */
const clean = (v: unknown): string => String(v ?? "").trim();

export interface MyOfficeShare {
  cityLabel: string | null;
  officeObserved: number;         // office's observed listings in-city
  cityObserved: number;           // total ZONO-observed listings in-city
  sharePct: number;               // officeObserved / cityObserved * 100
  cityRank: number | null;        // office's rank among in-city offices by observed inventory
  cityOfficeCount: number;        // number of offices ZONO observes in-city
}

export interface MyOfficeReport {
  resolution: SelfOfficeResolution;
  share: MyOfficeShare | null;
  competitors: OfficeCompetitorReport | null;
}

async function computeShare(db: any, officeId: string): Promise<MyOfficeShare | null> {
  // Office's observed listings + its city.
  const { data: office } = await (db.from("brokerage_offices" as never).select("id,city").eq("id", officeId).maybeSingle() as any);
  if (!office) return null;

  const { data: links } = await (db.from("brokerage_external_listing_links" as never).select("external_listing_id").eq("office_id", officeId).limit(6000) as any);
  const ids = [...new Set((links ?? []).map((l: any) => clean(l.external_listing_id)).filter(Boolean))] as string[];
  if (!ids.length) return null;

  // Determine the office's dominant observed city from its listings.
  const cityCount = new Map<string, number>();
  const officeObservedIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const { data } = await (db.from("external_listings" as never).select("id,city,status").in("id", ids.slice(i, i + 1000)).neq("status", "removed").limit(1000) as any);
    for (const r of data ?? []) { officeObservedIds.add(String(r.id)); const c = clean(r.city); if (c) cityCount.set(c, (cityCount.get(c) ?? 0) + 1); }
  }
  const officeObserved = officeObservedIds.size;
  const rawCity = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? clean(office.city);
  if (!rawCity) return { cityLabel: null, officeObserved, cityObserved: officeObserved, sharePct: 100, cityRank: null, cityOfficeCount: 1 };

  // Total ZONO-observed listings in that city + per-office breakdown for rank.
  const { count: cityObserved } = await (db.from("external_listings" as never).select("id", { count: "exact", head: true }).eq("city", rawCity).neq("status", "removed") as any);
  const cityTotal = cityObserved ?? officeObserved;

  // Rank: offices by observed listings in this city (bounded aggregation).
  const { data: cityListingRows } = await (db.from("external_listings" as never).select("id").eq("city", rawCity).neq("status", "removed").limit(8000) as any);
  const cityIds = (cityListingRows ?? []).map((r: any) => String(r.id));
  const perOffice = new Map<string, number>();
  for (let i = 0; i < cityIds.length; i += 1000) {
    const { data } = await (db.from("brokerage_external_listing_links" as never).select("office_id,external_listing_id").in("external_listing_id", cityIds.slice(i, i + 1000)).not("office_id", "is", null).limit(50000) as any);
    const seen = new Set<string>();
    for (const r of data ?? []) { const key = `${r.office_id}|${r.external_listing_id}`; if (seen.has(key)) continue; seen.add(key); perOffice.set(String(r.office_id), (perOffice.get(String(r.office_id)) ?? 0) + 1); }
  }
  const ranking = [...perOffice.entries()].sort((a, b) => b[1] - a[1]);
  const rank = ranking.findIndex(([id]) => id === officeId);

  return {
    cityLabel: localityHe(rawCity) || rawCity,
    officeObserved,
    cityObserved: cityTotal,
    sharePct: cityTotal > 0 ? Math.round((officeObserved / cityTotal) * 1000) / 10 : 0,
    cityRank: rank >= 0 ? rank + 1 : null,
    cityOfficeCount: ranking.length,
  };
}

export async function getMyOfficeReport(): Promise<MyOfficeReport> {
  const db = createServiceRoleClient();
  const resolution = await resolveSelfOffice();
  if (resolution.status !== "resolved" || !resolution.officeId) {
    return { resolution, share: null, competitors: null };
  }
  const [share, competitors] = await Promise.all([
    computeShare(db, resolution.officeId).catch(() => null),
    getOfficeCompetitors(resolution.officeId, { limit: 5 }).catch(() => null),
  ]);
  return { resolution, share, competitors };
}
