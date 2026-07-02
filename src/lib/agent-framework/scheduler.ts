// ============================================================================
// 🤖 Agent Framework — scheduler foundation (pure). 29.1. Part 7.
// Computes ELIGIBILITY only — no hard automation. Modes: manual / daily /
// weekly / on_event / on_stale / on_risk / on_mission_completed.
// ============================================================================
import type { AgentSchedule, ScheduleMode } from "./types";

const DAY = 86400000;

/** Is the agent eligible to run now, given its schedule + last run + event? */
export function shouldRun(schedule: AgentSchedule, now: number, lastRunAt: string | null, event?: string | null): boolean {
  const last = lastRunAt ? new Date(lastRunAt).getTime() : null;
  const since = last == null ? Infinity : now - last;
  switch (schedule.mode) {
    case "manual": return event === "manual";
    case "daily": return since >= DAY;
    case "weekly": return since >= 7 * DAY;
    case "on_event": return !!event && event !== "manual";
    case "on_stale": return event === "stale_data" || event === "manual";
    case "on_risk": return event === "risk_detected" || event === "manual";
    case "on_mission_completed": return event === "mission_completed" || event === "manual";
    default: return event === "manual";
  }
}

const EVENT_FOR: Record<ScheduleMode, string | null> = {
  manual: null, daily: null, weekly: null, on_event: "event",
  on_stale: "stale_data", on_risk: "risk_detected", on_mission_completed: "mission_completed",
};
export function triggerEventFor(mode: ScheduleMode): string | null { return EVENT_FOR[mode]; }

/** Next scheduled run (for display) — daily/weekly cadence only. */
export function nextRunAt(schedule: AgentSchedule, now: number, lastRunAt: string | null): string | null {
  const last = lastRunAt ? new Date(lastRunAt).getTime() : now;
  if (schedule.mode === "daily") return new Date(last + DAY).toISOString();
  if (schedule.mode === "weekly") return new Date(last + 7 * DAY).toISOString();
  return null;
}
