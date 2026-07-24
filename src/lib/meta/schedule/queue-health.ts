// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · QUEUE HEALTH (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// Derives a safe, secret-free queue-health snapshot + a coarse health grade from
// canonical status counts. Purely a function of counts (no ids, no payloads), so
// it is deterministic and cannot leak an identifier. Signals the operator cares
// about: backlog depth, in-flight, retry-waiting, dead-letter accumulation, and
// the age of the oldest due-but-unclaimed job (a stuck-dispatcher smell).
// ============================================================================
import type { QueueHealthCounts } from "./ports";

export type QueueGrade = "healthy" | "degraded" | "unhealthy";

export interface QueueHealthSnapshot {
  scheduled: number; available: number; claimed: number; executing: number; retryWait: number; blocked: number;
  succeeded: number; failed: number; cancelled: number; deadLetter: number;
  backlog: number;            // scheduled + available + retry_wait (work waiting)
  inFlight: number;           // claimed + executing
  oldestDueMs: number | null; // age of the oldest claimable-but-unclaimed job
  grade: QueueGrade;
  reasons: readonly string[];
}

export interface HealthThresholds { maxBacklog: number; maxOldestDueMs: number; maxDeadLetter: number }
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = { maxBacklog: 500, maxOldestDueMs: 300_000, maxDeadLetter: 50 };

const n = (m: Readonly<Record<string, number>>, k: string) => m[k] ?? 0;

/** Build the health snapshot + grade from raw status counts. Pure. */
export function computeQueueHealth(counts: QueueHealthCounts, thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS): QueueHealthSnapshot {
  const s = counts.byStatus;
  const scheduled = n(s, "scheduled"), available = n(s, "available"), claimed = n(s, "claimed"), executing = n(s, "executing");
  const retryWait = n(s, "retry_wait"), blocked = n(s, "blocked"), succeeded = n(s, "succeeded"), failed = n(s, "failed"), cancelled = n(s, "cancelled");
  const deadLetter = counts.deadLetter;
  const backlog = scheduled + available + retryWait;
  const inFlight = claimed + executing;
  const reasons: string[] = [];
  let grade: QueueGrade = "healthy";
  const oldest = counts.oldestDueMs;
  if (oldest != null && oldest > thresholds.maxOldestDueMs) { grade = "degraded"; reasons.push("oldest_due_exceeds_threshold"); }
  if (backlog > thresholds.maxBacklog) { grade = "degraded"; reasons.push("backlog_high"); }
  if (deadLetter > thresholds.maxDeadLetter) { grade = "unhealthy"; reasons.push("dead_letter_accumulation"); }
  if (oldest != null && oldest > thresholds.maxOldestDueMs * 3) { grade = "unhealthy"; reasons.push("dispatcher_possibly_stuck"); }
  return { scheduled, available, claimed, executing, retryWait, blocked, succeeded, failed, cancelled, deadLetter, backlog, inFlight, oldestDueMs: oldest, grade, reasons };
}
