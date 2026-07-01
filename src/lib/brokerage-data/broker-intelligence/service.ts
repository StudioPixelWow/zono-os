// ============================================================================
// 🧠 Broker Intelligence read model (server-only). Phase 26.5 · Part 1/3.
// Builds a per-broker profile + per-office broker ranking from EXISTING data
// (agents + external_listing_links + external_listings). READ-ONLY. No fakes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { classifyBrokerStatus, priceStats, specializationTags, dataQuality, rankBrokers } from "./logic";
import { BROKER_INTELLIGENCE_VERSION, type BrokerIntelligenceProfile, type BrokerRankCard } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" && v ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : v == null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const DAY = 86400000;
const daysSince = (iso: string): number | null => { if (!iso) return null; const d = (Date.now() - new Date(iso).getTime()) / DAY; return Number.isFinite(d) && d >= 0 ? Math.round(d) : null; };

async function listingsForAgent(db: ReturnType<typeof createServiceRoleClient>, agentId: string): Promise<{ ids: string[]; conflictOffices: Set<string> }> {
  const { data } = await db.from("brokerage_external_listing_links" as never).select("external_listing_id,office_id").eq("agent_id", agentId).limit(20000);
  const ids = new Set<string>(); const conflictOffices = new Set<string>();
  for (const r of (data ?? []) as Row[]) { const lid = s(r.external_listing_id); if (lid) ids.add(lid); const off = s(r.office_id); if (off) conflictOffices.add(off); }
  return { ids: [...ids], conflictOffices };
}

/** Full intelligence profile for one broker. */
export async function getBrokerIntelligenceProfile(brokerId: string): Promise<BrokerIntelligenceProfile | null> {
  const db = createServiceRoleClient();
  const { data: agentRow } = await db.from("brokerage_agents" as never).select("*").eq("id", brokerId).maybeSingle();
  if (!agentRow) return null;
  const a = agentRow as Row;
  const officeId = s(a.office_id) || null;
  let officeName: string | null = null;
  if (officeId) { const { data: off } = await db.from("brokerage_offices" as never).select("name").eq("id", officeId).maybeSingle(); officeName = off ? s((off as Row).name) : null; }

  const { ids, conflictOffices } = await listingsForAgent(db, brokerId);
  const conflictingOffice = !!officeId && [...conflictOffices].some((o) => o !== officeId);

  const details: Row[] = [];
  for (let i = 0; i < Math.min(ids.length, 4000); i += 300) {
    const { data } = await db.from("external_listings" as never).select("id,city,neighborhood,property_type,price,sqm,area_sqm,source,is_active,published_at,first_seen_at").in("id", ids.slice(i, i + 300));
    for (const r of (data ?? []) as Row[]) details.push(r);
  }

  let active = 0; let lastSeen: string | null = null; let firstSeen: string | null = null; let recent = 0;
  const cities: string[] = [], neigh: string[] = [], types: string[] = [], sources: string[] = [];
  const prices: number[] = [], sqms: number[] = [], ppsqms: number[] = [];
  for (const d of details) {
    if (d.is_active !== false) active++;
    const seen = s(d.published_at) || s(d.first_seen_at);
    if (seen) { if (!lastSeen || seen > lastSeen) lastSeen = seen; if (!firstSeen || seen < firstSeen) firstSeen = seen; const dd = daysSince(seen); if (dd != null && dd <= 90) recent++; }
    if (s(d.city)) cities.push(s(d.city)); if (s(d.neighborhood)) neigh.push(s(d.neighborhood));
    if (s(d.property_type)) types.push(s(d.property_type)); if (s(d.source)) sources.push(s(d.source));
    const p = num(d.price), sq = num(d.sqm) ?? num(d.area_sqm);
    if (p && p > 0) prices.push(p); if (sq && sq > 0) sqms.push(sq); if (p && p > 0 && sq && sq > 0) ppsqms.push(Math.round(p / sq));
  }
  const uCities = [...new Set(cities)], uNeigh = [...new Set(neigh)], uTypes = [...new Set(types)], uSources = [...new Set(sources)];
  const ps = priceStats(prices, sqms, ppsqms);
  const lastListingDays = lastSeen ? daysSince(lastSeen) : null;
  const { status, reason } = classifyBrokerStatus({ lastListingDays, activeListings: active, recentListings: recent, conflictingOffice, hasCurrentOffice: !!officeId, totalListings: ids.length });
  const phone = s(a.primary_phone) || s(a.whatsapp_phone) || null;

  return {
    id: brokerId, name: s(a.full_name), normalizedName: s(a.normalized_name) || null,
    currentOfficeId: officeId, currentOfficeName: officeName, previousOfficeId: s(a.previous_office_id) || null,
    confidence: Number(a.confidence_score ?? 0), verificationStatus: s(a.status) || null,
    activeListings: active, historicalListings: Math.max(0, ids.length - active), totalListings: ids.length, soldListings: null,
    sourcePortals: uSources, phone, contactPoints: [phone, s(a.primary_email)].filter(Boolean) as string[],
    cities: uCities, neighborhoods: uNeigh.slice(0, 40), propertyTypes: uTypes,
    priceStats: ps, activityLevel: status, status, statusReason: reason,
    lastSeenAt: lastSeen || s(a.last_seen_at) || null, firstSeenAt: firstSeen || s(a.first_seen_at) || null,
    marketAreas: [...uCities, ...uNeigh].slice(0, 20),
    specializationTags: specializationTags(types, uNeigh, ps.avgPrice),
    dataQualityScore: dataQuality({ hasPhone: !!phone, hasOffice: !!officeId, hasCity: uCities.length > 0, listings: ids.length, hasTypes: uTypes.length > 0, hasPrices: prices.length > 0 }),
  };
}

/** Ranked broker cards for an office (Part 3). Insufficient data keeps natural order. */
export async function getOfficeBrokerRanking(officeId: string): Promise<BrokerRankCard[]> {
  const db = createServiceRoleClient();
  const { data: agentRows } = await db.from("brokerage_agents" as never).select("id,full_name,city,confidence_score").eq("office_id", officeId).limit(2000);
  const brokers = (agentRows ?? []) as Row[];
  if (brokers.length === 0) return [];
  const ids = brokers.map((b) => s(b.id));
  const { data: linkRows } = await db.from("brokerage_external_listing_links" as never).select("external_listing_id,agent_id").in("agent_id", ids).limit(50000);
  const byBroker = new Map<string, Set<string>>();
  for (const r of (linkRows ?? []) as Row[]) { const aid = s(r.agent_id), lid = s(r.external_listing_id); if (aid && lid) (byBroker.get(aid) ?? byBroker.set(aid, new Set()).get(aid)!).add(lid); }
  // Listing activity/details.
  const allIds = [...new Set([...byBroker.values()].flatMap((set) => [...set]))];
  const active = new Set<string>(); const priceOf = new Map<string, number>(); const neighOf = new Map<string, string>(); const recentSet = new Set<string>();
  for (let i = 0; i < Math.min(allIds.length, 4000); i += 300) {
    const { data } = await db.from("external_listings" as never).select("id,neighborhood,price,is_active,published_at,first_seen_at").in("id", allIds.slice(i, i + 300));
    for (const r of (data ?? []) as Row[]) { const id = s(r.id); if (r.is_active !== false) active.add(id); const p = num(r.price); if (p && p > 0) priceOf.set(id, p); if (s(r.neighborhood)) neighOf.set(id, s(r.neighborhood)); const seen = s(r.published_at) || s(r.first_seen_at); if (seen) { const dd = daysSince(seen); if (dd != null && dd <= 90) recentSet.add(id); } }
  }
  const cards: BrokerRankCard[] = brokers.map((b) => {
    const set = byBroker.get(s(b.id)) ?? new Set<string>();
    const listIds = [...set];
    const neighs = [...new Set(listIds.map((l) => neighOf.get(l)).filter(Boolean) as string[])];
    return {
      id: s(b.id), name: s(b.full_name), status: "UNKNOWN",
      activeListings: listIds.filter((l) => active.has(l)).length, totalListings: listIds.length,
      recentListings: listIds.filter((l) => recentSet.has(l)).length,
      neighborhoods: neighs.length, priceVolume: listIds.reduce((n, l) => n + (priceOf.get(l) ?? 0), 0),
      confidence: Number(b.confidence_score ?? 0), cities: s(b.city) ? [s(b.city)] : [], topAreas: neighs.slice(0, 3),
    };
  });
  return rankBrokers(cards);
}

export { BROKER_INTELLIGENCE_VERSION };
