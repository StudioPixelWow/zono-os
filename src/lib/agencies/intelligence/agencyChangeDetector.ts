// ============================================================================
// ZONO — Agency change detector (Phase 26.6, PURE, client-safe).
// Classifies a numeric change between a previous and current value into a
// direction + normalized magnitude (0..1). Used by the signal detector to gate
// signals on real, measured movement.
// ============================================================================

export type ChangeDirection = "up" | "down" | "none" | "new";

export interface ChangeResult {
  direction: ChangeDirection;
  delta: number;       // curr - prev (0 when new)
  magnitude: number;   // 0..1 normalized significance
  prev: number | null;
  curr: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface ChangeOpts {
  /** Absolute delta that counts as a meaningful change. */
  deltaThreshold?: number;
  /** Relative change (fraction) that counts as meaningful (for counts). */
  pctThreshold?: number;
  /** Scale used to normalize delta → magnitude (delta of this size ⇒ ~1.0). */
  magnitudeScale?: number;
  /** Absolute value above which a first-seen (prev=null) metric is significant. */
  newSignificantAt?: number;
}

/**
 * Classify the change for a 0..100 score metric (dominance, momentum, overall…).
 */
export function classifyScoreChange(prev: number | null, curr: number, opts: ChangeOpts = {}): ChangeResult {
  const deltaThreshold = opts.deltaThreshold ?? 12;
  const scale = opts.magnitudeScale ?? 30;
  if (prev == null) {
    const sig = opts.newSignificantAt != null && curr >= opts.newSignificantAt;
    return { direction: sig ? "new" : "none", delta: 0, magnitude: sig ? clamp(curr / 100, 0, 1) : 0, prev, curr };
  }
  const delta = curr - prev;
  if (Math.abs(delta) < deltaThreshold) return { direction: "none", delta, magnitude: 0, prev, curr };
  return { direction: delta > 0 ? "up" : "down", delta, magnitude: clamp(Math.abs(delta) / scale, 0, 1), prev, curr };
}

/**
 * Classify the change for a COUNT metric (active listings, agents, …) using both
 * an absolute and a relative threshold so small bases aren't over-triggered.
 */
export function classifyCountChange(prev: number | null, curr: number, opts: ChangeOpts = {}): ChangeResult {
  const deltaThreshold = opts.deltaThreshold ?? 3;
  const pctThreshold = opts.pctThreshold ?? 0.3;
  const scale = opts.magnitudeScale ?? 10;
  if (prev == null) {
    const sig = opts.newSignificantAt != null && curr >= opts.newSignificantAt;
    return { direction: sig ? "new" : "none", delta: curr, magnitude: sig ? clamp(curr / scale, 0, 1) : 0, prev, curr };
  }
  const delta = curr - prev;
  const pct = prev > 0 ? Math.abs(delta) / prev : (curr > 0 ? 1 : 0);
  const meaningful = Math.abs(delta) >= deltaThreshold && pct >= pctThreshold;
  if (!meaningful) return { direction: "none", delta, magnitude: 0, prev, curr };
  return { direction: delta > 0 ? "up" : "down", delta, magnitude: clamp(Math.abs(delta) / scale, 0, 1), prev, curr };
}

/** True when a value crossed a threshold upward (prev below, curr at/above). */
export function crossedUp(prev: number | null, curr: number | null, threshold: number): boolean {
  return curr != null && curr >= threshold && (prev == null || prev < threshold);
}
/** True when a value crossed a threshold downward. */
export function crossedDown(prev: number | null, curr: number | null, threshold: number): boolean {
  return curr != null && curr < threshold && prev != null && prev >= threshold;
}
