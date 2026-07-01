// ============================================================================
// 🗺️ Territory Intelligence read model (server-only). Phase 26.6.
// Resolves every listing to its office/broker (reusing the links table), then
// aggregates dominance/market-share by city → neighborhood → street. READ-ONLY.
// No valuation / MAI / discovery / broker-intel / office-inventory changes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normCityKb, makeCityMatch } from "../brokerage-knowledge";
import { resolveBrandBranch } from "../brand-identity/resolver";
import {
  territoryStats, officeDominance, territoryInsights, bandFor, isLuxury, isRental, isCommercial,
} from "./aggregate";
import {
  TERRITORY_VERSION,
  type AttributedListing, type CityTerritoryIntelligence, type TerritoryNode, type HeatCell,
  type OfficeTerritoryIntelligence, type BrokerTerritoryIntelligence, type AreaShare, type TerritoryLevel,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" && v ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : v == null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const DAY = 86400000;
const isRecent = (iso: string | null): boolean => { if (!iso) return false; const d = (Date.now() - new Date(iso).getTime()) / DAY; return Number.isFinite(d) && d >= 0 && d <= 90; };

/** Resolve every city listing to its office + broker (via the links table). */
async function loadAttributedListings(cityRaw: string): Promise<AttributedListing[]> {
  const db = createServiceRoleClient();
  const match = makeCityMatch(cityRaw);
  const stem = cityRaw.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? cityRaw.trim();
  const { data: listingRows } = await db.from("external_listings" as never)
    .select("id,city,city_name,neighborhood,street,price,sqm,area_sqm,property_type,deal_type,listing_type,is_active,published_at,first_seen_at").ilike("city", `%${stem}%`).limit(20000);
  const listings = ((listingRows ?? []) as Row[]).filter((r) => match(r.city) || match((r as Row).city_name));
  if (listings.length === 0) return [];
  const ids = listings.map((r) => s(r.id));

  // Links → listing → office/agent.
  const linkByListing = new Map<string, { officeId: string | null; agentId: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from("brokerage_external_listing_links" as never).select("external_listing_id,office_id,agent_id").in("external_listing_id", ids.slice(i, i + 300)).limit(50000);
    for (const l of (data ?? []) as Row[]) {
      const lid = s(l.external_listing_id); if (!lid) continue;
      const prev = linkByListing.get(lid);
      const officeId = s(l.office_id) || prev?.officeId || null;
      const agentId = s(l.agent_id) || prev?.agentId || null;
      linkByListing.set(lid, { officeId, agentId });
    }
  }
  const agentIds = [...new Set([...linkByListing.values()].map((v) => v.agentId).filter((x): x is string => !!x))];
  const agentOffice = new Map<string, { officeId: string | null; name: string }>();
  for (let i = 0; i < agentIds.length; i += 300) {
    const { data } = await db.from("brokerage_agents" as never).select("id,full_name,office_id").in("id", agentIds.slice(i, i + 300));
    for (const a of (data ?? []) as Row[]) agentOffice.set(s(a.id), { officeId: s(a.office_id) || null, name: s(a.full_name) });
  }
  const officeIds = [...new Set([...linkByListing.values()].map((v) => v.officeId).filter((x): x is string => !!x).concat([...agentOffice.values()].map((v) => v.officeId).filter((x): x is string => !!x)))];
  const officeInfo = new Map<string, { name: string; brand: string | null }>();
  for (let i = 0; i < officeIds.length; i += 300) {
    const { data } = await db.from("brokerage_offices" as never).select("id,name,brand_network").in("id", officeIds.slice(i, i + 300));
    for (const o of (data ?? []) as Row[]) officeInfo.set(s(o.id), { name: s(o.name), brand: s(o.brand_network) || resolveBrandBranch(s(o.name)).brand });
  }

  return listings.map((r) => {
    const lid = s(r.id);
    const link = linkByListing.get(lid);
    const agent = link?.agentId ? agentOffice.get(link.agentId) : undefined;
    const officeId = link?.officeId || agent?.officeId || null;   // explicit link wins, else broker's office
    const office = officeId ? officeInfo.get(officeId) : undefined;
    const price = num(r.price); const sqm = num(r.sqm) ?? num(r.area_sqm);
    const propertyType = s(r.property_type) || null; const dealType = s(r.deal_type) || s(r.listing_type) || null;
    const seenAt = s(r.published_at) || s(r.first_seen_at) || null;
    return {
      listingId: lid, city: s(r.city) || s(r.city_name) || null, neighborhood: s(r.neighborhood) || null, street: s(r.street) || null,
      price, sqm, propertyType, active: r.is_active !== false,
      rental: isRental(propertyType, dealType), commercial: isCommercial(propertyType), luxury: isLuxury(price), recent: isRecent(seenAt),
      officeId, officeName: office?.name ?? null, brand: office?.brand ?? null,
      brokerId: link?.agentId ?? null, brokerName: agent?.name ?? null, seenAt,
    };
  });
}

function nodeFor(level: TerritoryLevel, name: string, parent: string | null, listings: AttributedListing[]): TerritoryNode {
  const stats = territoryStats(listings);
  const dom = officeDominance(listings);
  return {
    level, key: `${level}:${name}`, name, parent, stats,
    leaderOffice: stats.topOffices[0] ?? null, leaderBroker: stats.topBrokers[0] ?? null,
    officeDominance: dom.slice(0, 8), insights: territoryInsights(name, stats, dom),
  };
}
function groupBy(listings: AttributedListing[], key: (l: AttributedListing) => string | null): Map<string, AttributedListing[]> {
  const m = new Map<string, AttributedListing[]>();
  for (const l of listings) { const k = key(l); if (!k) continue; (m.get(k) ?? m.set(k, []).get(k)!).push(l); }
  return m;
}

/** City-level territory intelligence (Parts 1–7,10). */
export async function getCityTerritoryIntelligence(cityRaw: string): Promise<CityTerritoryIntelligence> {
  const all = await loadAttributedListings(cityRaw);
  const notes: string[] = [];
  if (all.length === 0) notes.push("אין מודעות מקושרות לעיר זו — נדרש ייבוא/שיוך מודעות.");
  const cityStats = territoryStats(all);

  const neighborhoods = [...groupBy(all, (l) => l.neighborhood).entries()]
    .map(([name, ls]) => nodeFor("neighborhood", name, cityRaw.trim(), ls))
    .sort((a, b) => b.stats.activeListings - a.stats.activeListings).slice(0, 40);
  const streets = [...groupBy(all, (l) => l.street).entries()]
    .map(([name, ls]) => nodeFor("street", name, cityRaw.trim(), ls))
    .sort((a, b) => b.stats.activeListings - a.stats.activeListings).slice(0, 60);

  const maxSupply = Math.max(1, ...neighborhoods.map((n) => n.stats.activeListings));
  const heatmap: HeatCell[] = neighborhoods.slice(0, 24).map((n) => ({
    key: n.key, name: n.name,
    officeDominance: n.officeDominance[0]?.dominanceScore ?? 0,
    brokerDominance: n.stats.topBrokers[0]?.sharePct ?? 0,
    price: n.stats.medianPrice ? Math.min(100, Math.round((n.stats.medianPrice / 6_000_000) * 100)) : 0,
    luxury: n.stats.luxuryPct, supply: Math.round((n.stats.activeListings / maxSupply) * 100), activity: n.stats.topOffices[0]?.sharePct ?? 0,
  }));

  const insights: string[] = [];
  for (const n of neighborhoods.slice(0, 8)) for (const ins of n.insights) if (insights.length < 12) insights.push(ins);

  return {
    city: cityRaw.trim(), cityNormalized: normCityKb(cityRaw), cityStats, neighborhoods, streets, heatmap, insights,
    totals: { listings: all.length, offices: new Set(all.map((l) => l.officeId).filter(Boolean)).size, brokers: new Set(all.map((l) => l.brokerId).filter(Boolean)).size, neighborhoods: neighborhoods.length, streets: streets.length },
    notes, version: TERRITORY_VERSION,
  };
}

/** Per-area shares for one office/broker (Parts 8/9). */
function areaShares(all: AttributedListing[], filter: (l: AttributedListing) => boolean, level: TerritoryLevel, keyOf: (l: AttributedListing) => string | null): AreaShare[] {
  const areas = groupBy(all, keyOf);
  const out: AreaShare[] = [];
  for (const [name, ls] of areas) {
    const mine = ls.filter(filter);
    if (mine.length === 0) continue;
    const areaActive = ls.filter((l) => l.active).length;
    const myActive = mine.filter((l) => l.active).length;
    const sharePct = areaActive ? Math.round((myActive / areaActive) * 100) : 0;
    const dom = officeDominance(ls);
    const officeId = mine.find((l) => l.officeId)?.officeId ?? null;
    const score = officeId ? (dom.find((d) => d.officeId === officeId)?.dominanceScore ?? 0) : Math.min(100, sharePct);
    out.push({ name, level, sharePct, dominanceScore: score, band: bandFor(score, false), activeListings: myActive });
  }
  return out.sort((a, b) => b.activeListings - a.activeListings || b.sharePct - a.sharePct);
}

export async function getOfficeTerritory(officeId: string, cityRaw?: string | null): Promise<OfficeTerritoryIntelligence | null> {
  const db = createServiceRoleClient();
  const { data: off } = await db.from("brokerage_offices" as never).select("id,name,brand_network,city").eq("id", officeId).maybeSingle();
  if (!off) return null;
  const o = off as Row;
  const city = cityRaw || s(o.city);
  const all = city ? await loadAttributedListings(city) : [];
  const mine = (l: AttributedListing) => l.officeId === officeId;
  const nbrs = areaShares(all, mine, "neighborhood", (l) => l.neighborhood);
  const streets = areaShares(all, mine, "street", (l) => l.street);
  const overallActive = all.filter((l) => mine(l) && l.active).length;

  const strongAreas = [...nbrs, ...streets].filter((a) => a.band === "Leader" || a.band === "Strong").slice(0, 8);
  const weakAreas = nbrs.filter((a) => a.sharePct < 5 && a.activeListings > 0).slice(0, 6);
  // Expansion: neighborhoods with real supply where this office has NO presence.
  const present = new Set(nbrs.map((a) => a.name));
  const supplyByNbr = new Map<string, number>();
  for (const l of all) if (l.neighborhood && l.active) supplyByNbr.set(l.neighborhood, (supplyByNbr.get(l.neighborhood) ?? 0) + 1);
  const expansionOpportunities = [...supplyByNbr.entries()].filter(([name]) => !present.has(name)).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, supply]) => ({ name, level: "neighborhood" as TerritoryLevel, reason: `${supply} מודעות פעילות באזור ללא נוכחות של המשרד — הזדמנות התרחבות` }));

  const insights: string[] = [];
  const brand = s(o.brand_network) || resolveBrandBranch(s(o.name)).brand;
  const officeName = s(o.name);
  if (nbrs[0] && nbrs[0].sharePct >= 20) insights.push(`${officeName} שולט ב${nbrs[0].name} עם ${nbrs[0].sharePct}% מהמודעות הפעילות.`);
  for (const w of weakAreas.slice(0, 2)) insights.push(`למשרד זה כמעט אין פעילות ב${w.name} (${w.sharePct}%).`);
  for (const e of expansionOpportunities.slice(0, 2)) insights.push(`הזדמנות: ${e.name} — ${e.reason}.`);

  return { officeId, officeName, brand, topNeighborhoods: nbrs.slice(0, 10), topStreets: streets.slice(0, 10), overallActiveListings: overallActive, strongAreas, weakAreas, expansionOpportunities, insights: insights.slice(0, 6), version: TERRITORY_VERSION };
}

export async function getBrokerTerritory(brokerId: string): Promise<BrokerTerritoryIntelligence | null> {
  const db = createServiceRoleClient();
  const { data: ag } = await db.from("brokerage_agents" as never).select("id,full_name,city").eq("id", brokerId).maybeSingle();
  if (!ag) return null;
  const a = ag as Row;
  const city = s(a.city);
  const all = city ? await loadAttributedListings(city) : [];
  const mine = (l: AttributedListing) => l.brokerId === brokerId;
  const myListings = all.filter(mine);
  const nbrs = areaShares(all, mine, "neighborhood", (l) => l.neighborhood).slice(0, 10);
  const streets = areaShares(all, mine, "street", (l) => l.street).slice(0, 10);
  const st = territoryStats(myListings);
  const specialties: string[] = [];
  if (st.propertyTypes[0] && st.propertyTypes[0].count >= 2) specialties.push(`מתמחה: ${st.propertyTypes[0].key}`);
  if (st.luxuryPct >= 30) specialties.push("יוקרה");
  if (st.commercialPct >= 30) specialties.push("מסחרי");
  const insights: string[] = [];
  if (nbrs[0]) insights.push(`המתווך פעיל בעיקר ב${nbrs[0].name} (${nbrs[0].activeListings} מודעות פעילות).`);
  return { brokerId, brokerName: s(a.full_name), topNeighborhoods: nbrs, topStreets: streets, avgPrice: st.avgPrice, specialties, insights, version: TERRITORY_VERSION };
}

/** Neighborhood / street profile = the node from the city intelligence. */
export async function getAreaProfile(cityRaw: string, level: "neighborhood" | "street", name: string): Promise<TerritoryNode | null> {
  const intel = await getCityTerritoryIntelligence(cityRaw);
  const list = level === "neighborhood" ? intel.neighborhoods : intel.streets;
  return list.find((n) => n.name === name) ?? null;
}
