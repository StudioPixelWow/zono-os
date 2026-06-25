// ============================================================================
// ZONO — BI analytics helpers (pure, deterministic).
// ============================================================================
export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
export const round = (n: number, dp = 0): number => { const f = 10 ** dp; return Math.round(n * f) / f; };

export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return round(((cur - prev) / Math.abs(prev)) * 100, 1);
}

export function direction(deltaPct: number | null): "up" | "down" | "flat" {
  if (deltaPct == null) return "flat";
  return deltaPct > 1 ? "up" : deltaPct < -1 ? "down" : "flat";
}

export function sharePercent(part: number, whole: number): number {
  return whole > 0 ? round((part / whole) * 100, 1) : 0;
}

/** Scale a daily figure to a period horizon (deterministic multipliers). */
export const PERIOD_DAYS: Record<string, number> = { today: 1, week: 7, month: 30, quarter: 90, year: 365 };
