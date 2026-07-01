// ============================================================================
// ⚔️ Competitive Intelligence read model (server-only). Phase 26.7.
// Reuses Territory Intelligence's attributed listings; computes market + office
// competitive intelligence. READ-ONLY. No valuation / MAI / discovery changes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normCityKb, makeCityMatch } from "../brokerage-knowledge";
import { loadAttributedListings } from "../territory-intelligence";
import type { AttributedListing } from "../territory-intelligence/types";
import {
  officeAggregates, marketSnapshot, competitiveMatrix, swot, detectOpportunities, strategicInsights,
} from "./compute";
import {
  COMPETITIVE_VERSION,
  type CityCompetitiveDashboard, type OfficeCompetitiveProfile, type ThreatLevel, type CompetitorRef,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" && v ? v : "");
const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

async function verifiedOfficeCount(cityRaw: string): Promise<number> {
  const db = createServiceRoleClient();
  const match = makeCityMatch(cityRaw);
  const { data } = await db.from("brokerage_offices" as never).select("city,status").limit(20000);
  return ((data ?? []) as Row[]).filter((o) => (s(o.status) || "active") === "active" && match(o.city)).length;
}
function topBrokers(listings: AttributedListing[]): { id: string; name: string; active: number }[] {
  const m = new Map<string, { name: string; active: number }>();
  for (const l of listings) { if (!l.brokerId || !l.active) continue; const e = m.get(l.brokerId) ?? { name: l.brokerName ?? l.brokerId, active: 0 }; e.active++; m.set(l.brokerId, e); }
  return [...m.entries()].map(([id, v]) => ({ id, name: v.name, active: v.active })).sort((a, b) => b.active - a.active).slice(0, 12);
}
const luxRefs = (aggs: ReturnType<typeof officeAggregates>, cityLux: number): CompetitorRef[] =>
  [...aggs].filter((a) => a.luxury > 0).sort((a, b) => b.luxury - a.luxury).slice(0, 8).map((a) => ({ officeId: a.officeId, officeName: a.officeName, brand: a.brand, value: pctOf(a.luxury, cityLux), note: `${pctOf(a.luxury, cityLux)}% מהיוקרה` }));
const commRefs = (aggs: ReturnType<typeof officeAggregates>, cityComm: number): CompetitorRef[] =>
  [...aggs].filter((a) => a.commercial > 0).sort((a, b) => b.commercial - a.commercial).slice(0, 8).map((a) => ({ officeId: a.officeId, officeName: a.officeName, brand: a.brand, value: pctOf(a.commercial, cityComm), note: `${pctOf(a.commercial, cityComm)}% מהמסחרי` }));

/** City competitive dashboard (Part 9). */
export async function getCityCompetitiveDashboard(cityRaw: string): Promise<CityCompetitiveDashboard> {
  const listings = await loadAttributedListings(cityRaw);
  const aggs = officeAggregates(listings);
  const verified = await verifiedOfficeCount(cityRaw).catch(() => 0);
  const snapshot = marketSnapshot(cityRaw.trim(), listings, aggs, verified);
  const cityLux = listings.filter((l) => l.luxury).length;
  const cityComm = listings.filter((l) => l.commercial).length;
  const notes: string[] = [];
  if (listings.length === 0) notes.push("אין מודעות מקושרות לעיר — נדרש ייבוא/שיוך (הפעל שיוך נכסי סוכנים).");

  return {
    city: cityRaw.trim(), cityNormalized: normCityKb(cityRaw), snapshot,
    topOffices: aggs.slice(0, 10),
    topGrowing: [...aggs].filter((a) => a.growthPct > 0).sort((a, b) => b.growthPct - a.growthPct).slice(0, 8),
    topDeclining: [...aggs].filter((a) => a.growthPct < 0).sort((a, b) => a.growthPct - b.growthPct).slice(0, 8),
    topBrokers: topBrokers(listings),
    largestInventories: [...aggs].sort((a, b) => b.activeListings - a.activeListings).slice(0, 8),
    highestLuxuryShare: luxRefs(aggs, cityLux),
    highestCommercialShare: commRefs(aggs, cityComm),
    marketLeaders: aggs.filter((a) => a.listingSharePct >= 15).slice(0, 8),
    emergingAreas: detectOpportunities(listings).filter((o) => /צומח|היצע גבוה/.test(o.title)).slice(0, 6),
    insights: strategicInsights(aggs, listings),
    notes, version: COMPETITIVE_VERSION,
  };
}

/** Office competitive profile (Part 8). */
export async function getOfficeCompetitiveProfile(officeId: string, cityRaw?: string | null): Promise<OfficeCompetitiveProfile | null> {
  const db = createServiceRoleClient();
  const { data: off } = await db.from("brokerage_offices" as never).select("id,name,brand_network,city").eq("id", officeId).maybeSingle();
  if (!off) return null;
  const o = off as Row;
  const city = cityRaw || s(o.city);
  const listings = city ? await loadAttributedListings(city) : [];
  const aggs = officeAggregates(listings);
  const target = aggs.find((a) => a.officeId === officeId)
    ?? { officeId, officeName: s(o.name), brand: s(o.brand_network) || null, activeListings: 0, totalListings: 0, brokers: 0, neighborhoods: [], streets: 0, luxury: 0, commercial: 0, rental: 0, avgPrice: null, avgPricePerSqm: null, recent60: 0, prior60: 0, growthPct: 0, momentum: "stable" as const, listingSharePct: 0, brokerSharePct: 0, brokerDensity: 0, rank: aggs.length + 1 };
  const cityLux = listings.filter((l) => l.luxury).length;
  const cityComm = listings.filter((l) => l.commercial).length;
  const cityRental = listings.filter((l) => l.rental).length;
  const matrix = competitiveMatrix(target, aggs);
  const growingComp = matrix.fastestGrowing[0];
  const threatLevel: ThreatLevel = growingComp && growingComp.value >= 30 && target.momentum !== "growing" ? "high" : growingComp && growingComp.value >= 15 ? "moderate" : "low";

  return {
    officeId, officeName: target.officeName, brand: target.brand,
    marketRank: target.rank, totalOffices: aggs.length,
    listingSharePct: target.listingSharePct, brokerSharePct: target.brokerSharePct,
    activeListings: target.activeListings, brokers: target.brokers, neighborhoods: target.neighborhoods.length,
    luxurySharePct: pctOf(target.luxury, cityLux), commercialSharePct: pctOf(target.commercial, cityComm), rentalSharePct: pctOf(target.rental, cityRental),
    avgPrice: target.avgPrice, avgPricePerSqm: target.avgPricePerSqm,
    growthPct: target.growthPct, momentum: target.momentum, threatLevel,
    competitors: matrix, swot: swot(target, aggs, listings),
    opportunities: detectOpportunities(listings).filter((op) => !target.neighborhoods.includes(op.area ?? "")).slice(0, 6),
    insights: strategicInsights(aggs.filter((a) => a.officeId === officeId || a.rank <= 3), listings),
    rankExplanation: `#${target.rank} כי מחזיק ${target.listingSharePct}% מהמלאי הפעיל ב-${target.neighborhoods.length} שכונות (${target.activeListings} מודעות).`,
    version: COMPETITIVE_VERSION,
  };
}
