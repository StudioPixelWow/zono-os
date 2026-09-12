// ============================================================================
// ZONO — COMPETITOR INTELLIGENCE selector (server-only, READ-ONLY).
//
// Computes an office's direct competitors from the SHARED observed market graph
// (not org-scoped — competition is about the real market, not one org's view).
// Server-side aggregation only: we bound the work to the target office's TERRITORY
// (its neighborhoods + city), build a compact activity footprint per office in
// that locale, score with the pure competitor-core, and return only a small model
// to the client — never thousands of raw listings.
//
// Also powers head-to-head Office Comparison and deterministic, data-backed
// Opportunity insights (AI phrasing, but every number comes from observed data —
// nothing is invented).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { localityHe } from "@/lib/geo/locality";
import {
  rankCompetitors, scoreCompetitor, computeMomentum,
  type OfficeFootprint, type CompetitorScore, type MomentumScore,
} from "./competitor-core";

/* eslint-disable @typescript-eslint/no-explicit-any -- brokerage_* + external_listings are the shared observed graph, not in generated types; loose shape matches the other office-intel selectors. */

const DAY = 86_400_000;
const CAP = 6000; // hard bound on locale listings pulled into memory
const clean = (v: unknown): string => String(v ?? "").trim();

interface ListingRow { id: string; neighborhood: string | null; city: string | null; property_type: string | null; first_seen_at: string | null; contact_name: string | null }
interface OfficeIdentityRow { id: string; name: string; brand: string | null; city: string | null }

export interface OfficeKpis { total: number; new7d: number; new30d: number; neighborhoods: number; brokers: number }
export interface CompetitorView {
  officeId: string; name: string; brand: string | null; city: string | null;
  score: number; overlapPct: number; sharedNeighborhoods: string[]; reasons: string[];
  kpis: OfficeKpis; signal: CompetitorScore["signal"];
}
export interface OfficeCompetitorReport {
  target: { officeId: string; name: string; brand: string | null; city: string | null; kpis: OfficeKpis; momentum: MomentumScore };
  competitors: CompetitorView[];
  insights: string[];
  generatedAt: string;
}

// ── low-level loaders ────────────────────────────────────────────────────────

async function listingIdsForOffice(db: any, officeId: string): Promise<string[]> {
  const { data } = await (db.from("brokerage_external_listing_links" as never)
    .select("external_listing_id").eq("office_id", officeId).limit(CAP) as any);
  return [...new Set((data ?? []).map((r: any) => clean(r.external_listing_id)).filter(Boolean))] as string[];
}

async function loadListings(db: any, ids: string[]): Promise<ListingRow[]> {
  if (!ids.length) return [];
  const out: ListingRow[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const { data } = await (db.from("external_listings" as never)
      .select("id,neighborhood,city,property_type,first_seen_at,contact_name,status")
      .in("id", chunk).neq("status", "removed").limit(1000) as any);
    for (const r of data ?? []) out.push(r as ListingRow);
    if (out.length >= CAP) break;
  }
  return out;
}

function footprintFrom(officeId: string, rows: ListingRow[]): OfficeFootprint & { kpis: OfficeKpis } {
  const neighborhoods: Record<string, number> = {};
  const cities: Record<string, number> = {};
  const propertyTypes: Record<string, number> = {};
  const brokers = new Set<string>();
  const now = Date.now();
  let new7d = 0, new30d = 0;
  for (const r of rows) {
    const nb = clean(r.neighborhood); if (nb) neighborhoods[nb] = (neighborhoods[nb] ?? 0) + 1;
    const ct = localityHe(clean(r.city)) || clean(r.city); if (ct) cities[ct] = (cities[ct] ?? 0) + 1;
    const pt = clean(r.property_type); if (pt) propertyTypes[pt] = (propertyTypes[pt] ?? 0) + 1;
    const cn = clean(r.contact_name).toLowerCase(); if (cn) brokers.add(cn);
    const t = r.first_seen_at ? Date.parse(r.first_seen_at) : NaN;
    if (Number.isFinite(t)) { if (now - t < 7 * DAY) new7d++; if (now - t < 30 * DAY) new30d++; }
  }
  const kpis: OfficeKpis = { total: rows.length, new7d, new30d, neighborhoods: Object.keys(neighborhoods).length, brokers: brokers.size };
  return { officeId, neighborhoods, cities, propertyTypes, total: rows.length, new30d, brokers: brokers.size, kpis };
}

async function officeIdentities(db: any, ids: string[]): Promise<Map<string, OfficeIdentityRow>> {
  const map = new Map<string, OfficeIdentityRow>();
  if (!ids.length) return map;
  const { data } = await (db.from("brokerage_offices" as never)
    .select("id,name,brand_network,city").in("id", ids).limit(ids.length) as any);
  for (const r of data ?? []) map.set(String(r.id), { id: String(r.id), name: clean(r.name) || "משרד", brand: (r.brand_network as string) ?? null, city: localityHe(clean(r.city)) || null });
  return map;
}

const overlapPct = (s: CompetitorScore): number => Math.round(s.signal.neighborhoodOverlap * 100);

// ── main: competitors of one office ──────────────────────────────────────────

export async function getOfficeCompetitors(officeId: string, opts: { limit?: number } = {}): Promise<OfficeCompetitorReport | null> {
  const db = createServiceRoleClient();
  const targetIdentityMap = await officeIdentities(db, [officeId]);
  const targetIdentity = targetIdentityMap.get(officeId);
  if (!targetIdentity) return null;

  const targetListingIds = await listingIdsForOffice(db, officeId);
  const targetRows = await loadListings(db, targetListingIds);
  const targetFp = footprintFrom(officeId, targetRows);

  // Territory: the target's neighborhoods + raw cities (raw for candidate matching).
  const targetHoods = [...new Set(targetRows.map((r) => clean(r.neighborhood)).filter(Boolean))];
  const targetRawCities = [...new Set(targetRows.map((r) => clean(r.city)).filter(Boolean))];

  // Discover locale listings: anything in the target's neighborhoods or cities.
  const localeIds = new Set<string>();
  const discover = async (col: string, vals: string[]) => {
    for (let i = 0; i < vals.length; i += 40) {
      const chunk = vals.slice(i, i + 40);
      const { data } = await (db.from("external_listings" as never)
        .select("id").in(col, chunk).neq("status", "removed").limit(CAP) as any);
      for (const r of data ?? []) localeIds.add(String(r.id));
      if (localeIds.size >= CAP) return;
    }
  };
  if (targetHoods.length) await discover("neighborhood", targetHoods);
  if (targetRawCities.length && localeIds.size < CAP) await discover("city", targetRawCities);
  const localeListingIds = [...localeIds];

  // Which offices own those locale listings? (links, chunked)
  const linkRows: Array<{ office_id: string; external_listing_id: string }> = [];
  for (let i = 0; i < localeListingIds.length; i += 1000) {
    const chunk = localeListingIds.slice(i, i + 1000);
    const { data } = await (db.from("brokerage_external_listing_links" as never)
      .select("office_id,external_listing_id").in("external_listing_id", chunk).not("office_id", "is", null).limit(50000) as any);
    for (const r of data ?? []) linkRows.push({ office_id: String(r.office_id), external_listing_id: clean(r.external_listing_id) });
  }

  // Load locale listing fields once, index by id.
  const localeRows = await loadListings(db, localeListingIds);
  const byId = new Map<string, ListingRow>(localeRows.map((r) => [String(r.id), r]));

  // Build per-office footprints over the locale (exclude the target itself here).
  const perOffice = new Map<string, ListingRow[]>();
  for (const lk of linkRows) {
    if (lk.office_id === officeId) continue;
    const row = byId.get(lk.external_listing_id); if (!row) continue;
    const arr = perOffice.get(lk.office_id) ?? []; arr.push(row); perOffice.set(lk.office_id, arr);
  }
  const candidateFps = [...perOffice.entries()].map(([id, rows]) => footprintFrom(id, rows));

  const ranked = rankCompetitors(targetFp, candidateFps, { limit: opts.limit ?? 6, minScore: 8 });
  const identities = await officeIdentities(db, ranked.map((r) => r.officeId));
  const kpiById = new Map(candidateFps.map((f) => [f.officeId, f.kpis]));

  const competitors: CompetitorView[] = ranked.map((s) => {
    const idn = identities.get(s.officeId);
    return {
      officeId: s.officeId, name: idn?.name ?? "משרד", brand: idn?.brand ?? null, city: idn?.city ?? null,
      score: s.score, overlapPct: overlapPct(s), sharedNeighborhoods: s.sharedNeighborhoods, reasons: s.reasons,
      kpis: kpiById.get(s.officeId) ?? { total: 0, new7d: 0, new30d: 0, neighborhoods: 0, brokers: 0 },
      signal: s.signal,
    };
  });

  const momentum = computeMomentum({
    new7d: targetFp.kpis.new7d, new30d: targetFp.kpis.new30d, total: targetFp.kpis.total,
    neighborhoods: targetFp.kpis.neighborhoods, activeBrokers: targetFp.kpis.brokers,
  });

  return {
    target: { officeId, name: targetIdentity.name, brand: targetIdentity.brand, city: targetIdentity.city, kpis: targetFp.kpis, momentum },
    competitors,
    insights: buildInsights(targetFp, targetIdentity.name, competitors, perOffice),
    generatedAt: new Date().toISOString(),
  };
}

// ── Opportunity Intelligence — deterministic, data-backed, no invented numbers ──

function buildInsights(
  target: OfficeFootprint & { kpis: OfficeKpis }, targetName: string,
  competitors: CompetitorView[], perOffice: Map<string, ListingRow[]>,
): string[] {
  const out: string[] = [];
  if (!competitors.length) {
    out.push("ZONO עדיין לא זיהתה מתחרים ישירים עם חפיפה טריטוריאלית משמעותית.");
    return out;
  }
  const top = competitors[0];
  out.push(`המתחרה הישיר החזק ביותר: ${top.name}${top.brand ? ` (${top.brand})` : ""} — חפיפה של ${top.overlapPct}% במלאי הנצפה, ${top.sharedNeighborhoods.length} שכונות משותפות.`);

  // Neighborhoods where competitors are active but the target is NOT (whitespace).
  const targetHoods = new Set(Object.keys(target.neighborhoods));
  const rivalHoodCount = new Map<string, number>();
  for (const rows of perOffice.values()) {
    const seen = new Set<string>();
    for (const r of rows) { const nb = clean(r.neighborhood); if (nb && !targetHoods.has(nb)) seen.add(nb); }
    for (const nb of seen) rivalHoodCount.set(nb, (rivalHoodCount.get(nb) ?? 0) + 1);
  }
  const whitespace = [...rivalHoodCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (whitespace.length) {
    out.push(`הזדמנות טריטוריה: ${whitespace.map(([nb, n]) => `${nb} (${n} מתחרים פעילים, אתה עדיין לא)`).join(" · ")}.`);
  }

  // Momentum edge: is the target adding inventory faster than its top rival?
  if (top.kpis.new30d > 0 || target.kpis.new30d > 0) {
    if (target.kpis.new30d > top.kpis.new30d) out.push(`אתה מוביל בקצב: ${target.kpis.new30d} מודעות חדשות ב-30 יום מול ${top.kpis.new30d} של ${top.name}.`);
    else if (top.kpis.new30d > target.kpis.new30d) out.push(`${top.name} מוביל בקצב הפרסום (${top.kpis.new30d} מול ${target.kpis.new30d} ב-30 יום) — פער לסגירה.`);
  }
  return out;
}

// ── Head-to-head Office Comparison (A vs B) ──────────────────────────────────

export interface OfficeComparison {
  a: { officeId: string; name: string; brand: string | null; city: string | null; kpis: OfficeKpis; momentum: MomentumScore };
  b: { officeId: string; name: string; brand: string | null; city: string | null; kpis: OfficeKpis; momentum: MomentumScore };
  competitionScore: number; // how directly they compete (0..100)
  overlapPct: number;
  sharedNeighborhoods: string[];
  leads: { axis: string; winner: "a" | "b" | "tie"; aValue: number; bValue: number }[];
  generatedAt: string;
}

export async function getOfficeComparison(aId: string, bId: string): Promise<OfficeComparison | null> {
  if (aId === bId) return null;
  const db = createServiceRoleClient();
  const idents = await officeIdentities(db, [aId, bId]);
  const ia = idents.get(aId), ib = idents.get(bId);
  if (!ia || !ib) return null;

  const [aRows, bRows] = await Promise.all([
    loadListings(db, await listingIdsForOffice(db, aId)),
    loadListings(db, await listingIdsForOffice(db, bId)),
  ]);
  const fa = footprintFrom(aId, aRows), fb = footprintFrom(bId, bRows);
  const s = scoreCompetitor(fa, fb);

  const momentum = (f: typeof fa): MomentumScore => computeMomentum({ new7d: f.kpis.new7d, new30d: f.kpis.new30d, total: f.kpis.total, neighborhoods: f.kpis.neighborhoods, activeBrokers: f.kpis.brokers });
  const lead = (axis: string, a: number, b: number) => ({ axis, winner: a === b ? "tie" : a > b ? "a" : "b" as "a" | "b" | "tie", aValue: a, bValue: b });

  return {
    a: { officeId: aId, name: ia.name, brand: ia.brand, city: ia.city, kpis: fa.kpis, momentum: momentum(fa) },
    b: { officeId: bId, name: ib.name, brand: ib.brand, city: ib.city, kpis: fb.kpis, momentum: momentum(fb) },
    competitionScore: s?.score ?? 0,
    overlapPct: s ? overlapPct(s) : 0,
    sharedNeighborhoods: s?.sharedNeighborhoods ?? [],
    leads: [
      lead("מלאי נצפה", fa.kpis.total, fb.kpis.total),
      lead("חדשים 30 יום", fa.kpis.new30d, fb.kpis.new30d),
      lead("שכונות פעילות", fa.kpis.neighborhoods, fb.kpis.neighborhoods),
      lead("מתווכים פעילים", fa.kpis.brokers, fb.kpis.brokers),
    ],
    generatedAt: new Date().toISOString(),
  };
}
