// ============================================================================
// 🧠 ZONO — BROKER INTELLIGENCE · Learning loop (PURE).
// Phase 4 of the Broker Operating System. The queue learns from what the broker
// ACTUALLY does — accept / complete / done-elsewhere (positive), dismiss / reject
// (negative), snooze (mild negative) — recorded in the lifecycle event log. It
// does NOT guess with an LLM: it aggregates real historical outcomes per
// dimension (intelligence area + action class) and applies a small, BOUNDED
// re-rank nudge. Below a minimum sample size it stays neutral (honest — it won't
// "learn" from one data point). Deterministic + offline-testable.
// ============================================================================
import { clamp100 } from "./types";
import { actionClass, type PrioritizedRecommendation } from "./priority";
import type { LifecycleAction } from "./lifecycle";

/** One historical outcome row (subset of the persisted event). */
export interface OutcomeSample {
  area: string | null;
  actionClass: string | null;
  action: LifecycleAction;
}

/** Aggregated behavior for one dimension value (e.g. area="seller"). */
export interface OutcomeAgg {
  positive: number;   // accepted + completed + done_elsewhere
  negative: number;   // dismissed + rejected
  snoozed: number;    // mild negative
  total: number;
  /** Signed, bounded priority nudge learned from this dimension (−MAX..+MAX). */
  adjustment: number;
}

export interface LearningModel {
  byArea: Record<string, OutcomeAgg>;
  byActionClass: Record<string, OutcomeAgg>;
  totalEvents: number;
}

/** Don't "learn" from noise — a dimension needs this many events to nudge. */
export const MIN_SAMPLES = 3;
/** Behavior can only nudge priority this far — evidence still leads. */
export const MAX_ADJUSTMENT = 10;
/** Snooze is a soft "not now", weighted lighter than an outright dismiss. */
const SNOOZE_WEIGHT = 0.3;

const POSITIVE: LifecycleAction[] = ["accepted", "completed", "done_elsewhere"];
const NEGATIVE: LifecycleAction[] = ["dismissed", "rejected"];

function emptyAgg(): OutcomeAgg {
  return { positive: 0, negative: 0, snoozed: 0, total: 0, adjustment: 0 };
}

function finalizeAgg(a: OutcomeAgg): OutcomeAgg {
  if (a.total < MIN_SAMPLES) return { ...a, adjustment: 0 }; // honest: too little history
  const net = (a.positive - a.negative - SNOOZE_WEIGHT * a.snoozed) / a.total; // −1..1
  return { ...a, adjustment: Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, Math.round(net * MAX_ADJUSTMENT))) };
}

function bump(map: Record<string, OutcomeAgg>, key: string, action: LifecycleAction): void {
  const a = (map[key] ??= emptyAgg());
  a.total++;
  if (POSITIVE.includes(action)) a.positive++;
  else if (NEGATIVE.includes(action)) a.negative++;
  else if (action === "snoozed") a.snoozed++;
}

/**
 * Build the learning model from the real outcome log. Pure + deterministic.
 * Only the LATEST-known dimensions matter; we treat every event as a data point
 * (a recommendation dismissed twice is two "dismiss" signals for that class).
 */
export function summarizeOutcomes(samples: OutcomeSample[]): LearningModel {
  const byArea: Record<string, OutcomeAgg> = {};
  const byActionClass: Record<string, OutcomeAgg> = {};
  for (const s of samples) {
    if (s.area) bump(byArea, s.area, s.action);
    if (s.actionClass) bump(byActionClass, s.actionClass, s.action);
  }
  for (const k of Object.keys(byArea)) byArea[k] = finalizeAgg(byArea[k]);
  for (const k of Object.keys(byActionClass)) byActionClass[k] = finalizeAgg(byActionClass[k]);
  return { byArea, byActionClass, totalEvents: samples.length };
}

/** The learned nudge for a single recommendation (area + action-class blended). */
export function learnedAdjustment(model: LearningModel, rec: PrioritizedRecommendation): number {
  const areaAdj = model.byArea[rec.area]?.adjustment ?? 0;
  const classAdj = model.byActionClass[actionClass(rec)]?.adjustment ?? 0;
  // Blend both signals, capped so behavior never dominates real evidence.
  return Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, areaAdj + classAdj));
}

/**
 * Re-rank the queue using the learned model: nudge each item's priority by its
 * blended adjustment, record it for transparency, and re-sort. Original priority
 * is the stable tiebreak so equal adjustments don't scramble evidence order.
 */
export function applyLearning(
  queue: PrioritizedRecommendation[],
  model: LearningModel,
): PrioritizedRecommendation[] {
  const adjusted = queue.map((rec) => {
    const adj = learnedAdjustment(model, rec);
    return { ...rec, learningAdjustment: adj, priority: clamp100(rec.priority + adj) };
  });
  return adjusted.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.id.localeCompare(b.id);
  });
}
