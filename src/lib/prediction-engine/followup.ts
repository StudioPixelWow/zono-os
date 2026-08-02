// ============================================================================
// 🔮 ZONO — prediction follow-up guards (PURE, testable).
// Fixes QA P1-3: "מעקבים שיפוספסו 100%" appeared while "0 לידים פתוחים".
// Root cause: forecast.ts guarded on `!perf` (the performance object is ALWAYS
// present from assemble.ts, even with an empty population), so an empty
// population's followUpRatePct=0 was inverted to 100 - 0 = 100% missed.
// The correct guard is on the POPULATION SIZE, not the object's presence.
// ============================================================================
import type { PerfSignal, SignalEntity } from "./types";

/** People actually tracked for follow-up: buyers + sellers + leads + open lead follow-ups. */
export function followUpPopulation(perf: PerfSignal | null, leads: SignalEntity[]): number {
  return (perf?.peopleTracked ?? 0) + leads.length;
}

/**
 * True when there is no population to base a follow-up forecast on. In that case
 * a 0% follow-up rate means "no data", NOT "0% of follow-ups happened" — so the
 * forecast must be insufficient, never 100% missed.
 */
export function hasNoFollowUpPopulation(perf: PerfSignal | null, leads: SignalEntity[]): boolean {
  return followUpPopulation(perf, leads) === 0;
}

/**
 * The broker-overload contribution from a low follow-up rate. Only counts when a
 * real population exists — otherwise an empty population's 0% rate would spuriously
 * add (100-0)*0.3 = 30 to the load score.
 */
export function overloadFollowUpPenalty(perf: PerfSignal | null): number {
  if (!perf || (perf.peopleTracked ?? 0) === 0) return 0;
  return (100 - perf.followUpRatePct) * 0.3;
}
