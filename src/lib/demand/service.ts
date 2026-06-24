// ============================================================================
// ZONO Buyer Demand Intelligence — service (server-only orchestration).
// Loads REAL buyers + REAL inventory, runs the pure engine, persists profiles /
// clusters / cluster-buyers / acquisition signals / heatmap cells, and reads the
// command center. Org-scoped via the session + RLS. No fabricated data anywhere.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  computeBuyerDemandProfile, buildClusters, buildAcquisitionSignals, buildHeatmap,
} from "./engine";
import type {
  BuyerRow, PropertyRow, BuyerDemandProfile, HeatmapCell,
} from "./types";

async function ctx() {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) throw new Error("אין הרשאה.");
  const db = await createClient();
  return { db, orgId: profile.org_id };
}

export interface RecomputeSummary {
  buyers: number; profiles: number; clusters: number; signals: number; heatmapCells: number;
}

/** Recompute the entire demand graph for the org from real data and persist it. */
export async function recomputeDemand(): Promise<RecomputeSummary> {
  const { db, orgId } = await ctx();

  const { data: buyerData, error: be } = await db
    .from("buyers" as never)
    .select("id,full_name,temperature,budget_min,budget_max,rooms_min,rooms_max,preferred_types,preferred_areas,preferred_regions,has_preapproval,readiness,last_contacted_at,must_have_parking,must_have_elevator,must_have_safe_room")
    .eq("org_id", orgId).limit(5000);
  if (be) throw new Error(be.message);
  const buyers = (buyerData ?? []) as unknown as BuyerRow[];

  const { data: propData } = await db
    .from("properties" as never)
    .select("id,city,neighborhood,property_type,rooms,price,status,is_active,is_internal_inventory")
    .eq("org_id", orgId).limit(8000);
  const properties = (propData ?? []) as unknown as PropertyRow[];

  // Engine (pure).
  const profiles = buyers.map(computeBuyerDemandProfile);
  const profileMap = new Map<string, BuyerDemandProfile>(profiles.map((p) => [p.buyerId, p]));
  const clusters = buildClusters(buyers, profileMap, properties);
  const signals = buildAcquisitionSignals(clusters);
  const heatmap = buildHeatmap(clusters);

  // Persist — clear org rows then re-insert (clusters cascade to cluster_buyers + signals).
  await db.from("demand_clusters" as never).delete().eq("org_id", orgId);
  await db.from("demand_heatmap_cells" as never).delete().eq("org_id", orgId);
  await db.from("buyer_demand_profiles" as never).delete().eq("org_id", orgId);

  if (profiles.length) {
    await db.from("buyer_demand_profiles" as never).insert(profiles.map((p) => ({
      org_id: orgId, buyer_id: p.buyerId, preferred_cities: p.preferredCities,
      preferred_neighborhoods: p.preferredNeighborhoods, property_types: p.propertyTypes,
      rooms_min: p.roomsMin, rooms_max: p.roomsMax, budget_min: p.budgetMin, budget_max: p.budgetMax,
      urgency_score: p.urgencyScore, financing_readiness_score: p.financingReadinessScore,
      search_activity_score: p.searchActivityScore, engagement_score: p.engagementScore,
      demand_score: p.demandScore, demand_band: p.demandBand, reasons: p.reasons,
    })) as never);
  }

  // Insert clusters, then map clusterKey → id for child rows.
  const clusterIdByKey = new Map<string, string>();
  if (clusters.length) {
    const { data: inserted } = await db.from("demand_clusters" as never).insert(clusters.map((c) => ({
      org_id: orgId, cluster_key: c.clusterKey, label: c.label, area: c.area, scope: c.scope,
      property_type: c.propertyType, rooms_bucket: c.roomsBucket, budget_ceiling: c.budgetCeiling,
      active_buyers: c.activeBuyers, hot_buyers: c.hotBuyers, avg_budget: c.avgBudget,
      urgency_score: c.urgencyScore, demand_strength: c.demandStrength, demand_band: c.demandBand,
      inventory_count: c.inventoryCount, gap_score: c.gapScore, gap_band: c.gapBand, reasons: c.reasons,
    })) as never).select("id,cluster_key");
    for (const row of (inserted ?? []) as unknown as { id: string; cluster_key: string }[]) {
      clusterIdByKey.set(row.cluster_key, row.id);
    }

    // Cluster-buyer membership.
    const links = clusters.flatMap((c) => {
      const cid = clusterIdByKey.get(c.clusterKey);
      if (!cid) return [];
      return c.buyers.map((b) => ({ org_id: orgId, cluster_id: cid, buyer_id: b.buyerId, fit_score: b.fitScore, is_hot: b.isHot }));
    });
    for (let i = 0; i < links.length; i += 500) {
      await db.from("demand_cluster_buyers" as never).insert(links.slice(i, i + 500) as never);
    }
  }

  // Acquisition signals.
  if (signals.length) {
    await db.from("acquisition_signals" as never).insert(signals.map((s) => ({
      org_id: orgId, cluster_id: clusterIdByKey.get(s.clusterKey) ?? null, signal_type: s.signalType,
      title: s.title, area: s.area, scope: s.scope, property_type: s.propertyType, rooms_bucket: s.roomsBucket,
      budget_ceiling: s.budgetCeiling, buyers_count: s.buyersCount, hot_buyers_count: s.hotBuyersCount,
      inventory_count: s.inventoryCount, gap_score: s.gapScore, urgency_score: s.urgencyScore,
      strength: s.strength, competition: s.competition, status: "open", reasons: s.reasons,
    })) as never);
  }

  if (heatmap.length) {
    await db.from("demand_heatmap_cells" as never).insert(heatmap.map((h) => ({
      org_id: orgId, scope: h.scope, key: h.key, label: h.label, buyers_count: h.buyersCount,
      hot_buyers: h.hotBuyers, avg_budget: h.avgBudget, demand_strength: h.demandStrength,
      inventory_count: h.inventoryCount, gap_score: h.gapScore,
    })) as never);
  }

  return { buyers: buyers.length, profiles: profiles.length, clusters: clusters.length, signals: signals.length, heatmapCells: heatmap.length };
}

// ── Reads ──────────────────────────────────────────────────────────────────--
export interface DemandCommandCenter {
  totals: { buyers: number; activeProfiles: number; clusters: number; openSignals: number; missingTypes: number };
  clusters: StoredCluster[];
  signals: StoredSignal[];
  heatmap: { locality: HeatmapCell[]; neighborhood: HeatmapCell[]; propertyType: HeatmapCell[] };
  missingInventory: StoredCluster[]; // top gaps = "what's missing from my inventory"
  empty: boolean;
}

export interface StoredCluster {
  id: string; label: string; area: string; propertyType: string; roomsBucket: number | null;
  budgetCeiling: number | null; activeBuyers: number; hotBuyers: number; avgBudget: number | null;
  urgencyScore: number; demandStrength: number; demandBand: string; inventoryCount: number;
  gapScore: number; gapBand: string; reasons: { label: string; detail: string }[];
}
export interface StoredSignal {
  id: string; title: string; area: string; propertyType: string; roomsBucket: number | null;
  budgetCeiling: number | null; buyersCount: number; hotBuyersCount: number; inventoryCount: number;
  gapScore: number; urgencyScore: number; strength: number; competition: number; status: string;
  reasons: { label: string; detail: string }[];
}

const num = (x: unknown) => (x == null ? null : Number(x));

function mapCluster(r: Record<string, unknown>): StoredCluster {
  return {
    id: r.id as string, label: r.label as string, area: (r.area as string) ?? "", propertyType: (r.property_type as string) ?? "",
    roomsBucket: num(r.rooms_bucket), budgetCeiling: num(r.budget_ceiling), activeBuyers: Number(r.active_buyers ?? 0),
    hotBuyers: Number(r.hot_buyers ?? 0), avgBudget: num(r.avg_budget), urgencyScore: num(r.urgency_score) ?? 0,
    demandStrength: num(r.demand_strength) ?? 0, demandBand: (r.demand_band as string) ?? "low",
    inventoryCount: Number(r.inventory_count ?? 0), gapScore: num(r.gap_score) ?? 0, gapBand: (r.gap_band as string) ?? "low",
    reasons: (r.reasons as { label: string; detail: string }[]) ?? [],
  };
}
function mapSignal(r: Record<string, unknown>): StoredSignal {
  return {
    id: r.id as string, title: r.title as string, area: (r.area as string) ?? "", propertyType: (r.property_type as string) ?? "",
    roomsBucket: num(r.rooms_bucket), budgetCeiling: num(r.budget_ceiling), buyersCount: Number(r.buyers_count ?? 0),
    hotBuyersCount: Number(r.hot_buyers_count ?? 0), inventoryCount: Number(r.inventory_count ?? 0),
    gapScore: num(r.gap_score) ?? 0, urgencyScore: num(r.urgency_score) ?? 0, strength: num(r.strength) ?? 0,
    competition: num(r.competition) ?? 0, status: (r.status as string) ?? "open",
    reasons: (r.reasons as { label: string; detail: string }[]) ?? [],
  };
}
function mapCell(r: Record<string, unknown>): HeatmapCell {
  return {
    scope: r.scope as HeatmapCell["scope"], key: r.key as string, label: r.label as string,
    buyersCount: Number(r.buyers_count ?? 0), hotBuyers: Number(r.hot_buyers ?? 0), avgBudget: num(r.avg_budget),
    demandStrength: num(r.demand_strength) ?? 0, inventoryCount: Number(r.inventory_count ?? 0), gapScore: num(r.gap_score) ?? 0,
  };
}

export async function getDemandCommandCenter(): Promise<DemandCommandCenter> {
  const { db, orgId } = await ctx();
  const [{ count: buyerCount }, { count: profileCount }, { data: clusterRows }, { data: signalRows }, { data: cellRows }] = await Promise.all([
    db.from("buyers" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId),
    db.from("buyer_demand_profiles" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId),
    db.from("demand_clusters" as never).select("*").eq("org_id", orgId).order("gap_score", { ascending: false }).limit(120),
    db.from("acquisition_signals" as never).select("*").eq("org_id", orgId).eq("status", "open").order("strength", { ascending: false }).limit(60),
    db.from("demand_heatmap_cells" as never).select("*").eq("org_id", orgId),
  ]);

  const clusters = ((clusterRows ?? []) as Record<string, unknown>[]).map(mapCluster);
  const signals = ((signalRows ?? []) as Record<string, unknown>[]).map(mapSignal);
  const cells = ((cellRows ?? []) as Record<string, unknown>[]).map(mapCell);
  const missingInventory = [...clusters].filter((c) => c.gapScore >= 40).sort((a, b) => b.gapScore - a.gapScore).slice(0, 10);

  return {
    totals: {
      buyers: buyerCount ?? 0, activeProfiles: profileCount ?? 0, clusters: clusters.length,
      openSignals: signals.length, missingTypes: missingInventory.length,
    },
    clusters, signals,
    heatmap: {
      locality: cells.filter((c) => c.scope === "locality"),
      neighborhood: cells.filter((c) => c.scope === "neighborhood"),
      propertyType: cells.filter((c) => c.scope === "property_type"),
    },
    missingInventory,
    empty: (buyerCount ?? 0) === 0,
  };
}

/** Top missing inventory ("מה חסר לי במלאי?") — top N demand gaps. */
export async function getTopMissingInventory(limit = 10): Promise<StoredCluster[]> {
  const { db, orgId } = await ctx();
  const { data } = await db.from("demand_clusters" as never)
    .select("*").eq("org_id", orgId).gte("gap_score", 40).order("gap_score", { ascending: false }).limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(mapCluster);
}

export async function dismissAcquisitionSignal(id: string): Promise<void> {
  const { db, orgId } = await ctx();
  await db.from("acquisition_signals" as never).update({ status: "dismissed" } as never).eq("id", id).eq("org_id", orgId);
}
