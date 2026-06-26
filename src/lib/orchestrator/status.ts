// ============================================================================
// ZONO — system-refresh freshness status (PURE, client-safe — no server imports).
// Turns raw run/alert data into the labels the sticky "רענן מערכת" button shows.
// Kept pure so the client can recompute the time label without a re-query.
// ============================================================================
import type { OrchestratorRunStatus } from "./types";

export type SystemRefreshStatus = OrchestratorRunStatus; // running|success|partial|failed|skipped

/** Raw inputs read from the DB (server-side), before label formatting. */
export interface SystemRefreshStatusRaw {
  /** ISO of the most recent run of ANY status (started_at), or null if none. */
  lastRunAt: string | null;
  /** Status of that most recent run. */
  lastStatus: SystemRefreshStatus | null;
  /** ISO finished_at of the most recent SUCCESS/PARTIAL run, or null. */
  lastSuccessAt: string | null;
  /** Is a run currently active (status = "running")? */
  isRunning: boolean;
  /** Count of org-scoped unread alerts. */
  unreadAlertsCount: number;
}

/** Fully-formatted result returned to the client. */
export interface SystemRefreshStatusResult {
  lastRunAt: string | null;
  lastStatus: SystemRefreshStatus | null;
  lastSuccessAt: string | null;
  isRunning: boolean;
  unreadAlertsCount: number;
  /** Primary freshness sentence (Hebrew). */
  freshnessLabel: string;
  /** Hint to nudge the user to refresh (failed / very stale / never run). */
  shouldEncourageRefresh: boolean;
}

const MIN = 60_000;
const FRESH_MS = 15 * MIN; // < 15 min → "המערכת עדכנית"
const HOUR_MS = 60 * MIN;

/** Empty/unknown status (used as a safe fallback when the query fails). */
export const EMPTY_SYSTEM_REFRESH_STATUS: SystemRefreshStatusResult = {
  lastRunAt: null,
  lastStatus: null,
  lastSuccessAt: null,
  isRunning: false,
  unreadAlertsCount: 0,
  freshnessLabel: "טרם רוענן",
  shouldEncourageRefresh: true,
};

/** Hebrew relative label from a success timestamp. */
function freshnessFromSuccess(lastSuccessAt: string | null, nowMs: number): string {
  if (!lastSuccessAt) return "טרם רוענן";
  const ageMs = nowMs - new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "המערכת עדכנית";
  if (ageMs < FRESH_MS) return "המערכת עדכנית";
  if (ageMs < HOUR_MS) {
    const mins = Math.max(1, Math.round(ageMs / MIN));
    return `עודכן לפני ${mins} דק׳`;
  }
  const hours = Math.max(1, Math.floor(ageMs / HOUR_MS));
  return hours === 1 ? "עודכן לפני שעה" : `עודכן לפני ${hours} שעות`;
}

/**
 * Build the display status from raw data + the current time.
 * Pure & deterministic — same inputs always yield the same labels.
 */
export function buildSystemRefreshStatus(
  raw: SystemRefreshStatusRaw,
  nowMs: number = Date.now(),
): SystemRefreshStatusResult {
  const base = {
    lastRunAt: raw.lastRunAt,
    lastStatus: raw.lastStatus,
    lastSuccessAt: raw.lastSuccessAt,
    isRunning: raw.isRunning,
    unreadAlertsCount: Math.max(0, raw.unreadAlertsCount | 0),
  };

  // Priority order: running → failed → partial → fresh ladder.
  if (raw.isRunning) {
    return { ...base, freshnessLabel: "המערכת מתעדכנת", shouldEncourageRefresh: false };
  }
  if (raw.lastStatus === "failed") {
    return { ...base, freshnessLabel: "נדרש רענון", shouldEncourageRefresh: true };
  }
  if (raw.lastStatus === "partial") {
    return { ...base, freshnessLabel: "עודכן חלקית", shouldEncourageRefresh: true };
  }
  if (!raw.lastRunAt) {
    return { ...base, freshnessLabel: "טרם רוענן", shouldEncourageRefresh: true };
  }

  const freshnessLabel = freshnessFromSuccess(raw.lastSuccessAt, nowMs);
  const ageMs = raw.lastSuccessAt ? nowMs - new Date(raw.lastSuccessAt).getTime() : Infinity;
  const shouldEncourageRefresh = !raw.lastSuccessAt || ageMs > HOUR_MS;
  return { ...base, freshnessLabel, shouldEncourageRefresh };
}

/** Secondary alert label (Hebrew). Returns null when there are no unread alerts. */
export function unreadAlertsLabel(count: number): string | null {
  if (count <= 0) return null;
  return `${count} התראות חדשות`;
}
