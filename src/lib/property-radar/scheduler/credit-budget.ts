// ============================================================================
// ZONO Property Radar™ — credit budget (pure).
// Decides whether an area may sync given today's credit usage. Above the soft
// daily limit only HOT areas run, and never past a hard ceiling (1.2×). dryRun
// never consumes (handled by the orchestrator, not here).
// ============================================================================
import type { AreaPriority, CreditBudgetDecision, RadarSchedulerSettings } from "./types";

export const HARD_LIMIT_MULTIPLIER = 1.2;

/** UTC start-of-day ISO for "today's usage" queries. */
export function startOfUtcDayIso(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString();
}

export function canRunSyncForOrg(
  settings: RadarSchedulerSettings,
  todayUsage: number,
  priority: AreaPriority,
): CreditBudgetDecision {
  const soft = Math.max(0, settings.maxDailyCredits);
  const hard = Math.floor(soft * HARD_LIMIT_MULTIPLIER);
  const remainingCredits = Math.max(0, soft - todayUsage);

  if (todayUsage >= hard) {
    return { allowed: false, reason: "הגעת לתקרת הקרדיטים הקשיחה היומית", remainingCredits: 0 };
  }
  if (todayUsage >= soft) {
    // Over the soft limit: only hot areas, and only while under the hard ceiling.
    if (priority === "hot") {
      return { allowed: true, reason: "מעל התקציב היומי — מורצים רק אזורים חמים", remainingCredits };
    }
    return { allowed: false, reason: "התקציב היומי נוצל — נדחה לאזורים חמים בלבד", remainingCredits };
  }
  return { allowed: true, remainingCredits };
}
