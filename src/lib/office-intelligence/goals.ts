// ============================================================================
// ZONO — Office goals progress + pace (pure, deterministic).
// ============================================================================
import { clamp } from "./analytics";
import type { GoalPeriod, GoalProgress, GoalType } from "./types";

export interface GoalRow {
  id: string; goalType: GoalType; period: GoalPeriod; target: number; current: number;
  startsAt: string | null; endsAt: string | null; ownerName: string | null;
}

/** Progress %, time-pace and on-track / behind / ahead verdict. */
export function computeGoalProgress(g: GoalRow, now: number = Date.now()): GoalProgress {
  const percent = g.target > 0 ? Math.round(clamp((g.current / g.target) * 100, 0, 999)) : 0;
  let pacePercent: number | null = null;
  let status: GoalProgress["status"] = g.target > 0 ? "on_track" : "no_target";

  if (g.target > 0 && g.startsAt && g.endsAt) {
    const start = Date.parse(g.startsAt), end = Date.parse(g.endsAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const elapsed = clamp((now - start) / (end - start), 0, 1);
      pacePercent = Math.round(elapsed * 100);
      const expected = elapsed * g.target;
      if (g.current >= expected * 1.1) status = "ahead";
      else if (g.current < expected * 0.85) status = "behind";
      else status = "on_track";
    }
  }
  return { id: g.id, goalType: g.goalType, period: g.period, target: g.target, current: g.current, percent, pacePercent, status, ownerName: g.ownerName };
}
