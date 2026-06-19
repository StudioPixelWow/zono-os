/**
 * Market Heatmap & Pricing Intelligence service — server-only.
 * Aggregates real org-scoped data into daily locality snapshots. No providers,
 * no Apify changes, no AI calls. Deterministic scoring via ./engine.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import {
  calculateDemandScore, calculateHeatLevel, calculateOpportunityScore, calculateSupplyScore,
  HEAT_LABEL, HEAT_TONE, type HeatLevel,
} from "./engine";

type DB = SupabaseClient<Database>;
type SnapshotRow = Database["public"]["Tables"]["market_area_snapshots"]["Row"];
const DAY = 86_400_000;
const norm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");
const median = (nums: number[]) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

interface Locality { id: string; nameHe: string; nameEn: string | null }

/** Does a free-text city string belong to this locality (he/en, ci, contains)? */
function cityMatches(city: string | null, loc: Locality): boolean {
  const c = norm(city);
  if (!c) return false;
  const he = norm(loc.nameHe), en = norm(loc.nameEn);
  return c === he || c === en || (!!he && (c.includes(he) || he.includes(c))) || (!!en && (c.includes(en) || en.includes(c)));
}

export interface MarketSnapshotSummary { localities: number; snapshots: number }

async function activeLocalities(db: DB, orgId: string): Promise<Locality[]> {
  const { data } = await db.from("organization_operating_localities").select("locality_id").eq("organization_id", orgId);
  const ids = (data ?? []).map((r) => r.locality_id);
  if (!ids.length) return [];
  const { data: locs } = await db.from("israel_localities").select("id,name_he,name_en").in("id", ids);
  return (locs ?? []).map((l) => ({ id: l.id, nameHe: l.name_he, nameEn: l.name_en }));
}

/** Core snapshot generation (works for both RLS user + service-role cron). */
async function buildSnapshots(db: DB, orgId: string): Promise<MarketSnapshotSummary> {
  const localities = await activeLocalities(db, orgId);
  if (!localities.length) return { localities: 0, snapshots: 0 };

  const dropSince = new Date(Date.now() - 14 * DAY).toISOString();
  const newSince = new Date(Date.now() - 7 * DAY).toISOString();
  const [extRes, propRes, buyersRes, intelRes, matchRes, relRes, histRes, dupRes] = await Promise.all([
    db.from("external_listings").select("id,city,price,sqm,rooms,has_agent,first_seen_at").eq("status", "active").is("promoted_property_id", null).limit(2000),
    db.from("properties").select("id,city,status,is_exclusive,exclusivity_scope").neq("status", "archived").limit(2000),
    db.from("buyers").select("id,preferred_areas,readiness,has_preapproval").limit(2000),
    db.from("buyer_intelligence_profiles").select("buyer_id,buyer_readiness_score,buyer_engagement_score").limit(2000),
    db.from("match_intelligence_profiles").select("property_id,match_status,match_stage").limit(2000),
    db.from("entity_relationships").select("target_entity_id,relationship_type").eq("target_entity_type", "property").in("relationship_type", ["buyer_viewed_property", "buyer_liked_property", "buyer_visited_property"]).eq("status", "active").limit(4000),
    db.from("external_listing_history").select("listing_id,created_at").eq("change_type", "price_changed").gte("created_at", dropSince).limit(4000),
    db.from("external_listing_duplicates").select("listing_id").eq("status", "suspected").limit(4000),
  ]);

  const ext = extRes.data ?? [];
  const props = propRes.data ?? [];
  const buyers = buyersRes.data ?? [];
  const intel = new Map((intelRes.data ?? []).map((b) => [b.buyer_id, b]));
  const matches = (matchRes.data ?? []).filter((m) => m.match_status === "active");
  const rels = relRes.data ?? [];
  const dropListingIds = new Set((histRes.data ?? []).map((h) => h.listing_id));
  const dupListingIds = new Set((dupRes.data ?? []).map((d) => d.listing_id));

  const propCity = new Map(props.map((p) => [p.id, p.city]));
  const today = new Date().toISOString().slice(0, 10);
  const rows: Database["public"]["Tables"]["market_area_snapshots"]["Insert"][] = [];

  for (const loc of localities) {
    const locExt = ext.filter((l) => cityMatches(l.city, loc));
    const locProps = props.filter((p) => cityMatches(p.city, loc));
    const prices = locExt.map((l) => l.price).filter((p): p is number => p != null && p > 0);
    const sqmPrices = locExt.filter((l) => l.price && l.sqm).map((l) => l.price! / l.sqm!);
    const avgSqm = sqmPrices.length ? sqmPrices.reduce((a, b) => a + b, 0) / sqmPrices.length : 0;
    const rooms = locExt.map((l) => l.rooms).filter((r): r is number => r != null);

    const priceDrops = locExt.filter((l) => dropListingIds.has(l.id)).length;
    const duplicates = locExt.filter((l) => dupListingIds.has(l.id)).length;
    const privateOwners = locExt.filter((l) => l.has_agent === false).length;
    const newListings = locExt.filter((l) => l.first_seen_at && l.first_seen_at >= newSince).length;
    const belowAverage = avgSqm > 0 ? locExt.filter((l) => l.price && l.sqm && l.price / l.sqm <= avgSqm * 0.9).length : 0;
    const officeExclusive = locProps.filter((p) => p.is_exclusive === true || p.exclusivity_scope === "office_exclusive" || p.exclusivity_scope === "agent_exclusive").length;

    const locBuyers = buyers.filter((b) => (b.preferred_areas ?? []).some((a) => cityMatches(a, loc)));
    const readinessVals = locBuyers.map((b) => intel.get(b.id)?.buyer_readiness_score ?? b.readiness ?? 0).filter((n) => n > 0);
    const engagementVals = locBuyers.map((b) => intel.get(b.id)?.buyer_engagement_score ?? 0).filter((n) => n > 0);
    const avgReadiness = readinessVals.length ? readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length : 0;
    const avgEngagement = engagementVals.length ? engagementVals.reduce((a, b) => a + b, 0) / engagementVals.length : 0;
    const readyBuyers = locBuyers.filter((b) => (intel.get(b.id)?.buyer_readiness_score ?? b.readiness ?? 0) >= 70).length;

    const matchedBuyers = matches.filter((m) => cityMatches(propCity.get(m.property_id) ?? null, loc)).length;
    const relationshipSignals = rels.filter((r) => cityMatches(propCity.get(r.target_entity_id) ?? null, loc)).length;

    const demand = calculateDemandScore({ activeBuyers: locBuyers.length, avgBuyerReadiness: avgReadiness, avgBuyerEngagement: avgEngagement, matchedBuyers, relationshipSignals });
    const supply = calculateSupplyScore({ externalListings: locExt.length, internalProperties: locProps.length, newListings, priceDrops, duplicates, privateOwners });
    const opportunity = calculateOpportunityScore({ demand, supply, belowAverage, priceDrops, readyBuyers, officeExclusiveCount: officeExclusive });
    const heat = calculateHeatLevel(demand, supply, opportunity);

    rows.push({
      organization_id: orgId, locality_id: loc.id, locality_name: loc.nameHe, date: today,
      active_external_listings: locExt.length, active_internal_properties: locProps.length,
      avg_price: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      avg_price_per_sqm: avgSqm ? Math.round(avgSqm) : null,
      median_price: median(prices), min_price: prices.length ? Math.min(...prices) : null, max_price: prices.length ? Math.max(...prices) : null,
      avg_rooms: rooms.length ? Math.round((rooms.reduce((a, b) => a + b, 0) / rooms.length) * 10) / 10 : null,
      price_drops_count: priceDrops, below_average_count: belowAverage, private_owner_count: privateOwners,
      duplicate_candidates_count: duplicates, active_buyers_count: locBuyers.length, matched_buyers_count: matchedBuyers,
      demand_score: demand, supply_score: supply, opportunity_score: opportunity, heat_level: heat,
      metadata: { readyBuyers, newListings, officeExclusive, relationshipSignals } as never,
    });
  }

  if (rows.length) {
    const { error } = await db.from("market_area_snapshots").upsert(rows as never, { onConflict: "organization_id,locality_name,date" });
    if (error) throw new Error(error.message);
  }
  return { localities: localities.length, snapshots: rows.length };
}

/** User-triggered (RLS, session org). */
export async function generateMarketSnapshotsForOrganization(): Promise<MarketSnapshotSummary> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  const db = (await createClient()) as unknown as DB;
  return buildSnapshots(db, profile.org_id);
}

/** Cron-safe (service-role). Not wired to any schedule yet — call explicitly. */
export async function generateMarketSnapshotsForOrg(orgId: string): Promise<MarketSnapshotSummary> {
  const db = createServiceRoleClient() as unknown as DB;
  return buildSnapshots(db, orgId);
}

export interface MarketHeatmapCell {
  localityId: string | null;
  localityName: string;
  date: string;
  demand: number;
  supply: number;
  opportunity: number;
  heatLevel: HeatLevel;
  heatLabel: string;
  tone: "green" | "gold" | "red" | "purple" | "blue";
  avgPricePerSqm: number | null;
  avgPrice: number | null;
  externalListings: number;
  internalProperties: number;
  priceDrops: number;
  belowAverage: number;
  activeBuyers: number;
  matchedBuyers: number;
}

/** Latest snapshot per locality for the session org. */
export async function getCurrentMarketHeatmap(): Promise<MarketHeatmapCell[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("market_area_snapshots").select("*")
    .order("date", { ascending: false }).order("opportunity_score", { ascending: false }).limit(500);
  const seen = new Set<string>();
  const cells: MarketHeatmapCell[] = [];
  for (const s of (data ?? []) as SnapshotRow[]) {
    if (seen.has(s.locality_name)) continue;
    seen.add(s.locality_name);
    const heat = (s.heat_level as HeatLevel) ?? "cool";
    cells.push({
      localityId: s.locality_id, localityName: s.locality_name, date: s.date,
      demand: s.demand_score, supply: s.supply_score, opportunity: s.opportunity_score,
      heatLevel: heat, heatLabel: HEAT_LABEL[heat] ?? "—", tone: HEAT_TONE[heat] ?? "blue",
      avgPricePerSqm: s.avg_price_per_sqm, avgPrice: s.avg_price,
      externalListings: s.active_external_listings, internalProperties: s.active_internal_properties,
      priceDrops: s.price_drops_count, belowAverage: s.below_average_count,
      activeBuyers: s.active_buyers_count, matchedBuyers: s.matched_buyers_count,
    });
  }
  return cells.sort((a, b) => b.opportunity - a.opportunity || b.demand - a.demand);
}
