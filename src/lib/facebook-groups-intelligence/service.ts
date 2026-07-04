// ============================================================================
// 📊 ZONO — Facebook Groups Intelligence — service (server-only). 33.4.
// REUSES the existing group registry (groups-service.getGroupRegistry) — which
// already carries the REAL performance/lead scores + post/lead counts — and runs
// the pure intelligence layer over it. Adds NO scoring engine and NO tables.
// Property→group matching stays in groups-service (recommendGroups); we only
// re-export a thin passthrough for the dashboard.
// ============================================================================
import "server-only";
import { getGroupRegistry, recommendGroups, type GroupRow } from "@/lib/distribution/groups-service";
import { buildGroupsIntelligence, type GroupsIntelligence, type GroupStat } from "./intelligence";

function toStat(g: GroupRow): GroupStat {
  return {
    id: g.id, name: g.name, folder: g.category ?? "כללי", city: g.city, propertyTypes: g.propertyTypes,
    members: g.membersCount, status: g.status, performance: g.performanceScore, leadScore: g.leadScore,
    spamRisk: g.spamRiskScore, totalPosts: g.totalPosts, totalLeads: g.totalLeads,
    lastPostAt: g.lastPostAt, lastLeadAt: g.lastLeadAt, url: g.groupUrl,
  };
}

export async function getGroupsIntelligence(): Promise<GroupsIntelligence> {
  const groups = await getGroupRegistry().catch(() => [] as GroupRow[]);
  return buildGroupsIntelligence(groups.map(toStat));
}

/** Reuse the existing property→group matching (no duplication). */
export { recommendGroups as recommendGroupsForProperty };
