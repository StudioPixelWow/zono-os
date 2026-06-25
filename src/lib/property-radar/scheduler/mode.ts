// ============================================================================
// ZONO Property Radar™ — scheduler mode (lightweight, no server-only imports).
// Kept separate from jobs.ts so it can be read from client/test contexts.
// ============================================================================
export type SchedulerMode = "market" | "org";

/** Scheduler mode — shared market engine (default) or legacy org-level sync. */
export function getSchedulerMode(): SchedulerMode {
  return (process.env.PROPERTY_RADAR_SCHEDULER_MODE ?? "").trim().toLowerCase() === "org" ? "org" : "market";
}
