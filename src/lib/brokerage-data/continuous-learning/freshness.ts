// ============================================================================
// ⏳ Continuous Learning — freshness & confidence evolution (pure). 26.4.16.
// ----------------------------------------------------------------------------
// Freshness decays with time-since-evidence. Office confidence evolves GRADUALLY
// (never instantly): up when new evidence appears, slowly down only after months
// of silence, clamped and floored. Deterministic. No DB, no AI.
// ============================================================================
import {
  REFRESH_STALE_DAYS, RESEARCH_STALE_DAYS, DECAY_START_MONTHS,
  CONF_STEP_UP, CONF_STEP_DOWN, CONF_FLOOR, CONF_CEIL,
} from "./types";

const DAY = 86400000;

/** Days since an ISO timestamp, or null when absent. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = (Date.now() - new Date(iso).getTime()) / DAY;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/** 0..100 freshness from the most recent evidence date. Null date → 0 (unknown). */
export function freshnessScore(lastIso: string | null): number {
  const d = daysSince(lastIso);
  if (d == null) return 0;
  if (d <= REFRESH_STALE_DAYS) return 100;
  if (d >= RESEARCH_STALE_DAYS) return 30;
  return Math.round(100 - ((d - REFRESH_STALE_DAYS) / (RESEARCH_STALE_DAYS - REFRESH_STALE_DAYS)) * 70);
}

export function isStale(lastIso: string | null): boolean {
  const d = daysSince(lastIso);
  return d == null || d > REFRESH_STALE_DAYS;
}

/** Composite learning health (0..100) from coverage, freshness, verification and pending load. */
export function learningHealth(a: { coveragePct: number; freshnessScore: number; verificationPct: number; pendingRatio: number }): number {
  const base = 0.35 * a.coveragePct + 0.25 * a.freshnessScore + 0.3 * a.verificationPct;
  const penalty = Math.min(20, a.pendingRatio * 20);   // lots of pending work lowers health
  return Math.max(0, Math.min(100, Math.round(base - penalty + 10)));
}

export interface ConfidenceSignals {
  increases: number;   // count of positive evidence deltas (new listing/broker/phone/domain…)
  decreases: number;   // count of negative signals (closed site, disconnected phone…)
  monthsSinceEvidence: number | null;
}

/**
 * Evolve an office confidence GRADUALLY. Positive evidence nudges up; decay only
 * kicks in after DECAY_START_MONTHS of silence and is slower than growth. Result
 * is clamped [CONF_FLOOR..CONF_CEIL]. Never overwrites with a large jump.
 */
export function evolveConfidence(current: number, sig: ConfidenceSignals): number {
  let next = current;
  if (sig.increases > 0) next += Math.min(CONF_STEP_UP, sig.increases * 2);
  if (sig.decreases > 0) next -= Math.min(CONF_STEP_DOWN, sig.decreases * 1.5);
  if ((sig.monthsSinceEvidence ?? 0) >= DECAY_START_MONTHS && sig.increases === 0) {
    const extraMonths = (sig.monthsSinceEvidence ?? 0) - DECAY_START_MONTHS;
    next -= Math.min(CONF_STEP_DOWN, 1 + extraMonths); // gentle, bounded per refresh
  }
  next = Math.max(CONF_FLOOR, Math.min(CONF_CEIL, Math.round(next)));
  // Never move by more than a single bounded step in one refresh.
  const maxDelta = Math.max(CONF_STEP_UP, CONF_STEP_DOWN);
  if (next > current + maxDelta) next = current + maxDelta;
  if (next < current - maxDelta) next = current - maxDelta;
  return next;
}
