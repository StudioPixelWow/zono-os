// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SCHEDULE ENGINE PORTS. Phase 3B.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the PURE scheduling/queue engine. Persistence
// currency is canonical + secret-free: no token, signed URL, storage_ref, raw
// Graph payload, media bytes — and the lease TOKEN, while stored, is a server-only
// nonce that never enters a DTO. The engine NEVER publishes: it drives the sealed
// Phase-3A executor via the `publish` seam (the exact same engine, not a copy).
// Real adapters (Supabase store with a FOR UPDATE SKIP LOCKED atomic claim, the
// Phase-3A publish service, audit, clock, ids, and an injected random source for
// deterministic jitter) are wired in service.ts; QA drives in-memory fakes.
// ============================================================================
import type { JobStatus, JobKind } from "./job-state";
import type { DeadLetterRecord } from "./dead-letter";
import type { Clock, IdGen, AuditSink } from "../connection/ports";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

export interface PublishJobRow {
  id: string; orgId: string; publishOperationId: string; publishTargetId: string | null;
  jobKind: JobKind; status: JobStatus;
  scheduledForIso: string; scheduledTimezone: string | null; scheduledLocalDatetime: string | null; scheduledOffsetMinutes: number | null;
  runAfterIso: string; priority: number;
  attemptCount: number; maxAttempts: number; retryBudget: number; retryBudgetRemaining: number; requeueCount: number;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtIso: string | null; claimedAtIso: string | null; heartbeatAtIso: string | null;
  lastErrorKind: string | null; lastErrorClass: string | null; safeLastError: string | null; recoveryDisposition: string | null;
  correlationId: string; idempotencyKey: string; revision: number;
  createdAtIso: string; completedAtIso: string | null;
}

export interface PublishJobAttemptRow {
  id: string; orgId: string; publishJobId: string; attemptNumber: number; workerId: string | null; leaseToken: string | null;
  startedAtIso: string; completedAtIso: string | null;
  outcome: "succeeded" | "partial" | "failed" | "ambiguous" | "retry_scheduled" | "dead_lettered" | "abandoned" | "recovered" | null;
  safeErrorKind: string | null; retryClass: string | null; nextRunAfterIso: string | null; durationMs: number | null; correlationId: string | null;
}

export interface RateBudgetConsumeResult { allowed: boolean; used: number; limit: number }

export interface ClaimArgs {
  nowMs: number; limit: number; perOrgMax: number; leaseOwner: string; leaseSeconds: number;
}

export interface InFlightCounts { global: number; perOrg: Readonly<Record<string, number>> }
export interface QueueHealthCounts { byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }

export interface ScheduleStore {
  insertJob(row: PublishJobRow): Promise<void>;
  getJob(orgId: string, id: string): Promise<PublishJobRow | null>;
  findJobByIdem(orgId: string, idempotencyKey: string): Promise<PublishJobRow | null>;
  findActivePrimaryJob(orgId: string, operationId: string): Promise<PublishJobRow | null>;
  listJobsForOperation(orgId: string, operationId: string): Promise<readonly PublishJobRow[]>;
  updateJob(row: PublishJobRow): Promise<void>;
  /** Atomic, distributed-safe, per-org-fair claim (FOR UPDATE SKIP LOCKED). Each
   *  returned row already carries a fresh lease (owner + unique token + expiry). */
  claimDueJobs(args: ClaimArgs): Promise<readonly PublishJobRow[]>;
  /** Working jobs whose lease has expired (candidates for recovery). */
  findStaleJobs(nowMs: number, limit: number): Promise<readonly PublishJobRow[]>;
  insertJobAttempt(row: PublishJobAttemptRow): Promise<void>;
  listJobAttempts(orgId: string, jobId: string): Promise<readonly PublishJobAttemptRow[]>;
  insertDeadLetter(row: DeadLetterRecord): Promise<void>;
  getDeadLetterByJob(orgId: string, jobId: string): Promise<DeadLetterRecord | null>;
  listDeadLetters(orgId: string): Promise<readonly DeadLetterRecord[]>;
  countInFlight(): Promise<InFlightCounts>;
  /** Atomic fixed-window rate-budget consume (increments iff room remains). */
  consumeRateBudget(orgId: string, scope: string, windowStartIso: string, windowSeconds: number, limit: number): Promise<RateBudgetConsumeResult>;
  queueHealth(orgId: string | null, nowMs: number): Promise<QueueHealthCounts>;
}

export interface ExecutorTargetResult {
  targetId: string; status: string; retryable: boolean; errorKind: string | null; ambiguous: boolean; retryAfterMs: number | null;
}

/** Executes the actual publishing by REUSING the Phase-3A engine (never a copy). */
export interface PublishExecutorSeam {
  /** Publish a whole scheduled operation (Phase-3A executeOperation). */
  executeOperation(orgId: string, operationId: string): Promise<{ status: string; successful: number; failed: number; targets: readonly ExecutorTargetResult[] }>;
  /** Automatically re-run one eligible failed target (Phase-3A executor path). */
  retryTargetAutomatic(orgId: string, targetId: string): Promise<{ status: string; retryable: boolean; errorKind: string | null; ambiguous: boolean; retryAfterMs: number | null }>;
  /** Read a target's current status for retry-eligibility gating. */
  readTarget(orgId: string, targetId: string): Promise<{ status: string; retryable: boolean; safeErrorKind: string | null } | null>;
  /** Set an operation's lifecycle status (e.g. scheduled/queued/executing/dead_letter). */
  setOperationStatus(orgId: string, operationId: string, status: string): Promise<void>;
  /** Flag a target for manual review (ambiguous recovery). */
  markTargetManualReview(orgId: string, targetId: string): Promise<void>;
}

/** Injected randomness for deterministic backoff jitter (QA supplies a fixed fn). */
export interface RandomSource { fraction(): number }

export interface SchedulePorts {
  store: ScheduleStore;
  publish: PublishExecutorSeam;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
  random: RandomSource;
}

/** Bounded dispatch defaults (no unbounded env value feeds these). */
export const DEFAULT_DISPATCH_LIMIT = 8;
export const DEFAULT_PER_ORG_MAX = 3;
export const DEFAULT_RECOVERY_LIMIT = 16;
export const DEFAULT_MAX_REQUEUES = 3;
