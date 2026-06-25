// ============================================================================
// ZONO — Office leaderboard scoring (pure, deterministic). Quality-weighted,
// NOT volume-only. Same inputs ⇒ same score.
// ============================================================================
import { clamp } from "./analytics";
import type { AgentMetrics } from "./types";

/** Faster average response → higher score (0..1). <1h ≈ 1.0, ≥24h ≈ 0. */
export function responseRateScore(avgResponseHours: number | null): number {
  if (avgResponseHours == null) return 0.5;
  if (avgResponseHours <= 1) return 1;
  if (avgResponseHours >= 24) return 0;
  return clamp(1 - (avgResponseHours - 1) / 23, 0, 1);
}

export interface LeaderboardInputs {
  exclusivesSigned: number;
  meetings: number;
  sellerContacts: number;       // listingsContacted (incl. private)
  perfectMatchesHandled: number;
  tasksCompleted: number;
  responseRateScore: number;    // 0..1
  conversionRate: number;       // 0..1
  overdueTasks: number;
  ignoredHotOpportunities: number;
}

/**
 * leaderboardScore = exclusiveSigned*25 + meetings*8 + sellerContacts*6
 *   + perfectMatchesHandled*5 + tasksCompleted*3 + responseRateScore*10
 *   + conversionRateScore*15 − overdueTasksPenalty − ignoredHotOpportunitiesPenalty
 */
export function computeLeaderboardScore(i: LeaderboardInputs): number {
  const base =
    i.exclusivesSigned * 25 +
    i.meetings * 8 +
    i.sellerContacts * 6 +
    i.perfectMatchesHandled * 5 +
    i.tasksCompleted * 3 +
    i.responseRateScore * 10 +
    i.conversionRate * 15;
  const overduePenalty = i.overdueTasks * 4;
  const ignoredPenalty = i.ignoredHotOpportunities * 8;
  return Math.round(base - overduePenalty - ignoredPenalty);
}

/** Compute the score for an agent metrics row (uses its response/conversion fields). */
export function scoreAgent(a: AgentMetrics): number {
  return computeLeaderboardScore({
    exclusivesSigned: a.exclusivesSigned, meetings: a.meetings, sellerContacts: a.listingsContacted,
    perfectMatchesHandled: a.perfectMatchesHandled, tasksCompleted: a.tasksCompleted,
    responseRateScore: responseRateScore(a.avgResponseHours), conversionRate: a.conversionRate,
    overdueTasks: a.overdueTasks, ignoredHotOpportunities: a.ignoredHotOpportunities,
  });
}
