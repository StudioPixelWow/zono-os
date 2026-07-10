// ============================================================================
// 🔁 ZONO — BROKER INTELLIGENCE · Recommendation lifecycle (PURE).
// Phase 3 of the Broker Operating System. A recommendation is never silently
// dropped: the broker can Accept / Dismiss / Snooze / mark Completed / mark
// "Done elsewhere" / Reject it, and that decision persists and travels to every
// surface (queue, Today, Attention, Executive). This module is the PURE core:
// it reduces the persisted event log to a current state per recommendation and
// applies that state to the live shared queue. Deterministic + offline-testable.
// The DB/repository just feeds it rows.
// ============================================================================
import type { PrioritizedRecommendation } from "./priority";
import { recKey } from "./priority";

/** The lifecycle decisions a broker can take on a recommendation. */
export type LifecycleAction =
  | "accepted"       // taking it on now — stays visible, marked in-progress
  | "dismissed"      // not relevant — removed from the actionable queue
  | "snoozed"        // not now — hidden until snoozeUntil, then it returns
  | "completed"      // done via ZONO — removed, counts as a positive outcome
  | "done_elsewhere" // already handled outside ZONO — removed, still a positive
  | "rejected";      // wrong recommendation — removed, negative learning signal

/** One persisted lifecycle event (append-only; latest per recKey wins). */
export interface LifecycleEvent {
  recKey: string;
  action: LifecycleAction;
  /** ISO timestamp — the tiebreak for "latest state". */
  at: string;
  /** For snooze: ISO time the item should resurface. */
  snoozeUntil?: string | null;
}

/** The resolved current state of a recommendation (latest event). */
export interface LifecycleState {
  recKey: string;
  action: LifecycleAction;
  at: string;
  snoozeUntil?: string | null;
}

/** A queue item annotated with its lifecycle (for surfaces that show status). */
export interface LifecycleAwareRecommendation extends PrioritizedRecommendation {
  /** The active lifecycle state, or null when untouched. */
  lifecycle: LifecycleState | null;
}

const TERMINAL: LifecycleAction[] = ["dismissed", "completed", "done_elsewhere", "rejected"];

/**
 * Reduce an append-only event log to ONE current state per recommendation:
 * the most recent event wins (by `at`, then stable order). Pure.
 */
export function reduceLatestStates(events: LifecycleEvent[]): Map<string, LifecycleState> {
  const latest = new Map<string, LifecycleState>();
  for (const e of events) {
    const prev = latest.get(e.recKey);
    if (!prev || e.at >= prev.at) {
      latest.set(e.recKey, { recKey: e.recKey, action: e.action, at: e.at, snoozeUntil: e.snoozeUntil ?? null });
    }
  }
  return latest;
}

/** Is a state currently hiding its recommendation from the actionable queue? */
export function isHidden(state: LifecycleState, now: Date): boolean {
  if (TERMINAL.includes(state.action)) return true;
  if (state.action === "snoozed") {
    // Snoozed hides the item ONLY until its resurface time — then it returns.
    if (!state.snoozeUntil) return true;
    return new Date(state.snoozeUntil).getTime() > now.getTime();
  }
  return false; // "accepted" stays visible (in-progress), never silently gone
}

/**
 * Apply persisted lifecycle to the live queue. Hidden items (dismissed / done /
 * rejected / actively-snoozed) are removed; everything else is annotated with
 * its state (so surfaces can badge "accepted"/"snoozed-expired"). Order preserved.
 */
export function applyLifecycle(
  queue: PrioritizedRecommendation[],
  states: Map<string, LifecycleState>,
  now: Date = new Date(),
): LifecycleAwareRecommendation[] {
  const out: LifecycleAwareRecommendation[] = [];
  for (const rec of queue) {
    const state = states.get(recKey(rec)) ?? null;
    if (state && isHidden(state, now)) continue;
    out.push({ ...rec, lifecycle: state });
  }
  return out;
}
