// ============================================================================
// ZONO — Office leaderboard ranking + buckets (pure, deterministic).
// ============================================================================
import { scoreAgent } from "./scoring";
import type { AgentMetrics, LeaderboardBuckets } from "./types";

/** Score, rank (desc, stable by id) and bucket agents. */
export function rankLeaderboard(agents: AgentMetrics[]): LeaderboardBuckets {
  const scored = agents.map((a) => ({ ...a, leaderboardScore: scoreAgent(a) }));
  const ranked = [...scored].sort((x, y) => y.leaderboardScore - x.leaderboardScore || x.agentId.localeCompare(y.agentId));

  const topPerformers = ranked.slice(0, 5);
  const risingAgents = [...scored].filter((a) => a.trendVsLastWeek > 0.1).sort((x, y) => y.trendVsLastWeek - x.trendVsLastWeek).slice(0, 5);
  const mostImproved = [...risingAgents];
  const needingAttention = [...scored]
    .filter((a) => a.overdueTasks >= 5 || a.ignoredHotOpportunities > 0 || (a.calls + a.whatsapps + a.meetings === 0))
    .sort((x, y) => (y.overdueTasks + y.ignoredHotOpportunities * 3) - (x.overdueTasks + x.ignoredHotOpportunities * 3))
    .slice(0, 5);

  return { ranked, topPerformers, risingAgents, needingAttention, mostImproved };
}
