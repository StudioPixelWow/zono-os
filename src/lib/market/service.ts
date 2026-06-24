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
  calculateInventoryScore, calculateTransactionScore, calculateMomentum, calculateCompetitionScore,
  calculateOpportunityScoreV2, classifyMarketScore, buildScoreReasons,
  HEAT_LABEL, HEAT_TONE, MOMENTUM_LABEL, type HeatLevel, type MomentumClass, type MarketBandKey,
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
  const today = new Date().toISOString().slice(0, 10);
  const tx90Since = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
  const tx180Since = new Date(Date.now() - 180 * DAY).toISOString().slice(0, 10);
  // Real closed transactions (GovMap/Madlan) + the most recent PRIOR snapshot per
  // locality (for momentum). Both org-scoped; no fabricated data.
  const [txRes, priorSnapRes] = await Promise.all([
    db.from("property_transactions").select("city_name,deal_date").eq("organization_id", orgId).limit(8000),
    db.from("market_area_snapshots").select("locality_name,demand_score,opportunity_score,avg_price_per_sqm,active_external_listings,active_internal_properties,date,metadata").eq("organization_id", orgId).lt("date", today).order("date", { ascending: false }).limit(2000),
  ]);
  const txRows = txRes.data ?? [];
  // Most recent prior snapshot per locality_name.
  const priorByLoc = new Map<string, { demand: number; opportunity: number; avgSqm: number | null; listings: number; tx90: number }>();
  for (const p of (priorSnapRes.data ?? [])) {
    if (priorByLoc.has(p.locality_name)) continue;
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    priorByLoc.set(p.locality_name, {
      demand: p.demand_score, opportunity: p.opportunity_score, avgSqm: p.avg_price_per_sqm,
      listings: (p.active_external_listings ?? 0) + (p.active_internal_properties ?? 0),
      tx90: typeof meta.tx90 === "number" ? (meta.tx90 as number) : 0,
    });
  }

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
    const heat = calculateHeatLevel(demand, supply, calculateOpportunityScore({ demand, supply, belowAverage, priceDrops, readyBuyers, officeExclusiveCount: officeExclusive }));

    // ── PHASE 25.1 — real locality intelligence (every input is counted data) ──
    const agentListings = locExt.filter((l) => l.has_agent === true).length;
    const locTx = txRows.filter((t) => cityMatches(t.city_name, loc));
    const tx90 = locTx.filter((t) => t.deal_date && t.deal_date >= tx90Since).length;
    const txPrev90 = locTx.filter((t) => t.deal_date && t.deal_date >= tx180Since && t.deal_date < tx90Since).length;
    const listings = locExt.length + locProps.length;

    const inventory = calculateInventoryScore({ externalListings: locExt.length, internalProperties: locProps.length, newListings, priceDrops });
    const transaction = calculateTransactionScore({ tx90, txPrev90, txTotal: locTx.length });
    const competition = calculateCompetitionScore({ agentListings, totalListings: listings });

    const prior = priorByLoc.get(loc.nameHe);
    const priceSqmDeltaPct = prior?.avgSqm && avgSqm ? Math.round(((avgSqm - prior.avgSqm) / prior.avgSqm) * 1000) / 10 : 0;
    const momentum = calculateMomentum({
      hasHistory: !!prior,
      demandDelta: prior ? demand - prior.demand : 0,
      // momentum is computed before opportunity v2 (avoids circularity); it relies
      // on demand/price/tx/listing trends, so opportunityDelta stays 0 here.
      opportunityDelta: 0,
      pricePerSqmDeltaPct: priceSqmDeltaPct,
      listingDelta: prior ? listings - prior.listings : 0,
      txDelta: prior ? tx90 - prior.tx90 : 0,
    });

    const opportunity = calculateOpportunityScoreV2({ inventory, demand, transaction, momentum: momentum.score, competition });
    const band = classifyMarketScore(opportunity);
    const reasons = buildScoreReasons({
      demand, activeBuyers: locBuyers.length, readyBuyers,
      inventory, listings, newListings,
      transaction, tx90, txPrev90,
      momentum, pricePerSqmDeltaPct: priceSqmDeltaPct, hasHistory: !!prior,
      competition, agentListings, priceDrops, belowAverage,
    });

    rows.push({
      organization_id: orgId, locality_id: loc.id, locality_name: loc.nameHe, date: today,
      active_external_listings: locExt.length, active_internal_properties: locProps.length,
      avg_price: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      avg_price_per_sqm: avgSqm ? Math.round(avgSqm) : null,
      median_price: median(prices), min_price: prices.length ? Math.min(...prices) : null, max_price: prices.length ? Math.max(...prices) : null,
      avg_rooms: rooms.length ? Math.round((rooms.reduce((a, b) => a + b, 0) / rooms.length) * 10) / 10 : null,
      price_drops_count: priceDrops, below_average_count: belowAverage, private_owner_count: privateOwners,
      duplicate_candidates_count: duplicates, active_buyers_count: locBuyers.length, matched_buyers_count: matchedBuyers,
      // opportunity_score now holds the explainable v2 opportunity; demand/supply unchanged.
      demand_score: demand, supply_score: supply, opportunity_score: opportunity, heat_level: heat,
      metadata: {
        readyBuyers, newListings, officeExclusive, relationshipSignals,
        // Phase 25.1 extended, traceable scores:
        inventory_score: inventory, transaction_score: transaction, competition_score: competition,
        momentum_score: momentum.score, momentum_class: momentum.class,
        band_key: band.key, band_label: band.label, band_tone: band.tone,
        tx90, tx_prev90: txPrev90, agent_listings: agentListings, price_sqm_delta_pct: priceSqmDeltaPct,
        reasons,
      } as never,
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
  // ── Phase 25.1 — explainable locality intelligence ──
  inventoryScore: number;
  transactionScore: number;
  competitionScore: number;
  momentumScore: number;
  momentumClass: MomentumClass;
  momentumLabel: string;
  bandKey: MarketBandKey;
  bandLabel: string;
  /** Human, traceable reasons for the opportunity score. */
  reasons: string[];
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
    const m = (s.metadata ?? {}) as Record<string, unknown>;
    const num = (k: string, d = 0) => (typeof m[k] === "number" ? (m[k] as number) : d);
    const momentumClass = (typeof m.momentum_class === "string" ? m.momentum_class : "stable") as MomentumClass;
    const bandKey = (typeof m.band_key === "string" ? m.band_key : "neutral") as MarketBandKey;
    const bandLabel = typeof m.band_label === "string" ? (m.band_label as string) : "ניטרלי";
    const bandTone = (typeof m.band_tone === "string" ? m.band_tone : null) as MarketHeatmapCell["tone"] | null;
    const reasons = Array.isArray(m.reasons) ? (m.reasons as string[]) : [];
    cells.push({
      localityId: s.locality_id, localityName: s.locality_name, date: s.date,
      demand: s.demand_score, supply: s.supply_score, opportunity: s.opportunity_score,
      heatLevel: heat, heatLabel: HEAT_LABEL[heat] ?? "—",
      // Real opportunity band drives the tone (falls back to heat tone for legacy rows).
      tone: bandTone ?? HEAT_TONE[heat] ?? "blue",
      avgPricePerSqm: s.avg_price_per_sqm, avgPrice: s.avg_price,
      externalListings: s.active_external_listings, internalProperties: s.active_internal_properties,
      priceDrops: s.price_drops_count, belowAverage: s.below_average_count,
      activeBuyers: s.active_buyers_count, matchedBuyers: s.matched_buyers_count,
      inventoryScore: num("inventory_score"), transactionScore: num("transaction_score"),
      competitionScore: num("competition_score"), momentumScore: num("momentum_score", 50),
      momentumClass, momentumLabel: MOMENTUM_LABEL[momentumClass],
      bandKey, bandLabel, reasons,
    });
  }
  return cells.sort((a, b) => b.opportunity - a.opportunity || b.demand - a.demand);
}
