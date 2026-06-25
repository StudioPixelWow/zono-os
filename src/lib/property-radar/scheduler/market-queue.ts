// ============================================================================
// ZONO Property Radar™ — shared market area queue.
// Collapses every sync-enabled org's operating areas into ONE queue item per
// provider+marketAreaKey (so a city shared by N orgs is scanned once), with the
// org count, priority and due-state. Storage-agnostic (reuses OrchestratorDataAccess
// for orgs/areas + MarketRepository for cache freshness).
// ============================================================================
import type { PropertyProviderName } from "../types";
import { createMarketAreaKey } from "../market/area-key";
import type { MarketRepository } from "../market/types";
import { priorityRank } from "./area-priority";
import type { AreaPriority, OrchestratorDataAccess } from "./types";

const HOURS = 3_600_000;

export interface MarketQueueItem {
  provider: PropertyProviderName;
  marketAreaKey: string;
  city: string;
  neighborhood: string | null;
  orgCount: number;
  priority: AreaPriority;
  due: boolean;
  lastScanAt: string | null;
}

export interface BuildMarketQueueInput {
  providers: PropertyProviderName[];
  now: Date;
  maxAreas?: number;
}

export interface MarketQueueDeps {
  dataAccess: OrchestratorDataAccess;
  marketRepo: Pick<MarketRepository, "getMarketAreaCacheState">;
}

function providerEnabledForOrg(
  provider: PropertyProviderName,
  s: { providerYad2Enabled: boolean; providerMadlanEnabled: boolean },
): boolean {
  if (provider === "yad2") return s.providerYad2Enabled;
  if (provider === "madlan") return s.providerMadlanEnabled;
  return true; // mock
}

function smartInterval(priority: AreaPriority): number {
  return priority === "hot" ? 1 : priority === "active" ? 3 : 24;
}

/** New area (no scan) is due now; otherwise cadence by priority (hot 1h/active 3h/passive 24h). */
export function isMarketAreaDue(lastScanAt: string | null, priority: AreaPriority, now: Date): boolean {
  if (!lastScanAt) return true;
  const last = Date.parse(lastScanAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= smartInterval(priority) * HOURS;
}

function priorityFor(orgCount: number): AreaPriority {
  if (orgCount >= 3) return "hot";
  if (orgCount >= 1) return "active";
  return "passive";
}

export async function buildMarketAreaQueue(
  deps: MarketQueueDeps,
  input: BuildMarketQueueInput,
): Promise<MarketQueueItem[]> {
  const orgs = await deps.dataAccess.listSyncEnabledOrgs();

  // provider|key -> { provider, key, city, neighborhood, orgs:Set }
  const agg = new Map<string, { provider: PropertyProviderName; key: string; city: string; neighborhood: string | null; orgs: Set<string> }>();

  for (const { orgId, settings } of orgs) {
    if (!settings.syncEnabled) continue;
    const areas = await deps.dataAccess.getAreasForOrg(orgId);
    for (const provider of input.providers) {
      if (!providerEnabledForOrg(provider, settings)) continue;
      for (const area of areas) {
        if (!area.city?.trim()) continue;
        const key = createMarketAreaKey({ city: area.city, neighborhood: area.neighborhood });
        const id = `${provider}|${key}`;
        const entry = agg.get(id) ?? { provider, key, city: area.city, neighborhood: area.neighborhood ?? null, orgs: new Set<string>() };
        entry.orgs.add(orgId);
        agg.set(id, entry);
      }
    }
  }

  const items: MarketQueueItem[] = [];
  for (const e of agg.values()) {
    const orgCount = e.orgs.size;
    const priority = priorityFor(orgCount);
    const cache = await deps.marketRepo.getMarketAreaCacheState(e.provider, e.key);
    const lastScanAt = cache?.last_scan_at ?? null;
    items.push({
      provider: e.provider, marketAreaKey: e.key, city: e.city, neighborhood: e.neighborhood,
      orgCount, priority, lastScanAt, due: isMarketAreaDue(lastScanAt, priority, input.now),
    });
  }

  // Sort: due first → hot first → most orgs → stalest cache → city.
  items.sort((a, b) => {
    if (a.due !== b.due) return a.due ? -1 : 1;
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr !== 0) return pr;
    if (a.orgCount !== b.orgCount) return b.orgCount - a.orgCount;
    const la = a.lastScanAt ? Date.parse(a.lastScanAt) : 0;
    const lb = b.lastScanAt ? Date.parse(b.lastScanAt) : 0;
    if (la !== lb) return la - lb;
    return a.city.localeCompare(b.city);
  });

  return input.maxAreas != null ? items.slice(0, input.maxAreas) : items;
}
