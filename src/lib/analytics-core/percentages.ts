// ============================================================================
// ZONO — Analytics Core: percentages + numeric helpers (pure, canonical).
// One source of truth for clamp / round / share / percent-change / direction.
// Convention: pctChange returns null when the baseline is 0 AND current != 0
// (an undefined ratio); returns 0 when both are 0.
// ============================================================================
import type { TrendDirection } from "./types";

export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export const round = (n: number, dp = 0): number => { const f = 10 ** dp; return Math.round(n * f) / f; };

export const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Share of a whole, 0..100 with one decimal. */
export const sharePercent = (part: number, whole: number): number => (whole > 0 ? round((part / whole) * 100, 1) : 0);

/** Percentage change vs a baseline (one decimal). null = undefined ratio. */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return current === 0 ? 0 : null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

/** Trend direction from a delta %, with a ±1% dead-band. */
export function direction(deltaPercent: number | null): TrendDirection {
  if (deltaPercent == null) return "flat";
  return deltaPercent > 1 ? "up" : deltaPercent < -1 ? "down" : "flat";
}
