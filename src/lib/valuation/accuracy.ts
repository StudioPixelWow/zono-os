// ============================================================================
// ZONO — Valuation self-learning accuracy engine (PURE, client-safe).
// Turns predicted-vs-actual selling prices into error metrics, aggregates them
// into a real accuracy figure per area, and derives a BOUNDED calibration factor
// that nudges future valuations toward reality. Deterministic, no IO.
// ============================================================================
import type { EstimatedAccuracy } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const median = (xs: number[]): number | null => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export interface AccuracyPoint { predicted: number; actual: number }

export interface AccuracyError {
  difference: number;        // actual - predicted
  percentageError: number;   // signed %, vs predicted
  accuracyPercent: number;   // 0..100
}

/** Per-transaction prediction error. */
export function computeError(predicted: number, actual: number): AccuracyError {
  if (!(predicted > 0)) return { difference: actual - predicted, percentageError: 0, accuracyPercent: 0 };
  const difference = actual - predicted;
  const percentageError = Math.round((difference / predicted) * 1000) / 10;
  const accuracyPercent = Math.round(clamp(100 - Math.abs(percentageError), 0, 100) * 10) / 10;
  return { difference, percentageError, accuracyPercent };
}

export interface AccuracyAggregate {
  count: number;
  avgAccuracy: number | null;     // mean accuracy_percent
  medianAbsError: number | null;  // median |%error|
  meanSignedErrorPercent: number | null; // bias: +ve = engine under-predicts
}

/** Aggregate a set of completed-transaction predictions vs actuals. */
export function aggregateAccuracy(points: AccuracyPoint[]): AccuracyAggregate {
  const valid = points.filter((p) => p.predicted > 0 && p.actual > 0);
  if (valid.length === 0) return { count: 0, avgAccuracy: null, medianAbsError: null, meanSignedErrorPercent: null };
  const errs = valid.map((p) => computeError(p.predicted, p.actual));
  const avgAccuracy = Math.round((errs.reduce((s, e) => s + e.accuracyPercent, 0) / errs.length) * 10) / 10;
  const medianAbsError = median(errs.map((e) => Math.abs(e.percentageError)));
  const meanSignedErrorPercent = Math.round((errs.reduce((s, e) => s + e.percentageError, 0) / errs.length) * 10) / 10;
  return { count: valid.length, avgAccuracy, medianAbsError, meanSignedErrorPercent };
}

export const MIN_CALIBRATION_SAMPLES = 8;
export const CALIBRATION_DAMPEN = 0.5;
export const CALIBRATION_BOUND = 0.06; // never move an estimate more than ±6%

/**
 * Bounded calibration multiplier from historical bias. If the engine has
 * systematically under-predicted (actuals higher), nudge future estimates up — by
 * at most ±CALIBRATION_BOUND, and only with enough samples. Returns 1.0 (no-op)
 * when there is insufficient data, so the engine never over-corrects on noise.
 */
export function calibrationFactor(agg: AccuracyAggregate): number {
  if (agg.count < MIN_CALIBRATION_SAMPLES || agg.meanSignedErrorPercent == null) return 1;
  const raw = (agg.meanSignedErrorPercent / 100) * CALIBRATION_DAMPEN;
  return 1 + clamp(raw, -CALIBRATION_BOUND, CALIBRATION_BOUND);
}

/** Apply the calibration factor to an estimate (rounded to ₪1,000). */
export function applyCalibration(estimate: number, factor: number): number {
  return Math.round((estimate * factor) / 1000) * 1000;
}

/** Build the human-facing estimated-accuracy summary for an area. */
export function buildEstimatedAccuracy(city: string | null, agg: AccuracyAggregate): EstimatedAccuracy {
  if (agg.count === 0 || agg.avgAccuracy == null) {
    return { city, accuracyPercent: null, sampleSize: 0, text: "אין עדיין מספיק עסקאות שהושלמו באזור למדידת דיוק המנוע." };
  }
  const where = city ? `ב${city}` : "באזור זה";
  return {
    city,
    accuracyPercent: agg.avgAccuracy,
    sampleSize: agg.count,
    text: `מנוע הערכת השווי השיג דיוק ממוצע של ${agg.avgAccuracy}% ${where} על בסיס ${agg.count} עסקאות שהושלמו.`,
  };
}

/** Negotiation percentage between asking and final price (signed; -ve = discount). */
export function negotiationPercent(asking: number | null | undefined, final: number | null | undefined): number | null {
  if (!asking || asking <= 0 || final == null) return null;
  return Math.round(((final - asking) / asking) * 1000) / 10;
}
