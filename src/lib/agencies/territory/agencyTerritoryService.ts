// ============================================================================
// ZONO — Agency Territory Dominance service (Phase 26.4, SERVER-ONLY).
// Reads the agency's entities from the Knowledge Graph (26.3) + the real
// internal rows behind them, groups by territory (city / neighborhood / street),
// computes dominance + momentum (vs the prior equal-length window), persists
// idempotently, and emits opportunity signals + timeline events for what
// CHANGED (non-noisy). No UI, no scraping, no mock data, no fabricated numbers.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { listByAgency as listGraph } from "../graph/agencyGraphRepository";
import { addTimelineEvent } from "../timelineRepository";
import { createSignal } from "../signalRepository";
import {
  upsertTerritoryStats, listByAgency as listStats, listByTerritory,
  type UpsertTerritoryStatInput,
} from "./agencyTerritoryRepository";
import { computeTerritoryStats, detectTerritoryOpportunities } from "./agencyTerritoryCalculator";
import { territoryKey, territoryLabel, medianOrNull, DEFAULT_TERRITORY_PERIOD } from "./agencyTerritoryTypes";
import type {
  TerritoryListingRow, TerritoryType, TerritoryPeriodDays, TerritoryPreviousPeriod,
  AgencyTerritoryStats,
} from "./agencyTerritoryTypes";

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const loc = (v: unknown): { neighborhood?: string; street?: string; city?: string } =>
  (v && typeof v === "object" ? (v as Record<string, string>) : {});
const daysBetween = (a: string | null, b: number): number | null =>
  a ? Math.max(0, Math.round((b - new Date(a).getTime()) / 86_400_000)) : null;

export interface TerritoryServiceResult {
  agencyId: string;
  territoriesCalculated: number;
  dominanceChanges: number;
  opportunitiesDetected: number;
  signalsCreated: number;
  timelineEventsCreated: number;
}

// A normalized listing/property the agency owns, with its territory path.
interface OwnedListing extends TerritoryListingRow {
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  propertyId: string | null;
}
// A pooled row used only to compute territory denominators (all agencies).
interface PoolRow {
  price: number | null;
  status: "active" | "sold" | "historical";
  neighborhood: string | null;
  street: string | null;
}

function propStatus(s: string | null): "active" | "sold" | "historical" {
  if (s === "sold") return "sold";
  if (s === "active" || s === "under_offer" || s === "in_contract") return "active";
  return "historical";
}
function extStatus(s: string | null, removedAt: string | null): "active" | "sold" | "historical" {
  if (s === "sold") return "sold";
  if (s === "removed" || removedAt) return "historical";
  return "active";
}

/** Load the agency's owned listings (internal properties + external broker-matched). */
async function loadOwnedListings(agencyId: string, nowMs: number): Promise<{ owned: OwnedListing[]; dealsByProperty: Map<string, number> }> {
  const db = await createClient();
  const graph = await listGraph(agencyId, { activeOnly: true });
  const propertyIds = graph.filter((r) => r.entityType === "property").map((r) => r.entityId);
  const listingIds = graph.filter((r) => r.entityType === "listing").map((r) => r.entityId);
  const dealIds = graph.filter((r) => r.entityType === "deal").map((r) => r.entityId);

  const owned: OwnedListing[] = [];

  if (propertyIds.length) {
    const { data } = await db.from("properties")
      .select("id,price,size_sqm,status,city,location,has_exclusivity,listed_at,created_at,updated_at")
      .in("id", propertyIds).limit(5000);
    for (const p of (data as Obj[] | null) ?? []) {
      const l = loc(p.location);
      const status = propStatus(str(p.status));
      const first = (p.listed_at as string) ?? (p.created_at as string) ?? null;
      owned.push({
        city: str(p.city) ?? str(l.city), neighborhood: str(l.neighborhood), street: str(l.street),
        price: num(p.price), sqm: num(p.size_sqm), status,
        daysOnMarket: status === "active" ? daysBetween(first, nowMs) : null,
        isExclusive: Boolean(p.has_exclusivity), firstSeenAt: first,
        saleDate: status === "sold" ? ((p.updated_at as string) ?? null) : null,
        priceDropped: null, propertyId: p.id as string,
      });
    }
  }

  // External broker-matched listings + price-drop history (one extra query).
  if (listingIds.length) {
    const { data } = await db.from("external_listings")
      .select("id,price,sqm,area_sqm,status,city,neighborhood,street,first_seen_at,published_at,removed_at")
      .in("id", listingIds).limit(5000);
    const rows = (data as Obj[] | null) ?? [];
    const dropById = new Map<string, boolean>();
    if (rows.length) {
      const { data: hist } = await db.from("external_listing_history")
        .select("listing_id,change_type").in("listing_id", rows.map((r) => r.id as string)).limit(20000);
      for (const h of (hist as Obj[] | null) ?? []) {
        if (String(h.change_type ?? "").toLowerCase().includes("price")) dropById.set(h.listing_id as string, true);
      }
    }
    for (const x of rows) {
      const status = extStatus(str(x.status), str(x.removed_at));
      const first = (x.first_seen_at as string) ?? (x.published_at as string) ?? null;
      const end = (x.removed_at as string) ? new Date(x.removed_at as string).getTime() : nowMs;
      owned.push({
        city: str(x.city), neighborhood: str(x.neighborhood), street: str(x.street),
        price: num(x.price), sqm: num(x.sqm) ?? num(x.area_sqm), status,
        daysOnMarket: first ? Math.max(0, Math.round((end - new Date(first).getTime()) / 86_400_000)) : null,
        isExclusive: false, firstSeenAt: first,
        saleDate: status === "sold" ? ((x.removed_at as string) ?? null) : null,
        priceDropped: dropById.has(x.id as string) ? true : (rows.length ? false : null),
        propertyId: null,
      });
    }
  }

  // Deals per property (for deals_count by territory).
  const dealsByProperty = new Map<string, number>();
  if (dealIds.length) {
    const { data } = await db.from("deals").select("id,property_id").in("id", dealIds).limit(5000);
    for (const d of (data as Obj[] | null) ?? []) {
      const pid = str(d.property_id);
      if (pid) dealsByProperty.set(pid, (dealsByProperty.get(pid) ?? 0) + 1);
    }
  }

  return { owned, dealsByProperty };
}

/** Load org-wide denominators for a city (used to derive city/nbhd/street totals). */
async function loadCityPool(city: string): Promise<PoolRow[]> {
  const org = await currentOrgId();
  const db = await createClient();
  const pool: PoolRow[] = [];
  const [{ data: props }, { data: ext }] = await Promise.all([
    db.from("properties").select("price,status,city,location").eq("org_id", org).eq("city", city).limit(2000),
    db.from("external_listings").select("price,status,city,neighborhood,street,removed_at").eq("org_id", org).eq("city", city).limit(4000),
  ]);
  for (const p of (props as Obj[] | null) ?? []) {
    const l = loc(p.location);
    pool.push({ price: num(p.price), status: propStatus(str(p.status)), neighborhood: str(l.neighborhood), street: str(l.street) });
  }
  for (const x of (ext as Obj[] | null) ?? []) {
    pool.push({ price: num(x.price), status: extStatus(str(x.status), str(x.removed_at)), neighborhood: str(x.neighborhood), street: str(x.street) });
  }
  return pool;
}

function poolTotals(pool: PoolRow[]) {
  const active = pool.filter((r) => r.status === "active").length;
  const sold = pool.filter((r) => r.status === "sold").length;
  const medianPrice = medianOrNull(pool.map((r) => r.price));
  const threshold = medianPrice != null ? medianPrice * 1.5 : null;
  const luxuryAll = threshold != null ? pool.filter((r) => r.price != null && r.price >= threshold).length : null;
  return { activeAll: active || null, soldAll: sold || null, luxuryAll, medianPrice };
}

interface TerritoryBucket {
  type: TerritoryType; city: string | null; neighborhood: string | null; street: string | null;
  rows: OwnedListing[];
}

/** Recompute all territory stats for one agency at one period. Idempotent. */
export async function calculateAgencyTerritoryStats(agencyId: string, periodDays: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD): Promise<TerritoryServiceResult> {
  const nowMs = Date.now();
  const periodEnd = new Date(nowMs).toISOString();
  const periodStart = new Date(nowMs - periodDays * 86_400_000).toISOString();
  const prevStart = new Date(nowMs - 2 * periodDays * 86_400_000).toISOString();

  const result: TerritoryServiceResult = {
    agencyId, territoriesCalculated: 0, dominanceChanges: 0, opportunitiesDetected: 0, signalsCreated: 0, timelineEventsCreated: 0,
  };

  const { owned, dealsByProperty } = await loadOwnedListings(agencyId, nowMs);
  if (owned.length === 0) return result;

  // Build territory buckets at all 3 levels.
  const buckets = new Map<string, TerritoryBucket>();
  const addRow = (type: TerritoryType, city: string | null, neighborhood: string | null, street: string | null, row: OwnedListing) => {
    const key = territoryKey(type, city, neighborhood, street);
    let b = buckets.get(key);
    if (!b) { b = { type, city, neighborhood, street, rows: [] }; buckets.set(key, b); }
    b.rows.push(row);
  };
  for (const row of owned) {
    if (row.city) addRow("city", row.city, null, null, row);
    if (row.city && row.neighborhood) addRow("neighborhood", row.city, row.neighborhood, null, row);
    if (row.city && row.neighborhood && row.street) addRow("street", row.city, row.neighborhood, row.street, row);
  }

  // City pools (one load per distinct city) → territory denominators.
  const cities = [...new Set(owned.map((r) => r.city).filter(Boolean) as string[])];
  const poolByCity = new Map<string, PoolRow[]>();
  for (const c of cities) poolByCity.set(c, await loadCityPool(c));

  // Existing stats for this period (to detect changes / non-noisy signals).
  const existing = await listStats(agencyId, periodDays);
  const existingByKey = new Map(existing.map((s) => [s.territoryKey, s]));

  const upserts: UpsertTerritoryStatInput[] = [];
  const newSignals: { type: string; severity: "info" | "warning" | "critical"; title: string; description: string | null; metadata: Record<string, unknown> }[] = [];
  const newEvents: { eventType: string; title: string; metadata: Record<string, unknown> }[] = [];

  for (const b of buckets.values()) {
    const pool = (b.city && poolByCity.get(b.city)) || [];
    const scoped = b.type === "city" ? pool
      : b.type === "neighborhood" ? pool.filter((r) => r.neighborhood === b.neighborhood)
      : pool.filter((r) => r.neighborhood === b.neighborhood && r.street === b.street);
    const totals = poolTotals(scoped);

    // Previous-period snapshot (same length window immediately before).
    const dated = b.rows.filter((r) => r.firstSeenAt || r.saleDate);
    const previous: TerritoryPreviousPeriod | null = dated.length === 0 ? null : {
      newListings: b.rows.filter((r) => r.firstSeenAt && r.firstSeenAt >= prevStart && r.firstSeenAt < periodStart).length,
      sold: b.rows.filter((r) => r.status === "sold" && r.saleDate && r.saleDate >= prevStart && r.saleDate < periodStart).length,
      activeInventory: b.rows.filter((r) => r.firstSeenAt && r.firstSeenAt < periodStart).length,
    };

    const stats = computeTerritoryStats({
      agencyId, territoryType: b.type, city: b.city, neighborhood: b.neighborhood, street: b.street,
      periodDays, periodStart, periodEnd,
      listings: b.rows.map(({ price, sqm, status, daysOnMarket, isExclusive, firstSeenAt, saleDate, priceDropped }) => ({
        price, sqm, status, daysOnMarket, isExclusive, firstSeenAt, saleDate, priceDropped,
      })),
      totals, previous,
    });

    const dealsCount = b.rows.reduce((s, r) => s + (r.propertyId ? (dealsByProperty.get(r.propertyId) ?? 0) : 0), 0);

    // Opportunity detection vs strongest OTHER agency already stored in territory.
    const key = territoryKey(b.type, b.city, b.neighborhood, b.street);
    const others = (await listByTerritory(b.type, key, periodDays)).filter((s) => s.agencyId !== agencyId);
    const top = others[0] ?? null;
    const opportunities = detectTerritoryOpportunities(
      stats,
      top ? { dominanceScore: top.dominanceScore, trend: String(top.trend ?? "unknown"), momentumScore: top.momentumScore } : null,
      { territoryType: b.type, city: b.city, neighborhood: b.neighborhood, street: b.street,
        totalActive: totals.activeAll, totalSold: totals.soldAll, medianPrice: totals.medianPrice, luxuryAll: totals.luxuryAll },
    );
    result.opportunitiesDetected += opportunities.length;

    // Non-noisy signals: only fire opportunity types not seen before in this territory.
    const prevTypes = new Set(((existingByKey.get(key)?.metadata?.opportunityTypes as string[]) ?? []));
    for (const op of opportunities) {
      if (!prevTypes.has(op.type)) {
        newSignals.push({ type: op.type, severity: op.severity, title: op.title, description: op.description, metadata: { ...op.metadata, territoryKey: key } });
      }
    }

    // Timeline events on dominance threshold crossings + sharp momentum changes.
    const old = existingByKey.get(key);
    const label = territoryLabel(b.city, b.neighborhood, b.street);
    const newDom = stats.dominanceScore ?? 0;
    const oldDom = old?.dominanceScore ?? 0;
    if (old && newDom >= 60 && oldDom < 60) {
      newEvents.push({ eventType: "territory_dominant", title: `הסוכנות הפכה דומיננטית ב${label}`, metadata: { territoryKey: key, dominance: newDom } });
      result.dominanceChanges++;
    } else if (old && newDom < 60 && oldDom >= 60) {
      newEvents.push({ eventType: "territory_lost_dominance", title: `הסוכנות איבדה דומיננטיות ב${label}`, metadata: { territoryKey: key, dominance: newDom } });
      result.dominanceChanges++;
    }
    if (b.type === "street" && !old && stats.activeListingsCount > 0) {
      newEvents.push({ eventType: "territory_entered_street", title: `כניסה לרחוב ${label}`, metadata: { territoryKey: key } });
    }
    if (old && stats.momentumScore != null && old.momentumScore != null && Math.abs(stats.momentumScore - old.momentumScore) >= 25) {
      newEvents.push({ eventType: "territory_momentum_shift", title: `שינוי חד בתאוצה ב${label}`, metadata: { territoryKey: key, from: old.momentumScore, to: stats.momentumScore } });
    }

    upserts.push({
      agencyId, territoryType: b.type, city: b.city, neighborhood: b.neighborhood, street: b.street,
      territoryKey: key, periodDays, periodStart, periodEnd, dealsCount, stats,
      metadata: { opportunityTypes: opportunities.map((o) => o.type), exclusiveShare: stats.exclusiveShare },
    });
  }

  await upsertTerritoryStats(upserts);
  result.territoriesCalculated = upserts.length;

  for (const s of newSignals) {
    await createSignal({ agencyId, signalType: s.type, severity: s.severity, title: s.title, description: s.description, metadata: s.metadata })
      .then(() => { result.signalsCreated++; }).catch(() => {});
  }
  for (const e of newEvents) {
    await addTimelineEvent({ agencyId, eventType: e.eventType, title: e.title, metadata: e.metadata })
      .then(() => { result.timelineEventsCreated++; }).catch(() => {});
  }

  return result;
}

/** Recompute territory stats for every active agency in the org at one period. */
export async function calculateOrganizationTerritoryStats(periodDays: TerritoryPeriodDays = DEFAULT_TERRITORY_PERIOD): Promise<{ agencies: number; results: TerritoryServiceResult[] }> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data } = await db.from("agencies").select("id").eq("organization_id", org).eq("active", true).limit(2000);
  const ids = ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  const results: TerritoryServiceResult[] = [];
  for (const id of ids) {
    try { results.push(await calculateAgencyTerritoryStats(id, periodDays)); }
    catch { /* isolate per-agency failures */ }
  }
  return { agencies: ids.length, results };
}

export type { AgencyTerritoryStats };
