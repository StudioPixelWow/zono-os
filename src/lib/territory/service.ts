/**
 * Territory Intelligence OS — server service.
 *
 * Aggregates geo-anchored data from the existing brains (transactions, internal
 * + external inventory, buyers, competitors, recommendations, operating areas)
 * into city- and neighborhood-level territory profiles, scores them via the
 * pure engine, and persists profiles + signals + DNA + daily snapshots.
 * Deterministic. No LLM, no auto-contact/assignment/publishing.
 *
 * Org column convention: property_transactions / competitor_market_positions /
 * recommendations / user_operating_localities use `organization_id`; properties
 * / external_listings / buyers use `org_id`.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  scoreTerritory, generateTerritorySignals, rankTerritories, type TerritoryMetrics, type TerritoryScores,
} from "./engine";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id };
}

const DAY = 86_400_000;
const cityKey = (c: string) => c.trim();
const hoodKey = (c: string, n: string) => `${c.trim()}|${n.trim()}`;

interface Agg extends TerritoryMetrics {
  city: string; neighborhood: string | null; ppsqmSum: number; ppsqmCount: number;
}

function blankAgg(city: string, neighborhood: string | null): Agg {
  return {
    city, neighborhood,
    activeBuyers: 0, activeSellers: 0, activeProperties: 0, activeDeals: 0, activeMatches: 0,
    internalInventory: 0, externalInventory: 0, transactionVolume90d: 0, transactionVolume365d: 0,
    transactionVolumePrev90d: 0, competitorCount: 0, competitorListings: 0, assignedAgents: 0,
    recommendationCount: 0, acquisitionSignalCount: 0, privateSellerCount: 0, expectedRevenue: 0,
    ppsqmSum: 0, ppsqmCount: 0, avgPriceSqm: null,
  };
}

// ── Recompute all territories ────────────────────────────────────────────────
export async function generateTerritories() {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const now = Date.now();

  const [txnR, propR, extR, buyersR, compR, recR, agentsR] = await Promise.all([
    supabase.from("property_transactions").select("city_name,neighborhood_name,deal_date,price_per_sqm").eq("organization_id", orgId).limit(20000),
    supabase.from("properties").select("city,neighborhood,status").eq("org_id", orgId).limit(20000),
    supabase.from("external_listings").select("city,neighborhood").eq("org_id", orgId).limit(20000),
    supabase.from("buyers").select("preferred_areas").eq("org_id", orgId).limit(20000),
    supabase.from("competitor_market_positions").select("locality,competitor_profile_id,listings_count,private_seller_loss_count").eq("organization_id", orgId).limit(20000),
    supabase.from("recommendations").select("supporting_geo").eq("organization_id", orgId).in("status", ["new", "reviewed"]).limit(20000),
    supabase.from("user_operating_localities").select("city_name,user_id,is_active").eq("organization_id", orgId).limit(20000),
  ]);

  const cities = new Map<string, Agg>();
  const hoods = new Map<string, Agg>();
  const getCity = (c: string) => { const k = cityKey(c); if (!cities.has(k)) cities.set(k, blankAgg(k, null)); return cities.get(k)!; };
  const getHood = (c: string, n: string) => { const k = hoodKey(c, n); if (!hoods.has(k)) hoods.set(k, blankAgg(cityKey(c), n.trim())); return hoods.get(k)!; };

  // Transactions → volume windows + price/sqm (city + neighborhood)
  for (const t of (txnR.data ?? []) as { city_name: string | null; neighborhood_name: string | null; deal_date: string | null; price_per_sqm: number | null }[]) {
    if (!t.city_name) continue;
    const ageDays = t.deal_date ? (now - new Date(t.deal_date).getTime()) / DAY : 9999;
    const apply = (a: Agg) => {
      if (ageDays <= 365) a.transactionVolume365d++;
      if (ageDays <= 90) a.transactionVolume90d++;
      else if (ageDays <= 180) a.transactionVolumePrev90d = (a.transactionVolumePrev90d ?? 0) + 1;
      if (typeof t.price_per_sqm === "number" && t.price_per_sqm > 0) { a.ppsqmSum += t.price_per_sqm; a.ppsqmCount++; }
    };
    apply(getCity(t.city_name));
    if (t.neighborhood_name) apply(getHood(t.city_name, t.neighborhood_name));
  }

  // Internal properties → inventory + active deals
  for (const p of (propR.data ?? []) as { city: string | null; neighborhood: string | null; status: string }[]) {
    if (!p.city) continue;
    const active = !["sold", "rented", "withdrawn", "archived", "draft"].includes(p.status);
    const deal = p.status === "under_offer";
    const apply = (a: Agg) => { if (active) a.internalInventory++; a.activeProperties++; if (deal) a.activeDeals++; };
    apply(getCity(p.city));
    if (p.neighborhood) apply(getHood(p.city, p.neighborhood));
  }

  // External inventory
  for (const e of (extR.data ?? []) as { city: string | null; neighborhood: string | null }[]) {
    if (!e.city) continue;
    getCity(e.city).externalInventory++;
    if (e.neighborhood) getHood(e.city, e.neighborhood).externalInventory++;
  }

  // Buyers → demand per preferred city (city-level; shared to neighborhoods later)
  for (const b of (buyersR.data ?? []) as { preferred_areas: string[] | null }[]) {
    for (const area of b.preferred_areas ?? []) { if (area) getCity(area).activeBuyers++; }
  }

  // Competitors per locality (city)
  for (const c of (compR.data ?? []) as { locality: string | null; competitor_profile_id: string; listings_count: number; private_seller_loss_count: number }[]) {
    if (!c.locality) continue;
    const a = getCity(c.locality);
    a.competitorCount++;
    a.competitorListings = (a.competitorListings ?? 0) + (c.listings_count ?? 0);
    a.privateSellerCount = (a.privateSellerCount ?? 0) + (c.private_seller_loss_count ?? 0);
  }

  // Recommendations density per geo
  for (const r of (recR.data ?? []) as { supporting_geo: { city?: string; neighborhood?: string } | null }[]) {
    const city = r.supporting_geo?.city; if (!city) continue;
    getCity(city).recommendationCount++;
    if (r.supporting_geo?.neighborhood) getHood(city, r.supporting_geo.neighborhood).recommendationCount++;
  }

  // Assigned agents per city (distinct active users)
  const agentsByCity = new Map<string, Set<string>>();
  for (const a of (agentsR.data ?? []) as { city_name: string | null; user_id: string; is_active: boolean }[]) {
    if (!a.city_name || !a.is_active) continue;
    const k = cityKey(a.city_name); if (!agentsByCity.has(k)) agentsByCity.set(k, new Set());
    agentsByCity.get(k)!.add(a.user_id);
  }
  for (const [k, set] of agentsByCity) { const c = cities.get(k); if (c) c.assignedAgents = set.size; }

  // Share city-level context (buyers, competitors, agents, private sellers) down
  // to each neighborhood in that city (they are city-wide signals).
  for (const h of hoods.values()) {
    const c = cities.get(h.city);
    if (!c) continue;
    h.activeBuyers = c.activeBuyers;
    h.competitorCount = c.competitorCount;
    h.competitorListings = c.competitorListings;
    h.assignedAgents = c.assignedAgents;
    h.privateSellerCount = c.privateSellerCount;
  }

  // Finalise: compute avg price/sqm + expected revenue context, score, persist.
  const allAggs: { type: "city" | "neighborhood"; key: string; agg: Agg }[] = [
    ...[...cities.entries()].map(([key, agg]) => ({ type: "city" as const, key, agg })),
    ...[...hoods.entries()].map(([key, agg]) => ({ type: "neighborhood" as const, key, agg })),
  ];

  const rows = allAggs.map(({ type, key, agg }) => {
    agg.avgPriceSqm = agg.ppsqmCount ? Math.round(agg.ppsqmSum / agg.ppsqmCount) : null;
    const s: TerritoryScores = scoreTerritory(agg);
    return {
      organization_id: orgId, territory_type: type, territory_key: key,
      city_name: agg.city, neighborhood_name: agg.neighborhood, street: null,
      demand_score: s.demand_score, supply_score: s.supply_score, acquisition_score: s.acquisition_score,
      revenue_score: s.revenue_score, forecast_score: s.forecast_score, competition_score: s.competition_score,
      dominance_score: s.dominance_score, penetration_score: s.penetration_score, opportunity_score: s.opportunity_score,
      growth_score: s.growth_score, white_space_score: s.white_space_score, territory_health_score: s.territory_health_score,
      territory_level: s.territory_level,
      active_buyers: agg.activeBuyers, active_sellers: agg.activeSellers, active_properties: agg.activeProperties,
      active_deals: agg.activeDeals, active_matches: agg.activeMatches,
      external_inventory: agg.externalInventory, internal_inventory: agg.internalInventory,
      transaction_volume_90d: agg.transactionVolume90d, transaction_volume_365d: agg.transactionVolume365d,
      avg_price_sqm: agg.avgPriceSqm, expected_revenue: s.expected_revenue,
      expected_commission: Math.round(s.expected_revenue * 0.5),
      competitor_count: agg.competitorCount, assigned_agents_count: agg.assignedAgents,
      recommendation_count: agg.recommendationCount, confidence_score: s.confidence_score,
      summary_hebrew: `${s.territory_level} · הזדמנות ${s.opportunity_score} · שטח לבן ${s.white_space_score}`,
      last_calculated_at: new Date().toISOString(),
      _scores: s, _agg: agg,
    };
  });

  if (!rows.length) return { territories: 0, signals: 0 };

  // Upsert profiles (strip helper fields).
  const persistRows = rows.map(({ _scores, _agg, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars
  await supabase.from("territory_profiles").upsert(persistRows as never, { onConflict: "organization_id,territory_type,territory_key" });

  // Re-read ids for signal/dna/snapshot linkage.
  const { data: saved } = await supabase.from("territory_profiles")
    .select("id,territory_type,territory_key").eq("organization_id", orgId);
  const idByKey = new Map<string, string>();
  for (const s of (saved ?? []) as { id: string; territory_type: string; territory_key: string }[]) idByKey.set(`${s.territory_type}|${s.territory_key}`, s.id);

  // Regenerate signals (clear open, insert fresh).
  await supabase.from("territory_signals").delete().eq("organization_id", orgId).eq("status", "open");
  const signalRows: Record<string, unknown>[] = [];
  const snapshotRows: Record<string, unknown>[] = [];
  for (const r of rows) {
    const pid = idByKey.get(`${r.territory_type}|${r.territory_key}`);
    if (!pid) continue;
    const name = r.neighborhood_name ? `${r.city_name} · ${r.neighborhood_name}` : r.city_name ?? r.territory_key;
    for (const sig of generateTerritorySignals(name, r._scores, r._agg)) {
      signalRows.push({
        organization_id: orgId, territory_profile_id: pid, signal_type: sig.signal_type,
        score: sig.score, confidence_score: sig.confidence_score, title: sig.title,
        reason: sig.reason, recommended_action: sig.recommended_action, status: "open",
      });
    }
    snapshotRows.push({
      organization_id: orgId, territory_profile_id: pid, territory_type: r.territory_type, territory_key: r.territory_key,
      scores: { opportunity: r.opportunity_score, revenue: r.revenue_score, growth: r.growth_score, white_space: r.white_space_score, health: r.territory_health_score } as never,
      metrics: { buyers: r.active_buyers, internal: r.internal_inventory, txn365: r.transaction_volume_365d } as never,
    });
  }
  if (signalRows.length) await supabase.from("territory_signals").insert(signalRows as never);
  if (snapshotRows.length) await supabase.from("territory_snapshots").insert(snapshotRows as never);

  return { territories: rows.length, signals: signalRows.length };
}

// ── Reads for UI ─────────────────────────────────────────────────────────────
export interface TerritoryRow {
  id: string; territory_type: string; territory_key: string; city_name: string | null; neighborhood_name: string | null;
  demand_score: number; supply_score: number; acquisition_score: number; revenue_score: number;
  competition_score: number; dominance_score: number; penetration_score: number; opportunity_score: number;
  growth_score: number; white_space_score: number; territory_health_score: number; territory_level: string;
  internal_inventory: number; external_inventory: number; transaction_volume_90d: number; transaction_volume_365d: number;
  active_buyers: number; competitor_count: number; assigned_agents_count: number; recommendation_count: number;
  expected_revenue: number; confidence_score: number; summary_hebrew: string | null; avg_price_sqm: number | null;
}

export interface TerritorySignalRow {
  id: string; territory_profile_id: string | null; signal_type: string; score: number;
  confidence_score: number; title: string; reason: string | null; recommended_action: string | null;
}

const TERR_COLS = "id,territory_type,territory_key,city_name,neighborhood_name,demand_score,supply_score,acquisition_score,revenue_score,competition_score,dominance_score,penetration_score,opportunity_score,growth_score,white_space_score,territory_health_score,territory_level,internal_inventory,external_inventory,transaction_volume_90d,transaction_volume_365d,active_buyers,competitor_count,assigned_agents_count,recommendation_count,expected_revenue,confidence_score,summary_hebrew,avg_price_sqm";

export interface TerritoryCommandCenter {
  total: number;
  strongest: TerritoryRow | null; fastestGrowing: TerritoryRow | null; highestRevenue: TerritoryRow | null;
  highestAcquisition: TerritoryRow | null; biggestThreat: TerritoryRow | null; biggestOpportunity: TerritoryRow | null;
  rankings: TerritoryRow[]; whiteSpace: TerritoryRow[]; dominance: TerritoryRow[]; revenueOps: TerritoryRow[];
  neighborhoods: TerritoryRow[]; signals: TerritorySignalRow[];
  expectedRevenueTotal: number;
}

const top = (rows: TerritoryRow[], key: keyof TerritoryRow) =>
  rows.length ? [...rows].sort((a, b) => (b[key] as number) - (a[key] as number))[0] : null;

export async function getTerritoryCommandCenter(): Promise<TerritoryCommandCenter> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const [profR, sigR] = await Promise.all([
    supabase.from("territory_profiles").select(TERR_COLS).eq("organization_id", orgId).limit(2000),
    supabase.from("territory_signals").select("id,territory_profile_id,signal_type,score,confidence_score,title,reason,recommended_action").eq("organization_id", orgId).eq("status", "open").order("score", { ascending: false }).limit(60),
  ]);
  const all = (profR.data ?? []) as TerritoryRow[];
  const ranked = rankTerritories(all);
  return {
    total: all.length,
    strongest: top(all, "territory_health_score"),
    fastestGrowing: top(all, "growth_score"),
    highestRevenue: top(all, "revenue_score"),
    highestAcquisition: top(all, "acquisition_score"),
    biggestThreat: top(all.filter((t) => t.dominance_score < 40), "competition_score"),
    biggestOpportunity: top(all, "opportunity_score"),
    rankings: ranked.slice(0, 20),
    whiteSpace: [...all].sort((a, b) => b.white_space_score - a.white_space_score).slice(0, 12),
    dominance: [...all].sort((a, b) => b.dominance_score - a.dominance_score).slice(0, 12),
    revenueOps: [...all].sort((a, b) => b.revenue_score - a.revenue_score).slice(0, 12),
    neighborhoods: ranked.filter((t) => t.territory_type === "neighborhood").slice(0, 20),
    signals: (sigR.data ?? []) as TerritorySignalRow[],
    expectedRevenueTotal: all.reduce((a, t) => a + (t.expected_revenue ?? 0), 0),
  };
}
