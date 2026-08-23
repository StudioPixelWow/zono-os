// ============================================================================
// ZONO — Office Intelligence COCKPIT · server aggregation (server-only).
// ----------------------------------------------------------------------------
// The ONE selector for the rebuilt /brokerage-data/offices. It fixes the P0 by
// NOT territory-cutting: it reads the shared detected office/agent graph
// (brokerage_offices + brokerage_agents, via service role — the same pattern as
// the canonical brokerage-data overview, since this is public observed-market
// data, never private CRM) and joins it to THIS org's observed listing→office
// links (brokerage_external_listing_links, org-scoped) + the org's external
// listings (for areas / property types / geography). It aggregates per office
// server-side (only a compact model + shown-office detail reach the client) and
// surfaces the large UNASSIGNED pool honestly. No fabricated market share/trends.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { externalListingRepository } from "@/lib/external-listings/repository";
import { buildOfficeCockpit, type OfficeCockpit, type OfficeRecord, type OfficeFilters } from "./cockpit";
import { officeInTerritory } from "./office-territory";
import { getOrgIntelligenceTerritory } from "@/lib/brokerage-data/territory";

const DAY = 86_400_000;
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const ms = (v: unknown): number | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };
function topCounts(items: (string | null)[], limit: number): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) { const k = (it ?? "").trim(); if (!k) continue; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
function avg(xs: number[]): number | null { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

export interface OfficeCockpitBundle { cockpit: OfficeCockpit; detail: Record<string, OfficeRecord> }

// The brokerage_* tables aren't in the generated Database types (shared observed-
// market graph). Read them through a minimal loose query shape — the same
// `as never` escape hatch the canonical brokerage-data selectors use.
interface LooseQuery {
  select: (cols: string) => LooseQuery;
  eq: (c: string, v: string) => LooseQuery;
  neq: (c: string, v: string) => LooseQuery;
  not: (c: string, op: string, v: string | null) => LooseQuery;
  limit: (n: number) => Promise<{ data: unknown }>;
}
type LooseDb = { from: (t: string) => LooseQuery };

interface ListingLite { neighborhood: string | null; city: string | null; propertyType: string | null; price: number | null; firstSeenMs: number | null; lat: number | null; lng: number | null }

export async function getOfficeCockpit(filters: OfficeFilters): Promise<OfficeCockpitBundle> {
  const now = Date.now();
  const db = createServiceRoleClient() as unknown as LooseDb;
  let orgId: string | null = null;
  try { orgId = (await getSessionContext()).profile?.org_id ?? null; } catch { /* ignore */ }

  // ── P0: the office universe is THIS org's territory, resolved from the ONE
  // canonical source (organization_operating_localities → israel_localities), never
  // the global detected-office graph and never the looser territory_profiles. An
  // office appears only when its CITY exactly matches (male/haser-folded) one of the
  // org's operating cities OR the org has its own observed activity linked to it.
  // Cross-customer mixing is impossible. Empty territory ⇒ activity-only. ──
  const territoryAreas: string[] = [];
  if (orgId) {
    try {
      const t = await getOrgIntelligenceTerritory(orgId);
      territoryAreas.push(...t.canonicalNames);
    } catch (e) { console.error("[office-cockpit] territory failed:", e instanceof Error ? e.message : e); }
  }

  // Org's observed listings → lite map (areas / types / geo / first-seen).
  const listingById = new Map<string, ListingLite>();
  try {
    const rows = await externalListingRepository.listForOrg();
    for (const r of rows) listingById.set(r.id, { neighborhood: r.neighborhood ?? null, city: r.city ?? null, propertyType: r.property_type ?? null, price: num(r.price), firstSeenMs: ms(r.first_seen_at) ?? ms(r.imported_at), lat: num((r as { lat?: unknown }).lat), lng: num((r as { lng?: unknown }).lng) });
  } catch (e) { console.error("[office-cockpit] listings failed:", e instanceof Error ? e.message : e); }
  const totalObservedListings = listingById.size;

  // Shared detected office graph (exclude rejected candidates).
  let offRows: { id: string; name: string | null; brand_network: string | null; office_type: string | null; hierarchy_level: string | null; city: string | null; primary_phone: string | null; google_rating: number | null; google_reviews_count: number | null; status: string | null; first_seen_at: string | null; last_seen_at: string | null }[] = [];
  try {
    const { data } = await db.from("brokerage_offices").select("id,name,brand_network,office_type,hierarchy_level,city,primary_phone,google_rating,google_reviews_count,status,first_seen_at,last_seen_at").neq("status", "rejected").limit(5000);
    offRows = (data ?? []) as unknown as typeof offRows;
  } catch (e) { console.error("[office-cockpit] offices failed:", e instanceof Error ? e.message : e); }

  // Agents grouped by office (shared graph). Unassigned = office_id null.
  const agentsByOffice = new Map<string, { count: number; sample: { id: string; name: string }[] }>();
  try {
    const { data } = await db.from("brokerage_agents").select("id,office_id,full_name,status").not("status", "eq", "rejected").limit(50000);
    for (const a of (data ?? []) as unknown as { id: string; office_id: string | null; full_name: string | null }[]) {
      if (!a.office_id) continue;
      const cur = agentsByOffice.get(a.office_id) ?? { count: 0, sample: [] };
      cur.count++; if (cur.sample.length < 6) cur.sample.push({ id: a.id, name: (a.full_name ?? "").trim() || "סוכן" });
      agentsByOffice.set(a.office_id, cur);
    }
  } catch (e) { console.error("[office-cockpit] agents failed:", e instanceof Error ? e.message : e); }

  // This org's observed listing→office links.
  const listingsByOffice = new Map<string, Set<string>>();
  const attributedListingIds = new Set<string>();
  try {
    const { data } = await db.from("brokerage_external_listing_links").select("office_id,external_listing_id").eq("organization_id", orgId ?? "").not("office_id", "is", null).limit(50000);
    for (const l of (data ?? []) as unknown as { office_id: string; external_listing_id: string }[]) {
      (listingsByOffice.get(l.office_id) ?? listingsByOffice.set(l.office_id, new Set()).get(l.office_id)!).add(l.external_listing_id);
      attributedListingIds.add(l.external_listing_id);
    }
  } catch (e) { console.error("[office-cockpit] links failed:", e instanceof Error ? e.message : e); }

  const period = filters.period * DAY;
  const offices: OfficeRecord[] = offRows.map((o) => {
    const ag = agentsByOffice.get(o.id) ?? { count: 0, sample: [] };
    const listingIds = [...(listingsByOffice.get(o.id) ?? new Set<string>())];
    const lits = listingIds.map((id) => listingById.get(id)).filter((x): x is ListingLite => Boolean(x));
    const geo = lits.filter((l) => l.lat != null && l.lng != null);
    const seens = lits.map((l) => l.firstSeenMs).filter((t): t is number => t != null);
    return {
      id: o.id, name: (o.name ?? "").trim() || "משרד ללא שם", brand: o.brand_network ?? null, officeType: o.office_type ?? null, hierarchy: o.hierarchy_level ?? null,
      city: o.city ?? null, phone: o.primary_phone ?? null, rating: num(o.google_rating), reviews: num(o.google_reviews_count), status: o.status ?? "candidate",
      agents: ag.count, observedListings: listingIds.length,
      areas: topCounts(lits.map((l) => l.neighborhood || l.city), 3),
      propertyTypes: topCounts(lits.map((l) => l.propertyType), 4).map((t) => ({ type: t.name, count: t.count })),
      newInPeriod: lits.filter((l) => l.firstSeenMs != null && now - l.firstSeenMs < period).length,
      firstSeenMs: seens.length ? Math.min(...seens) : ms(o.first_seen_at),
      lastSeenMs: seens.length ? Math.max(...seens) : ms(o.last_seen_at),
      lat: geo.length ? (avg(geo.map((l) => l.lat as number)) as number) : null,
      lng: geo.length ? (avg(geo.map((l) => l.lng as number)) as number) : null,
      agentSample: ag.sample,
    };
  });

  // Territory scope: keep only offices in the org's specialization areas (or with
  // the org's own observed activity). This is the P0 fix — the directory + every
  // downstream aggregation now uses the TERRITORY universe, not the global graph.
  const inTerritory = offices.filter((o) =>
    officeInTerritory({ city: o.city, observedAreas: o.areas.map((a) => a.name) }, territoryAreas, o.observedListings > 0));

  const cockpit = buildOfficeCockpit({
    // Territory-scoped unassigned pool: unassigned (no-office) agents live in the
    // GLOBAL graph and can't be located to a territory, so we never surface that
    // global number as a customer-local one.
    offices: inTerritory, unassignedAgents: 0, unassignedListings: Math.max(0, totalObservedListings - attributedListingIds.size),
    totalObservedListings, totalDetectedOffices: inTerritory.length, filters, nowMs: now,
    territory: { areas: territoryAreas },
  });

  const names = new Set<string>([...cockpit.landscape.map((r) => r.id), ...cockpit.directory.rows.map((r) => r.id)]);
  const byId = new Map(inTerritory.map((o) => [o.id, o]));
  const detail: Record<string, OfficeRecord> = {};
  for (const id of names) { const o = byId.get(id); if (o) detail[id] = o; }
  return { cockpit, detail };
}
