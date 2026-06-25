// ============================================================================
// ZONO — Analytics Core: date ranges + period handling (pure, canonical, UTC).
// One source of truth for today / week / month / rolling-30 / rolling-90 /
// rolling-year boundaries, with Hebrew labels. Stable, timezone-safe (UTC).
// ============================================================================

export type Period = "today" | "week" | "month" | "quarter" | "year";
export type RollingWindow = "rolling_7" | "rolling_30" | "rolling_90" | "rolling_365";

export const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30, quarter: 90, year: 365 };
export const ROLLING_DAYS: Record<RollingWindow, number> = { rolling_7: 7, rolling_30: 30, rolling_90: 90, rolling_365: 365 };

export const PERIOD_LABELS: Record<Period, string> = { today: "היום", week: "שבוע", month: "חודש", quarter: "רבעון", year: "שנה" };
export const ROLLING_LABELS: Record<RollingWindow, string> = { rolling_7: "7 ימים", rolling_30: "30 ימים", rolling_90: "90 ימים", rolling_365: "שנה מתגלגלת" };

const DAY_MS = 86_400_000;

/** Start of the UTC day for a date (stable for comparisons). */
export function startOfUtcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
export const startOfUtcDayIso = (d: Date = new Date()): string => startOfUtcDay(d).toISOString();

/** ISO timestamp N days before now (rolling window start). */
export function daysAgoIso(days: number, now: number = Date.now()): string {
  return new Date(now - days * DAY_MS).toISOString();
}

/** [fromIso, toIso] for a rolling window ending now. */
export function rollingRange(window: RollingWindow, now: number = Date.now()): { fromIso: string; toIso: string; days: number } {
  const days = ROLLING_DAYS[window];
  return { fromIso: daysAgoIso(days, now), toIso: new Date(now).toISOString(), days };
}

/** Scale a per-day flow figure to a period horizon (deterministic). */
export function scaleToPeriod(dailyValue: number, period: Period): number {
  return Math.round(dailyValue * PERIOD_DAYS[period]);
}

/** Whole days between two ISO timestamps (>= 0). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso), b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}
