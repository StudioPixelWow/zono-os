// ============================================================================
// 🏆 ZONO — Local Market Domination — service (server-only). 34.0.
// Assembles the per-area signals by REUSING existing engines — the Market
// Intelligence heatmap (getCurrentMarketHeatmap: demand/supply/competition/
// momentum/opportunity/internal vs external listings/price-drops/buyers) and the
// Facebook Groups Intelligence (folder coverage) — then runs the pure domination
// engine. Adds NO scoring engine and NO tables; read-only; nothing executes.
// ============================================================================
import "server-only";
import { getCurrentMarketHeatmap, type MarketHeatmapCell } from "@/lib/market/service";
import { getGroupsIntelligence } from "@/lib/facebook-groups-intelligence";
import { buildDomination, type DominationDashboard, type AreaSignal } from "./domination";

const norm = (v: string | null) => (v ?? "").trim().toLowerCase();

export async function getMarketDomination(): Promise<DominationDashboard> {
  const [cells, groupsIntel] = await Promise.all([
    getCurrentMarketHeatmap().catch(() => [] as MarketHeatmapCell[]),
    getGroupsIntelligence().catch(() => null),
  ]);

  // Group coverage per area name (folder ≈ city/neighborhood label).
  const groupByArea = new Map<string, { groups: number; leads: number }>();
  for (const f of groupsIntel?.folders ?? []) {
    const e = groupByArea.get(norm(f.folder)) ?? { groups: 0, leads: 0 };
    e.groups += f.totalGroups; e.leads += f.totalLeads;
    groupByArea.set(norm(f.folder), e);
    for (const c of f.cities) { const ce = groupByArea.get(norm(c)) ?? { groups: 0, leads: 0 }; ce.groups += f.totalGroups; ce.leads += f.totalLeads; groupByArea.set(norm(c), ce); }
  }

  const signals: AreaSignal[] = cells.map((c) => {
    const g = groupByArea.get(norm(c.localityName)) ?? { groups: 0, leads: 0 };
    return {
      key: c.localityId ?? `loc-${c.localityName}`, name: c.localityName, city: null, level: "neighborhood",
      internalListings: c.internalProperties, externalListings: c.externalListings,
      buyerDemand: c.demand, supply: c.supply, competition: c.competitionScore ?? 0, momentum: c.momentumScore ?? 50,
      opportunity: c.opportunity, priceDrops: c.priceDrops, activeBuyers: c.activeBuyers, avgPrice: c.avgPrice,
      luxuryShare: 0, groupCoverage: g.groups, groupLeads: g.leads, campaignCoverage: 0, transactions: c.transactionScore ?? 0,
    };
  });

  return buildDomination(signals);
}
