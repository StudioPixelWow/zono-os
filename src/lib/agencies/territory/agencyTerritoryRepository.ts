// ============================================================================
// ZONO — Agency Territory Stats repository (Phase 26.4, SERVER-ONLY). Org-scoped.
// Idempotent upsert keyed by (org, agency, territory_type, territory_key,
// period_days) so re-running a period overwrites in place. Reads for the typed
// query layer. Writes stamp organization_id from the session; RLS enforces.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import type { AgencyTerritoryStats, ComputedTerritoryStats, TerritoryType } from "./agencyTerritoryTypes";

const COLS =
  "id,organization_id,agency_id,territory_type,city,neighborhood,street,territory_key,period_start,period_end,period_days," +
  "active_listings_count,historical_listings_count,sold_count,deals_count,exclusive_count,price_drop_count," +
  "avg_price,avg_price_per_sqm,avg_days_on_market,listing_velocity,sales_velocity,inventory_share,sales_share,luxury_share," +
  "dominance_score,momentum_score,trend,confidence,metadata,calculated_at,created_at,updated_at";

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function toTerritoryStats(r: Obj): AgencyTerritoryStats {
  return {
    id: r.id as string, organizationId: r.organization_id as string, agencyId: r.agency_id as string,
    territoryType: r.territory_type as string, city: (r.city as string) ?? null,
    neighborhood: (r.neighborhood as string) ?? null, street: (r.street as string) ?? null,
    territoryKey: r.territory_key as string, periodStart: (r.period_start as string) ?? null,
    periodEnd: (r.period_end as string) ?? null, periodDays: Number(r.period_days ?? 90),
    activeListingsCount: Number(r.active_listings_count ?? 0),
    historicalListingsCount: Number(r.historical_listings_count ?? 0),
    soldCount: Number(r.sold_count ?? 0), dealsCount: Number(r.deals_count ?? 0),
    exclusiveCount: Number(r.exclusive_count ?? 0), priceDropCount: num(r.price_drop_count),
    avgPrice: num(r.avg_price), avgPricePerSqm: num(r.avg_price_per_sqm), avgDaysOnMarket: num(r.avg_days_on_market),
    listingVelocity: num(r.listing_velocity), salesVelocity: num(r.sales_velocity),
    inventoryShare: num(r.inventory_share), salesShare: num(r.sales_share), luxuryShare: num(r.luxury_share),
    dominanceScore: num(r.dominance_score), momentumScore: num(r.momentum_score),
    trend: (r.trend as string) ?? null, confidence: num(r.confidence), metadata: asObj(r.metadata),
    calculatedAt: r.calculated_at as string,
  };
}

export interface UpsertTerritoryStatInput {
  agencyId: string;
  territoryType: TerritoryType;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  territoryKey: string;
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  dealsCount: number;
  stats: ComputedTerritoryStats;
  metadata?: Record<string, unknown>;
}

/** Idempotently upsert a batch of territory stats. Returns rows written. */
export async function upsertTerritoryStats(inputs: UpsertTerritoryStatInput[], now = new Date().toISOString()): Promise<number> {
  if (inputs.length === 0) return 0;
  const org = await currentOrgId();
  const db = await createClient();
  const rows = inputs.map((i) => ({
    organization_id: org, agency_id: i.agencyId, territory_type: i.territoryType,
    city: i.city, neighborhood: i.neighborhood, street: i.street, territory_key: i.territoryKey,
    period_start: i.periodStart, period_end: i.periodEnd, period_days: i.periodDays,
    active_listings_count: i.stats.activeListingsCount,
    historical_listings_count: i.stats.historicalListingsCount,
    sold_count: i.stats.soldCount, deals_count: i.dealsCount, exclusive_count: i.stats.exclusiveCount,
    price_drop_count: i.stats.priceDropCount,
    avg_price: i.stats.avgPrice, avg_price_per_sqm: i.stats.avgPricePerSqm, avg_days_on_market: i.stats.avgDaysOnMarket,
    listing_velocity: i.stats.listingVelocity, sales_velocity: i.stats.salesVelocity,
    inventory_share: i.stats.inventoryShare, sales_share: i.stats.salesShare, luxury_share: i.stats.luxuryShare,
    dominance_score: i.stats.dominanceScore, momentum_score: i.stats.momentumScore, trend: i.stats.trend,
    confidence: i.stats.confidence, metadata: i.metadata ?? {}, calculated_at: now,
  }));
  const { error } = await db
    .from("agency_territory_stats")
    .upsert(rows as never, { onConflict: "organization_id,agency_id,territory_type,territory_key,period_days" });
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function listByAgency(agencyId: string, periodDays?: number): Promise<AgencyTerritoryStats[]> {
  const db = await createClient();
  let req = db.from("agency_territory_stats").select(COLS).eq("agency_id", agencyId);
  if (periodDays != null) req = req.eq("period_days", periodDays);
  const { data } = await req.order("dominance_score", { ascending: false, nullsFirst: false }).limit(2000);
  return ((data as Obj[] | null) ?? []).map(toTerritoryStats);
}

export async function listByAgencyAndType(agencyId: string, territoryType: TerritoryType, periodDays: number): Promise<AgencyTerritoryStats[]> {
  const db = await createClient();
  const { data } = await db.from("agency_territory_stats").select(COLS)
    .eq("agency_id", agencyId).eq("territory_type", territoryType).eq("period_days", periodDays)
    .order("dominance_score", { ascending: false, nullsFirst: false }).limit(1000);
  return ((data as Obj[] | null) ?? []).map(toTerritoryStats);
}

export async function getByAgencyTerritory(agencyId: string, territoryType: TerritoryType, territoryKey: string, periodDays: number): Promise<AgencyTerritoryStats | null> {
  const db = await createClient();
  const { data } = await db.from("agency_territory_stats").select(COLS)
    .eq("agency_id", agencyId).eq("territory_type", territoryType).eq("territory_key", territoryKey).eq("period_days", periodDays)
    .maybeSingle();
  return data ? toTerritoryStats(data as unknown as Obj) : null;
}

/** All agencies' stats in one territory (org-scoped) for ranking/leaderboards. */
export async function listByTerritory(territoryType: TerritoryType, territoryKey: string, periodDays: number, limit = 100): Promise<AgencyTerritoryStats[]> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data } = await db.from("agency_territory_stats").select(COLS)
    .eq("organization_id", org).eq("territory_type", territoryType).eq("territory_key", territoryKey).eq("period_days", periodDays)
    .order("dominance_score", { ascending: false, nullsFirst: false }).limit(limit);
  return ((data as Obj[] | null) ?? []).map(toTerritoryStats);
}

/** Trend history for one agency+territory across periods (for getAgencyTerritoryTrend). */
export async function listPeriodsForTerritory(agencyId: string, territoryType: TerritoryType, territoryKey: string): Promise<AgencyTerritoryStats[]> {
  const db = await createClient();
  const { data } = await db.from("agency_territory_stats").select(COLS)
    .eq("agency_id", agencyId).eq("territory_type", territoryType).eq("territory_key", territoryKey)
    .order("period_days", { ascending: true });
  return ((data as Obj[] | null) ?? []).map(toTerritoryStats);
}
