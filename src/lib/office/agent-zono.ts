// ============================================================================
// ZONO — Agent drawer: the ONE ZONO recommendation picker (pure). Given the
// canonical agent-detail counts, return AT MOST ONE actionable recommendation
// (highest priority first), or null when nothing is actionable. Pure + testable;
// the drawer renders exactly this — never more than one, never fabricated.
// ============================================================================

export interface AgentZonoStats { overdueLeads: number; stuckDeals: number; overdueTasks: number }
export interface AgentZonoRec { title: string; label: string }

export function pickAgentZonoRecommendation(stats: AgentZonoStats): AgentZonoRec | null {
  if (stats.overdueLeads > 0) return { title: `${stats.overdueLeads} לידים דורשים מעקב`, label: "טפל בלידים" };
  if (stats.stuckDeals > 0) return { title: `${stats.stuckDeals} עסקאות תקועות דורשות דחיפה`, label: "פתח עסקאות" };
  if (stats.overdueTasks > 0) return { title: `${stats.overdueTasks} משימות באיחור`, label: "פתח משימות" };
  return null;
}
