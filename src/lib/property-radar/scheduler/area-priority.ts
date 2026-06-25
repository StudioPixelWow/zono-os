// ============================================================================
// ZONO Property Radar™ — area priority (pure).
// Classifies an expertise area as hot / active / passive from available signals.
// Until buyer/property demand sources are wired (Phase 8), expertise areas are
// "active" by default, "hot" when there are recent alerts, and "passive" only
// when explicitly marked.
// ============================================================================
import type { AreaPriority, AreaPriorityContext, OrchestratorArea } from "./types";

export function calculateAreaPriority(
  area: OrchestratorArea,
  context: AreaPriorityContext = {},
): AreaPriority {
  // Manual override always wins.
  if (area.priority) return area.priority;

  const recentAlerts = context.recentAlertCount ?? 0;
  const activeBuyers = context.activeBuyers ?? 0;
  const activeProperties = context.activeProperties ?? 0;

  // Hot: real demand / activity in the area.
  if (recentAlerts > 0 || activeBuyers > 0 || activeProperties > 0) return "hot";

  // Expertise area with no activity yet → active (worth scanning regularly).
  return "active";
}

export function priorityRank(p: AreaPriority): number {
  return p === "hot" ? 3 : p === "active" ? 2 : 1;
}
