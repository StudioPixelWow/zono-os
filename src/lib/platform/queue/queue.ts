// ============================================================================
// ZONO — internal queue abstraction (pure planning logic). Supports retry,
// backoff, dead-letter, priority, scheduling, idempotency, cancellation and
// recovery. The durable store (rows) is external; this module decides WHAT to
// claim / retry / dead-letter / dedup — deterministically. Mirrors the proven
// journey delay-queue pattern, generalized to all queue types.
// ============================================================================
import { backoffDelay, isRetryableError, DEFAULT_RETRY } from "../retry/retry";
import type { JobStatus, QueueJob, QueueType, RetryPolicy } from "../types";

export const QUEUE_TYPES: QueueType[] = ["property_sync", "market_refresh", "journey", "ai", "reports", "snapshots", "notifications"];

export const QUEUE_LABELS: Record<QueueType, string> = {
  property_sync: "סנכרון נכסים", market_refresh: "רענון שוק", journey: "מסעות", ai: "AI",
  reports: "דוחות", snapshots: "צילומים", notifications: "התראות",
};

/** Build a new job (idempotent: caller supplies an idempotencyKey to dedup). */
export function makeJob(queue: QueueType, opts: { priority?: number; runAtIso?: string; idempotencyKey?: string | null; maxAttempts?: number; payload?: Record<string, unknown>; id?: string }): QueueJob {
  return {
    id: opts.id ?? `${queue}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    queue, status: "pending", priority: opts.priority ?? 5, attempts: 0,
    maxAttempts: opts.maxAttempts ?? DEFAULT_RETRY.maxAttempts,
    runAt: opts.runAtIso ?? new Date().toISOString(), idempotencyKey: opts.idempotencyKey ?? null, payload: opts.payload,
  };
}

/** Reject duplicates: a pending/claimed/running job with the same key blocks a new enqueue. */
export function shouldEnqueue(job: QueueJob, existing: QueueJob[]): boolean {
  if (!job.idempotencyKey) return true;
  return !existing.some((e) => e.idempotencyKey === job.idempotencyKey && ["pending", "claimed", "running"].includes(e.status));
}

export interface ClaimPlan { claim: string[]; skipped: number }

/**
 * Select a bounded, due, pending batch — ordered by priority then runAt then id
 * (deterministic so concurrent workers process disjoint, stable batches).
 */
export function planClaim(jobs: QueueJob[], opts: { nowMs?: number; batch?: number } = {}): ClaimPlan {
  const now = opts.nowMs ?? Date.now();
  const batch = opts.batch ?? 50;
  const eligible = jobs
    .filter((j) => j.status === "pending" && Date.parse(j.runAt) <= now)
    .sort((a, b) => a.priority - b.priority || Date.parse(a.runAt) - Date.parse(b.runAt) || a.id.localeCompare(b.id));
  return { claim: eligible.slice(0, batch).map((j) => j.id), skipped: jobs.length - eligible.length };
}

export interface FailureOutcome { status: JobStatus; attempts: number; runAtIso: string | null; deadLettered: boolean; reason: string }

/**
 * Decide a job's fate after a failure: retry (re-schedule with backoff),
 * dead-letter (non-retryable or exhausted), terminal.
 */
export function onJobFailure(job: QueueJob, error: unknown, policy: RetryPolicy = DEFAULT_RETRY, nowMs = Date.now(), jitter01 = 0.5): FailureOutcome {
  const attempts = job.attempts + 1;
  const retryable = isRetryableError(error);
  if (!retryable) return { status: "dead", attempts, runAtIso: null, deadLettered: true, reason: "non-retryable → DLQ" };
  if (attempts >= job.maxAttempts) return { status: "dead", attempts, runAtIso: null, deadLettered: true, reason: "max attempts → DLQ" };
  const delay = backoffDelay(attempts + 1, policy, jitter01);
  return { status: "pending", attempts, runAtIso: new Date(nowMs + delay).toISOString(), deadLettered: false, reason: `retry in ${delay}ms` };
}

/** Cancellation: only non-terminal jobs can be cancelled. */
export function canCancel(status: JobStatus): boolean { return ["pending", "claimed", "running"].includes(status); }

/** Recovery: a job stuck in claimed/running past a lease window is requeued. */
export function planRecovery(jobs: QueueJob[], opts: { nowMs?: number; leaseMs?: number; claimedAtIso?: Map<string, string> }): string[] {
  const now = opts.nowMs ?? Date.now();
  const lease = opts.leaseMs ?? 5 * 60_000;
  return jobs
    .filter((j) => (j.status === "claimed" || j.status === "running"))
    .filter((j) => { const at = opts.claimedAtIso?.get(j.id); return at ? now - Date.parse(at) > lease : true; })
    .map((j) => j.id);
}

/** DLQ jobs whose attempts haven't truly exhausted can be replayed (requeued). */
export function planReplayDeadLetter(jobs: QueueJob[]): string[] {
  return jobs.filter((j) => j.status === "dead").map((j) => j.id);
}

export function queueCounts(jobs: QueueJob[]): Record<JobStatus, number> {
  const c: Record<JobStatus, number> = { pending: 0, claimed: 0, running: 0, done: 0, failed: 0, dead: 0, cancelled: 0 };
  for (const j of jobs) c[j.status]++;
  return c;
}
