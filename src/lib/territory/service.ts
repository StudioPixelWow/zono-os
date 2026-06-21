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
import {
  buildScoredRecommendation, type EvidenceItem, type RecommendationType,
} from "@/lib/recommendations/engine";

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

  const [txnR, propR, extR, buyersR, compR, recR, agentsR, matchR, streetR, buildingR] = await Promise.all([
    supabase.from("property_transactions").select("city_name,neighborhood_name,deal_date,price_per_sqm").eq("organization_id", orgId).limit(20000),
    supabase.from("properties").select("id,city,neighborhood,status,type").eq("org_id", orgId).limit(20000),
    supabase.from("external_listings").select("city,neighborhood").eq("org_id", orgId).limit(20000),
    supabase.from("buyers").select("preferred_areas,preferred_types").eq("org_id", orgId).limit(20000),
    supabase.from("competitor_market_positions").select("locality,competitor_profile_id,listings_count,private_seller_loss_count").eq("organization_id", orgId).limit(20000),
    supabase.from("recommendations").select("supporting_geo").eq("organization_id", orgId).in("status", ["new", "reviewed"]).limit(20000),
    supabase.from("user_operating_localities").select("city_name,user_id,is_active").eq("organization_id", orgId).limit(20000),
    // Part 5: real pipeline mapping via match property_id → territory geo.
    supabase.from("match_intelligence_profiles").select("property_id,match_status,closing_probability,estimated_deal_value,estimated_commission").eq("org_id", orgId).limit(20000),
    // Parts 3-4: consume already-computed transaction-derived intelligence.
    supabase.from("street_intelligence").select("city_name,street,transactions_count,avg_price_per_sqm,price_trend_6m,price_trend_12m,liquidity_score,street_score,confidence_score").eq("organization_id", orgId).limit(20000),
    supabase.from("building_intelligence").select("city_name,street,house_number,normalized_address,transactions_count,last_transaction_date,avg_price_per_sqm,price_trend_12m,confidence_score").eq("organization_id", orgId).limit(20000),
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

  // Internal properties → inventory + active deals + geo map + dominant type
  const propGeo = new Map<string, { city: string; neighborhood: string | null }>();
  const propTypeByKey = new Map<string, Map<string, number>>(); // territory_key → type → count
  const bumpType = (key: string, type: string | null) => { if (!type) return; const m = propTypeByKey.get(key) ?? new Map(); m.set(type, (m.get(type) ?? 0) + 1); propTypeByKey.set(key, m); };
  for (const p of (propR.data ?? []) as { id: string; city: string | null; neighborhood: string | null; status: string; type: string | null }[]) {
    if (!p.city) continue;
    propGeo.set(p.id, { city: cityKey(p.city), neighborhood: p.neighborhood ? p.neighborhood.trim() : null });
    const active = !["sold", "rented", "withdrawn", "archived", "draft"].includes(p.status);
    const deal = p.status === "under_offer";
    const apply = (a: Agg, key: string) => { if (active) a.internalInventory++; a.activeProperties++; if (deal) a.activeDeals++; bumpType(key, p.type); };
    apply(getCity(p.city), cityKey(p.city));
    if (p.neighborhood) apply(getHood(p.city, p.neighborhood), hoodKey(p.city, p.neighborhood));
  }

  // Dominant buyer type per city (from preferred_types)
  const buyerTypeByCity = new Map<string, Map<string, number>>();

  // External inventory
  for (const e of (extR.data ?? []) as { city: string | null; neighborhood: string | null }[]) {
    if (!e.city) continue;
    getCity(e.city).externalInventory++;
    if (e.neighborhood) getHood(e.city, e.neighborhood).externalInventory++;
  }

  // Buyers → demand per preferred city + dominant buyer type per city.
  for (const b of (buyersR.data ?? []) as { preferred_areas: string[] | null; preferred_types: string[] | null }[]) {
    for (const area of b.preferred_areas ?? []) {
      if (!area) continue;
      getCity(area).activeBuyers++;
      const k = cityKey(area);
      const tm = buyerTypeByCity.get(k) ?? new Map<string, number>();
      for (const ty of b.preferred_types ?? []) { if (ty) tm.set(ty, (tm.get(ty) ?? 0) + 1); }
      buyerTypeByCity.set(k, tm);
    }
  }

  // Part 5: map matches → territory via property geo (real pipeline, not just under_offer).
  const matchAggByKey = new Map<string, { matches: number; likely: number; atRisk: number; revenue: number; commission: number }>();
  const bumpMatch = (key: string, m: { closing: number; commission: number; value: number }) => {
    const a = matchAggByKey.get(key) ?? { matches: 0, likely: 0, atRisk: 0, revenue: 0, commission: 0 };
    a.matches++;
    if (m.closing >= 60) a.likely++;
    if (m.closing < 40) a.atRisk++;
    a.commission += Math.round((m.commission || 0) * (m.closing / 100));
    a.revenue += Math.round((m.value || 0) * (m.closing / 100));
    matchAggByKey.set(key, a);
  };
  for (const m of (matchR.data ?? []) as { property_id: string; match_status: string; closing_probability: number; estimated_deal_value: number | null; estimated_commission: number | null }[]) {
    if (m.match_status !== "active") continue;
    const geo = propGeo.get(m.property_id); if (!geo) continue;
    const payload = { closing: m.closing_probability ?? 0, commission: m.estimated_commission ?? 0, value: m.estimated_deal_value ?? 0 };
    bumpMatch(cityKey(geo.city), payload);
    if (geo.neighborhood) bumpMatch(hoodKey(geo.city, geo.neighborhood), payload);
    const cAgg = getCity(geo.city); cAgg.activeMatches++;
    if (geo.neighborhood) getHood(geo.city, geo.neighborhood).activeMatches++;
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

  const dominant = (m: Map<string, number> | undefined): string | null => {
    if (!m || !m.size) return null;
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const rows = allAggs.map(({ type, key, agg }) => {
    agg.avgPriceSqm = agg.ppsqmCount ? Math.round(agg.ppsqmSum / agg.ppsqmCount) : null;
    const s: TerritoryScores = scoreTerritory(agg);
    // Part 5: prefer real pipeline revenue (match commission × probability) over estimate.
    const mAgg = matchAggByKey.get(key);
    const expectedRevenue = mAgg && mAgg.commission > 0 ? mAgg.commission : s.expected_revenue;
    const dominantPropertyType = dominant(propTypeByKey.get(key));
    const dominantBuyerType = dominant(buyerTypeByCity.get(agg.city));
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
      avg_price_sqm: agg.avgPriceSqm, expected_revenue: expectedRevenue,
      expected_commission: Math.round(expectedRevenue),
      competitor_count: agg.competitorCount, assigned_agents_count: agg.assignedAgents,
      recommendation_count: agg.recommendationCount, confidence_score: s.confidence_score,
      summary_hebrew: `${s.territory_level} · הזדמנות ${s.opportunity_score} · שטח לבן ${s.white_space_score}`,
      last_calculated_at: new Date().toISOString(),
      _scores: s, _agg: agg, _dominantPropertyType: dominantPropertyType, _dominantBuyerType: dominantBuyerType,
      _likelyCloses: mAgg?.likely ?? 0, _atRisk: mAgg?.atRisk ?? 0,
    };
  });

  if (!rows.length) return { territories: 0, signals: 0 };

  // Upsert profiles (strip helper fields).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const persistRows = rows.map(({ _scores, _agg, _dominantPropertyType, _dominantBuyerType, _likelyCloses, _atRisk, ...r }) => r);
  await supabase.from("territory_profiles").upsert(persistRows as never, { onConflict: "organization_id,territory_type,territory_key" });

  // Re-read ids for signal/dna/snapshot linkage.
  const { data: saved } = await supabase.from("territory_profiles")
    .select("id,territory_type,territory_key").eq("organization_id", orgId);
  const idByKey = new Map<string, string>();
  for (const s of (saved ?? []) as { id: string; territory_type: string; territory_key: string }[]) idByKey.set(`${s.territory_type}|${s.territory_key}`, s.id);

  // Regenerate signals (clear open, insert fresh). Build DNA + snapshots inline.
  await supabase.from("territory_signals").delete().eq("organization_id", orgId).eq("status", "open");
  const signalRows: Record<string, unknown>[] = [];
  const snapshotRows: Record<string, unknown>[] = [];
  const dnaRows: Record<string, unknown>[] = [];
  const graphNodes: Record<string, unknown>[] = [];
  for (const r of rows) {
    const pid = idByKey.get(`${r.territory_type}|${r.territory_key}`);
    if (!pid) continue;
    const name = r.neighborhood_name ? `${r.city_name} · ${r.neighborhood_name}` : r.city_name ?? r.territory_key;
    const sigs = generateTerritorySignals(name, r._scores, r._agg);
    for (const sig of sigs) {
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

    // Part 2: Territory DNA (derived from real aggregates; honest confidence).
    const a = r._agg, sc = r._scores;
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    if (sc.demand_score >= 60) strengths.push("ביקוש גבוה"); else if (sc.demand_score <= 30) weaknesses.push("ביקוש נמוך");
    if (sc.penetration_score >= 55) strengths.push("חדירה חזקה"); else if (sc.penetration_score <= 30) weaknesses.push("חדירה נמוכה");
    if (sc.acquisition_score >= 60) strengths.push("פוטנציאל גיוס");
    if (sc.competition_score >= 60) weaknesses.push("תחרות גבוהה");
    if (sc.supply_score <= 30 && sc.demand_score >= 50) weaknesses.push("מחסור מלאי");
    const strategy = sc.white_space_score >= 60 ? "כניסה אגרסיבית: גייס מלאי ומקד שיווק"
      : sc.dominance_score >= 60 ? "שמירה על שליטה: העמק קשרים והגן על נתח"
      : sc.opportunity_score >= 60 ? "השקעה ממוקדת בהזדמנות" : "מעקב ובחינת כדאיות";
    dnaRows.push({
      organization_id: orgId, territory_profile_id: pid,
      strongest_property_type: r._dominantPropertyType, strongest_buyer_type: r._dominantBuyerType,
      transaction_velocity: clampNum(a.transactionVolume90d * 10), inventory_balance: clampNum(sc.supply_score - sc.demand_score + 50),
      buyer_demand: sc.demand_score, seller_activity: clampNum(a.activeSellers * 15 + a.privateSellerCount! * 8),
      acquisition_potential: sc.acquisition_score, revenue_potential: sc.revenue_score,
      recommendation_density: clampNum(a.recommendationCount * 12),
      dna_summary_hebrew: `${name}: ${strengths.length ? "חוזק: " + strengths.join(", ") + ". " : ""}${weaknesses.length ? "חולשה: " + weaknesses.join(", ") + ". " : ""}אסטרטגיה: ${strategy}`,
      metadata: { strengths, weaknesses, recommended_strategy_hebrew: strategy, likely_closes: r._likelyCloses, at_risk_deals: r._atRisk } as never,
    });

    // Part 1: Knowledge Graph node for high-value territories only (no flooding).
    const highValue = sc.territory_health_score >= 60 || sc.opportunity_score >= 60
      || ["critical", "weak", "dominant"].includes(sc.territory_level) || sigs.length > 0;
    if (highValue) {
      graphNodes.push({
        organization_id: orgId, entity_type: "territory", entity_id: pid, title: name,
        subtitle: `${sc.territory_level} · הזדמנות ${sc.opportunity_score}`,
        health_score: clampNum(sc.territory_health_score), importance_score: clampNum(sc.opportunity_score),
        activity_score: clampNum(a.transactionVolume90d * 8 + a.activeMatches * 6),
        metadata: { territory_type: r.territory_type, white_space: sc.white_space_score, buyers: a.activeBuyers, properties: a.activeProperties, competitors: a.competitorCount } as never,
      });
    }
  }
  if (signalRows.length) await supabase.from("territory_signals").insert(signalRows as never);
  if (snapshotRows.length) await supabase.from("territory_snapshots").insert(snapshotRows as never);
  if (dnaRows.length) await supabase.from("territory_dna_profiles").upsert(dnaRows as never, { onConflict: "organization_id,territory_profile_id" });

  // Part 1: graph nodes + edges (territory↔competitor, neighborhood→city part_of).
  await populateTerritoryGraph(orgId, graphNodes, idByKey, cities, compR.data as never);

  // Part 3: street territory profiles (consume street_intelligence + org context).
  const streets = await populateStreetTerritories(orgId, streetR.data as never, cities);

  // Part 4: building cluster profiles (consume building_intelligence).
  const clusters = await populateBuildingClusters(orgId, buildingR.data as never);

  return { territories: rows.length, signals: signalRows.length, dna: dnaRows.length, graphNodes: graphNodes.length, streets, clusters };
}

const clampNum = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

// ── Final Patch: Territory → Recommendation OS ───────────────────────────────
const SIGNAL_REC_TYPE: Record<string, RecommendationType | undefined> = {
  white_space: "territory_marketing", revenue_opportunity: "territory_revenue",
  acquisition_hotspot: "territory_acquisition", inventory_gap: "territory_acquisition",
  competitor_dominance: "territory_competitor_threat", agent_gap: "territory_coverage_gap",
  office_gap: "territory_coverage_gap", growth_area: "territory_focus",
};

/**
 * Build territory-sourced recommendations from the latest territory signals,
 * top streets and top building clusters, and write them into the Recommendation
 * OS (`recommendations` table). Evidence-gated via the recommendation engine.
 * Regenerates: clears prior un-actioned territory recs first. Review-only.
 */
export async function generateTerritoryRecommendations() {
  const { orgId } = await ctx();
  const supabase = await createClient();

  const [sigR, streetR, clusterR] = await Promise.all([
    supabase.from("territory_signals").select("territory_profile_id,signal_type,score,confidence_score,title,reason,recommended_action").eq("organization_id", orgId).eq("status", "open").gte("score", 55).order("score", { ascending: false }).limit(60),
    supabase.from("street_territory_profiles").select("id,city_name,street,revenue_opportunity,acquisition_opportunity,buyer_trend,transaction_count_365d,confidence_score").eq("organization_id", orgId).order("revenue_opportunity", { ascending: false }).limit(15),
    supabase.from("building_cluster_profiles").select("id,city_name,street,cluster_key,turnover_score,acquisition_score,transaction_count,confidence_score").eq("organization_id", orgId).order("turnover_score", { ascending: false }).limit(15),
  ]);

  type Row = Record<string, unknown>;
  const rows: Row[] = [];
  const push = (
    type: RecommendationType, sourceType: string, sourceId: string, targetType: string, targetId: string | null,
    title: string, opportunity: number, evidence: EvidenceItem[], reason: string,
  ) => {
    const scored = buildScoredRecommendation({
      type, evidence,
      signals: { revenueImpact: opportunity, marketDemand: opportunity, urgencySignal: clampNum(opportunity * 0.8), entityFit: opportunity },
    });
    rows.push({
      organization_id: orgId, source_entity_type: sourceType, source_entity_id: sourceId,
      target_entity_type: targetType, target_entity_id: targetId, recommendation_type: type,
      title_hebrew: title, reason_hebrew: scored.reason_hebrew, next_best_action_hebrew: scored.next_best_action_hebrew,
      recommendation_score: scored.recommendation_score, confidence_score: scored.confidence_score,
      urgency_score: scored.urgency_score, impact_score: scored.impact_score,
      expected_revenue: scored.expected_revenue, expected_commission: scored.expected_commission,
      expected_conversion_lift: scored.expected_conversion_lift, evidence: evidence as never,
      supporting_geo: {} as never, supporting_market: {} as never,
      status: "new", review_status: scored.review_status, source_confidence: scored.source_confidence,
      generated_by: "territory_engine", generation_reason: reason,
    });
  };

  // From signals
  for (const s of (sigR.data ?? []) as { territory_profile_id: string | null; signal_type: string; score: number; confidence_score: number; title: string; reason: string | null }[]) {
    const type = SIGNAL_REC_TYPE[s.signal_type];
    if (!type || !s.territory_profile_id) continue;
    push(type, "territory", s.territory_profile_id, "territory", s.territory_profile_id, s.title,
      s.score, [{ kind: "geo", label_hebrew: s.reason ?? s.title, weight: clampNum(s.score) }], `territory_signal_${s.signal_type}`);
  }
  // From streets
  for (const st of ((streetR.data ?? []) as { id: string; city_name: string | null; street: string; revenue_opportunity: number; transaction_count_365d: number; confidence_score: number }[]).filter((x) => x.revenue_opportunity >= 55).slice(0, 8)) {
    push("street_focus", "street", st.id, "street", st.id, `התמקד ברחוב ${st.city_name} · ${st.street}`,
      st.revenue_opportunity, [{ kind: "transaction", label_hebrew: `${st.transaction_count_365d} עסקאות · פוטנציאל הכנסה ${st.revenue_opportunity}`, weight: clampNum(st.revenue_opportunity), detail: "מבוסס מודיעין רחוב" }], "street_revenue_opportunity");
  }
  // From building clusters
  for (const c of ((clusterR.data ?? []) as { id: string; city_name: string | null; street: string | null; turnover_score: number; acquisition_score: number; transaction_count: number }[]).filter((x) => x.turnover_score >= 55 || x.acquisition_score >= 55).slice(0, 8)) {
    push("building_cluster_focus", "building_cluster", c.id, "building", c.id, `גייס נכסים בבניין ${c.city_name}${c.street ? " · " + c.street : ""}`,
      Math.max(c.turnover_score, c.acquisition_score), [{ kind: "transaction", label_hebrew: `תחלופה ${c.turnover_score} · ${c.transaction_count} עסקאות`, weight: clampNum(Math.max(c.turnover_score, c.acquisition_score)), detail: "מבוסס מודיעין בניין" }], "building_turnover");
  }

  // Regenerate: clear prior un-actioned territory recs, then insert.
  await supabase.from("recommendations").delete().eq("organization_id", orgId).eq("generated_by", "territory_engine").in("status", ["new", "reviewed"]);
  if (!rows.length) return { created: 0 };
  const { data, error } = await supabase.from("recommendations").insert(rows as never).select("id");
  if (error) throw new Error(error.message);
  const ids = (data ?? []) as { id: string }[];
  if (ids.length) {
    await supabase.from("recommendation_events").insert(ids.map((r) => ({ organization_id: orgId, recommendation_id: r.id, event_type: "generated" })) as never);
  }
  return { created: ids.length };
}

// ── Part 1: Knowledge Graph (nodes for high-value territories + edges) ────────
async function populateTerritoryGraph(
  orgId: string, nodes: Record<string, unknown>[], idByKey: Map<string, string>,
  cities: Map<string, Agg>, comps: { locality: string | null; competitor_profile_id: string; listings_count: number }[],
) {
  const supabase = await createClient();
  if (!nodes.length) return;
  await supabase.from("graph_entities").upsert(nodes as never, { onConflict: "organization_id,entity_type,entity_id" });

  const edges: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  const nodePids = new Set(nodes.map((n) => n.entity_id as string));

  // territory↔competitor: link each city territory to its competitors (bounded).
  const byCity = new Map<string, { id: string; listings: number }[]>();
  for (const c of comps ?? []) {
    if (!c.locality) continue;
    const arr = byCity.get(cityKey(c.locality)) ?? []; arr.push({ id: c.competitor_profile_id, listings: c.listings_count ?? 0 }); byCity.set(cityKey(c.locality), arr);
  }
  for (const [city, list] of byCity) {
    const pid = idByKey.get(`city|${city}`);
    if (!pid || !nodePids.has(pid)) continue;
    for (const c of list.slice(0, 5)) {
      edges.push({
        organization_id: orgId, source_entity_type: "territory", source_entity_id: pid,
        target_entity_type: "competitor", target_entity_id: c.id, relationship_type: "competes_in",
        strength_score: clampNum(40 + c.listings * 5), confidence_score: 70, relationship_status: "active",
        first_seen_at: now, last_seen_at: now,
      });
    }
  }
  // neighborhood→city part_of edges (only when both are high-value nodes).
  for (const [key, pid] of idByKey) {
    if (!key.startsWith("neighborhood|") || !nodePids.has(pid)) continue;
    const cityName = (cities.size ? key.slice("neighborhood|".length).split("|")[0] : "");
    const cityPid = idByKey.get(`city|${cityName}`);
    if (cityPid && nodePids.has(cityPid)) {
      edges.push({
        organization_id: orgId, source_entity_type: "territory", source_entity_id: pid,
        target_entity_type: "territory", target_entity_id: cityPid, relationship_type: "part_of",
        strength_score: 80, confidence_score: 90, relationship_status: "active", first_seen_at: now, last_seen_at: now,
      });
    }
  }
  if (edges.length) await supabase.from("graph_relationships").upsert(edges as never, { onConflict: "organization_id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type" });
}

// ── Part 3: Street Territory 2.0 (consume street_intelligence + org context) ──
interface StreetIntel { city_name: string | null; street: string | null; transactions_count: number; avg_price_per_sqm: number | null; price_trend_6m: number | null; price_trend_12m: number | null; liquidity_score: number | null; street_score: number | null; confidence_score: number }
async function populateStreetTerritories(orgId: string, streetIntel: StreetIntel[], cities: Map<string, Agg>): Promise<number> {
  const supabase = await createClient();
  const rows = (streetIntel ?? []).filter((s) => s.city_name && s.street).map((s) => {
    const city = cities.get(cityKey(s.city_name!));
    const competitorPressure = city ? clampNum((city.competitorCount ?? 0) * 12 + (city.competitorListings ?? 0) * 2) : 0;
    const buyerDemand = city ? clampNum((city.activeBuyers ?? 0) * 8 + (s.transactions_count ?? 0) * 4) : clampNum((s.transactions_count ?? 0) * 4);
    const officePenetration = city ? clampNum((city.internalInventory ?? 0) * 6) : 0;
    const liquidity = s.liquidity_score ?? clampNum((s.transactions_count ?? 0) * 6);
    const trend = s.price_trend_12m ?? 0;
    const acquisitionOpp = clampNum(50 + trend * 2 + (city?.privateSellerCount ?? 0) * 5);
    const revenueOpp = clampNum((s.avg_price_per_sqm ?? 0) / 600 + (s.transactions_count ?? 0) * 4 + buyerDemand * 0.3);
    const streetScore = clampNum((s.street_score ?? 0) * 0.4 + buyerDemand * 0.3 + liquidity * 0.3);
    return {
      organization_id: orgId, city_name: cityKey(s.city_name!), neighborhood_name: null, street: s.street!.trim(),
      transaction_trend: clampNum(50 + trend), buyer_trend: buyerDemand, seller_trend: clampNum((city?.privateSellerCount ?? 0) * 8),
      acquisition_opportunity: acquisitionOpp, competitor_pressure: competitorPressure, office_penetration: officePenetration,
      revenue_opportunity: revenueOpp, transaction_count_365d: s.transactions_count ?? 0, avg_price_sqm: s.avg_price_per_sqm,
      confidence_score: s.confidence_score ?? clampNum((s.transactions_count ?? 0) * 10),
      metadata: { liquidity_score: liquidity, street_territory_score: streetScore, price_trend_6m: s.price_trend_6m, price_trend_12m: s.price_trend_12m } as never,
    };
  });
  if (rows.length) await supabase.from("street_territory_profiles").upsert(rows as never, { onConflict: "organization_id,city_name,street" });
  return rows.length;
}

// ── Part 4: Building Cluster Intelligence (consume building_intelligence) ─────
interface BuildingIntel { city_name: string | null; street: string | null; house_number: string | null; normalized_address: string | null; transactions_count: number; last_transaction_date: string | null; avg_price_per_sqm: number | null; price_trend_12m: number | null; confidence_score: number }
async function populateBuildingClusters(orgId: string, buildingIntel: BuildingIntel[]): Promise<number> {
  const supabase = await createClient();
  const now = Date.now();
  const rows = (buildingIntel ?? []).filter((b) => b.city_name && (b.normalized_address || b.street)).map((b) => {
    const clusterKey = (b.normalized_address || `${b.city_name}|${b.street}|${b.house_number ?? ""}`).trim();
    const turnover = clampNum((b.transactions_count ?? 0) * 18);
    const recencyDays = b.last_transaction_date ? (now - new Date(b.last_transaction_date).getTime()) / DAY : 9999;
    const activity = clampNum(turnover * (recencyDays < 365 ? 1 : 0.5));
    const investor = clampNum(turnover * 0.6 + ((b.price_trend_12m ?? 0) > 0 ? 25 : 0));
    const acquisition = clampNum(turnover * 0.5 + (recencyDays > 730 ? 20 : 0));
    return {
      organization_id: orgId, city_name: cityKey(b.city_name!), neighborhood_name: null, street: b.street, cluster_key: clusterKey,
      turnover_score: turnover, investor_score: investor, acquisition_score: acquisition, activity_score: activity,
      transaction_count: b.transactions_count ?? 0, avg_price_sqm: b.avg_price_per_sqm,
      confidence_score: b.confidence_score ?? clampNum((b.transactions_count ?? 0) * 12),
      metadata: {
        last_transaction_date: b.last_transaction_date, price_trend_12m: b.price_trend_12m,
        recommended_action_hebrew: turnover >= 60 ? "בניין בעל תחלופה גבוהה — פנה לבעלים לגיוס" : acquisition >= 60 ? "פוטנציאל רכש — בדוק בעלים" : "מעקב",
      } as never,
    };
  });
  if (rows.length) await supabase.from("building_cluster_profiles").upsert(rows as never, { onConflict: "organization_id,cluster_key" });
  return rows.length;
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

export interface StreetTerritoryRow {
  id: string; city_name: string | null; street: string; transaction_trend: number; buyer_trend: number;
  acquisition_opportunity: number; competitor_pressure: number; office_penetration: number; revenue_opportunity: number;
  transaction_count_365d: number; avg_price_sqm: number | null; confidence_score: number;
}
export interface BuildingClusterRow {
  id: string; city_name: string | null; street: string | null; cluster_key: string; turnover_score: number;
  investor_score: number; acquisition_score: number; activity_score: number; transaction_count: number;
  avg_price_sqm: number | null; confidence_score: number;
}
export interface TerritoryDnaRow {
  id: string; territory_profile_id: string; strongest_property_type: string | null; strongest_buyer_type: string | null;
  buyer_demand: number; seller_activity: number; acquisition_potential: number; revenue_potential: number;
  recommendation_density: number; dna_summary_hebrew: string | null;
}

export interface TerritoryCommandCenter {
  total: number;
  strongest: TerritoryRow | null; fastestGrowing: TerritoryRow | null; highestRevenue: TerritoryRow | null;
  highestAcquisition: TerritoryRow | null; biggestThreat: TerritoryRow | null; biggestOpportunity: TerritoryRow | null;
  rankings: TerritoryRow[]; whiteSpace: TerritoryRow[]; dominance: TerritoryRow[]; revenueOps: TerritoryRow[];
  neighborhoods: TerritoryRow[]; signals: TerritorySignalRow[];
  streets: StreetTerritoryRow[]; clusters: BuildingClusterRow[]; dna: TerritoryDnaRow[];
  coverageGaps: TerritoryRow[];
  expectedRevenueTotal: number; graphNodes: number; lowConfidence: number;
}

const top = (rows: TerritoryRow[], key: keyof TerritoryRow) =>
  rows.length ? [...rows].sort((a, b) => (b[key] as number) - (a[key] as number))[0] : null;

export async function getTerritoryCommandCenter(): Promise<TerritoryCommandCenter> {
  const { orgId } = await ctx();
  const supabase = await createClient();
  const [profR, sigR, streetR, clusterR, dnaR, graphR] = await Promise.all([
    supabase.from("territory_profiles").select(TERR_COLS).eq("organization_id", orgId).limit(2000),
    supabase.from("territory_signals").select("id,territory_profile_id,signal_type,score,confidence_score,title,reason,recommended_action").eq("organization_id", orgId).eq("status", "open").order("score", { ascending: false }).limit(60),
    supabase.from("street_territory_profiles").select("id,city_name,street,transaction_trend,buyer_trend,acquisition_opportunity,competitor_pressure,office_penetration,revenue_opportunity,transaction_count_365d,avg_price_sqm,confidence_score").eq("organization_id", orgId).order("revenue_opportunity", { ascending: false }).limit(40),
    supabase.from("building_cluster_profiles").select("id,city_name,street,cluster_key,turnover_score,investor_score,acquisition_score,activity_score,transaction_count,avg_price_sqm,confidence_score").eq("organization_id", orgId).order("turnover_score", { ascending: false }).limit(40),
    supabase.from("territory_dna_profiles").select("id,territory_profile_id,strongest_property_type,strongest_buyer_type,buyer_demand,seller_activity,acquisition_potential,revenue_potential,recommendation_density,dna_summary_hebrew").eq("organization_id", orgId).order("revenue_potential", { ascending: false }).limit(20),
    supabase.from("graph_entities").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("entity_type", "territory"),
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
    streets: (streetR.data ?? []) as StreetTerritoryRow[],
    clusters: (clusterR.data ?? []) as BuildingClusterRow[],
    dna: (dnaR.data ?? []) as TerritoryDnaRow[],
    // Coverage gaps (Part 7/Team): opportunity territories with no assigned agent.
    coverageGaps: [...all].filter((t) => t.assigned_agents_count === 0 && t.opportunity_score >= 50).sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 10),
    expectedRevenueTotal: all.reduce((a, t) => a + (t.expected_revenue ?? 0), 0),
    graphNodes: graphR.count ?? 0,
    lowConfidence: all.filter((t) => t.confidence_score < 30).length,
  };
}
