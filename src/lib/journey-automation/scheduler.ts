// ============================================================================
// ZONO — Delay-queue scheduler logic (pure, deterministic). The durable queue
// lives in journey_delayed_actions; this module decides what is claimable and
// is idempotent + retry-safe. Designed to scale to millions of executions:
// claim a bounded batch of due actions, process, mark done.
// ============================================================================
import { isDue } from "./delays";

export interface DelayedRow {
  id: string;
  executionId: string;
  nodeId: string;
  runAt: string;
  status: string;     // pending/claimed/done/cancelled
  attempts: number;
}

export interface ClaimPlan {
  claim: string[];     // delayed-action ids to claim now
  skipped: number;     // not yet due / not pending
}

/**
 * Select a bounded batch of due, pending delayed actions to claim. Deterministic
 * ordering (by runAt then id) so two workers process disjoint, stable batches.
 */
export function planClaim(rows: DelayedRow[], opts: { nowMs?: number; batch?: number; maxAttempts?: number } = {}): ClaimPlan {
  const now = opts.nowMs ?? Date.now();
  const batch = opts.batch ?? 100;
  const maxAttempts = opts.maxAttempts ?? 5;
  const eligible = rows
    .filter((r) => r.status === "pending" && r.attempts < maxAttempts && isDue(r.runAt, now))
    .sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt) || a.id.localeCompare(b.id));
  return { claim: eligible.slice(0, batch).map((r) => r.id), skipped: rows.length - eligible.length };
}

/** A claimed action is safe to retry if it hasn't exceeded its attempt budget. */
export function canRetry(attempts: number, maxAttempts = 5): boolean {
  return attempts < maxAttempts;
}
