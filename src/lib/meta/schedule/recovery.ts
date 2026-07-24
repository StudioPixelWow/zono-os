// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · ABANDONED-JOB RECOVERY (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// Decides the fate of a job whose worker vanished (stale lease) — the crash-safe
// heart of the queue. The cardinal rule: a job that died WHILE the executor was
// running may have already transmitted a publish POST, so its result is AMBIGUOUS
// and it is NEVER re-run automatically → it is dead-lettered for manual review.
// Only a job whose lease went stale BEFORE the executor started (still merely
// `claimed`) is known not to have touched Meta, so it is safe to requeue. A
// bounded requeue count prevents an abandon⇄requeue thrash loop from running
// forever; exhausting it dead-letters the job. Recovery reclassifies; it never
// itself calls Meta.
// ============================================================================
import type { JobStatus } from "./job-state";
import { isLeaseStale, type LeaseState } from "./lease";

export type RecoveryDisposition =
  | "healthy"                    // lease still active — leave it
  | "requeue"                    // safe: executor never started → back to available
  | "manual_review_dead_letter"  // ambiguous mid-execution → park, no auto-rerun
  | "requeue_exhausted_dead_letter"; // too many requeues → park

export interface RecoveryInput {
  lease: LeaseState;
  nowMs: number;
  /** How many times this job has already been requeued after abandonment. */
  requeueCount: number;
  maxRequeues: number;
}

export interface RecoveryDecision {
  disposition: RecoveryDisposition;
  /** New claimable instant when requeuing (null otherwise). */
  runAfterMs: number | null;
  /** Dead-letter reason when the disposition parks the job. */
  deadLetterReason: "ambiguous_result" | "retries_exhausted" | "recovery_ambiguous" | null;
  /** True when the associated target(s) must be flagged manual_review_required. */
  requiresManualReview: boolean;
  reason: string;
}

/**
 * Classify an abandoned job. Pure + total. A stale `executing` lease is always
 * treated as an ambiguous write (never re-run); a stale `claimed` lease requeues
 * until the bounded requeue budget is spent.
 */
export function recoverAbandonedJob(status: JobStatus, input: RecoveryInput): RecoveryDecision {
  if (!isLeaseStale(input.lease, input.nowMs)) {
    return { disposition: "healthy", runAfterMs: null, deadLetterReason: null, requiresManualReview: false, reason: "lease_active" };
  }
  // The executor was already running → the publish may have reached Meta. Ambiguous.
  if (status === "executing") {
    return { disposition: "manual_review_dead_letter", runAfterMs: null, deadLetterReason: "recovery_ambiguous", requiresManualReview: true, reason: "abandoned_mid_execution_ambiguous" };
  }
  // Merely claimed → the executor never started → the write never happened.
  if (status === "claimed") {
    if (input.requeueCount >= input.maxRequeues) {
      return { disposition: "requeue_exhausted_dead_letter", runAfterMs: null, deadLetterReason: "retries_exhausted", requiresManualReview: false, reason: "requeue_budget_exhausted" };
    }
    return { disposition: "requeue", runAfterMs: input.nowMs, deadLetterReason: null, requiresManualReview: false, reason: "safe_requeue_before_execution" };
  }
  // Any other status with a stale lease is not a working state → nothing to do.
  return { disposition: "healthy", runAfterMs: null, deadLetterReason: null, requiresManualReview: false, reason: "not_a_working_state" };
}
