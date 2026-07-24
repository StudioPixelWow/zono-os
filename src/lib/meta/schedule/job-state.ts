// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · JOB STATE MACHINE (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// The durable background-job lifecycle. A job is the unit the dispatcher claims
// and the worker executes; it NEVER publishes on its own — it drives the sealed
// Phase-3A executor. Transitions fail closed. Claiming, leasing and completion
// are enforced here as pure predicates so the engine + QA share one source of
// truth. There is exactly one authoritative resting place for every outcome:
// succeeded / failed / cancelled / dead_letter are terminal; retry_wait is the
// only non-terminal "waiting" state a failed attempt may re-enter (and only while
// budget remains). A terminal job is never re-claimed.
// ============================================================================

export type JobStatus =
  | "scheduled"   // created, awaiting its scheduled_for instant
  | "available"   // due + unclaimed → claimable now
  | "claimed"     // a worker holds the lease, not yet running the executor
  | "executing"   // the Phase-3A executor is running under this lease
  | "retry_wait"  // an eligible failure; waiting out backoff before re-availability
  | "succeeded"   // published (fully) — terminal
  | "failed"      // finished without full success and not dead-lettered — terminal
  | "cancelled"   // cancelled before terminal execution — terminal
  | "dead_letter" // parked permanently, NO auto-replay — terminal
  | "blocked";    // precondition failed (e.g. asset revoked) — awaits change

export type JobKind = "scheduled_publish" | "automatic_retry" | "recovery";

const JOB: Record<JobStatus, readonly JobStatus[]> = {
  scheduled: ["available", "cancelled", "blocked"],
  available: ["claimed", "cancelled", "blocked", "scheduled"],
  claimed: ["executing", "available", "cancelled", "retry_wait", "dead_letter"],
  executing: ["succeeded", "failed", "retry_wait", "dead_letter", "available", "blocked"],
  retry_wait: ["available", "cancelled", "dead_letter"],
  blocked: ["available", "cancelled", "dead_letter"],
  succeeded: [],
  failed: ["dead_letter"],
  cancelled: [],
  dead_letter: [],
};

export const JOB_TERMINAL: ReadonlySet<JobStatus> = new Set(["succeeded", "failed", "cancelled", "dead_letter"]);
/** Statuses that occupy the "one active job per operation/target" unique guard. */
export const JOB_ACTIVE: ReadonlySet<JobStatus> = new Set(["scheduled", "available", "claimed", "executing", "retry_wait", "blocked"]);
/** Statuses the dispatcher may consider for claiming (subject to run_after ≤ now). */
export const JOB_CLAIMABLE: ReadonlySet<JobStatus> = new Set(["scheduled", "available", "retry_wait"]);

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return (JOB[from] ?? []).includes(to);
}
export function isJobTerminal(s: JobStatus): boolean { return JOB_TERMINAL.has(s); }

/**
 * Is a job eligible to be claimed right now? It must be in a claimable status AND
 * due (run_after ≤ now) AND not already held by a live lease. This is the pure
 * predicate; the store additionally enforces it atomically via SKIP LOCKED so two
 * dispatchers can never both win the same row.
 */
export function isDue(status: JobStatus, runAfterMs: number, nowMs: number): boolean {
  return JOB_CLAIMABLE.has(status) && runAfterMs <= nowMs;
}

/** A cancel request is honoured only before the job reaches a terminal state and
 *  only while it is not mid-execution (an executing job must finish/abandon). */
export function canCancelJob(status: JobStatus): boolean {
  return status === "scheduled" || status === "available" || status === "retry_wait" || status === "blocked" || status === "claimed";
}
