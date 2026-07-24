// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SCHEDULE / QUEUE ENGINE (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// The durable scheduling + background-execution brain, over injected ports.
// Guarantees, all deterministically testable with in-memory fakes + a mock
// executor:
//   • A scheduled operation becomes ONE durable `scheduled_publish` job; creation
//     is idempotent (a duplicate command resumes the existing job).
//   • Dispatch claims due jobs ATOMICALLY (the store's FOR UPDATE SKIP LOCKED
//     claim); global + per-org concurrency and fairness bound each tick.
//   • The worker NEVER publishes directly — it drives the sealed Phase-3A executor
//     via the publish seam.
//   • Automatic retry fires ONLY for a canonically transient failure, per target,
//     with bounded exponential backoff + jitter + Retry-After + a finite budget;
//     an AMBIGUOUS write is never auto-retried (→ manual review + dead-letter),
//     an auth failure blocks (awaits reconnect), a permanent failure dead-letters.
//   • Abandoned jobs recover safely: pre-execution requeues; mid-execution is
//     ambiguous → dead-letter + manual review, never a blind re-run.
//   • Dead-lettered jobs are terminal — nothing auto-replays them.
// ============================================================================
import type { SchedulePorts, PublishJobRow, PublishJobAttemptRow, ClaimArgs } from "./ports";
import { DEFAULT_PER_ORG_MAX, DEFAULT_DISPATCH_LIMIT, DEFAULT_RECOVERY_LIMIT, DEFAULT_MAX_REQUEUES } from "./ports";
import { JOB_TERMINAL, canCancelJob, type JobStatus } from "./job-state";
import { heartbeatLease, canFinalize, RELEASED_LEASE, DEFAULT_LEASE_MS, type LeaseState } from "./lease";
import { automaticRetryDecision, DEFAULT_RETRY_POLICY, type RetryPolicy } from "./retry";
import { recoverAbandonedJob } from "./recovery";
import { buildDeadLetter, type DeadLetterReason } from "./dead-letter";
import { DEFAULT_CONCURRENCY, type ConcurrencyLimits } from "./budget";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent, MetaNotificationEventName } from "../notify/types";
import type { MetaProviderErrorKind } from "../provider/errors";
import type { ResolvedInstant } from "./timezone";

const leaseState = (j: PublishJobRow): LeaseState => ({ status: j.status, leaseOwner: j.leaseOwner, leaseToken: j.leaseToken, leaseExpiresAtMs: j.leaseExpiresAtIso ? Date.parse(j.leaseExpiresAtIso) : null });

function event(ports: SchedulePorts, name: MetaNotificationEventName, orgId: string, assetRef: string | null, correlationId: string, data: Record<string, unknown>): MetaNotificationEvent {
  return buildMetaNotificationEvent({ event: name, orgId, occurredAt: ports.clock.nowIso(), assetRef, correlationId, data });
}

// ── Scheduling ───────────────────────────────────────────────────────────────
export interface ScheduleInput {
  orgId: string; operationId: string; instant: ResolvedInstant; priority?: number;
  retryBudget?: number; maxAttempts?: number; correlationId: string; idempotencyKey: string;
}
export interface ScheduleResult { job: PublishJobRow; resumed: boolean; events: readonly MetaNotificationEvent[] }

/** Create (or resume) the single durable scheduled-publish job for an operation. */
export async function scheduleOperation(ports: SchedulePorts, input: ScheduleInput): Promise<ScheduleResult> {
  const existingByIdem = await ports.store.findJobByIdem(input.orgId, input.idempotencyKey);
  if (existingByIdem) return { job: existingByIdem, resumed: true, events: [] };
  const existingActive = await ports.store.findActivePrimaryJob(input.orgId, input.operationId);
  if (existingActive) return { job: existingActive, resumed: true, events: [] };

  const nowIso = ports.clock.nowIso();
  const budget = Math.max(0, input.retryBudget ?? DEFAULT_RETRY_POLICY.maxAttempts);
  const job: PublishJobRow = {
    id: ports.ids.uuid(), orgId: input.orgId, publishOperationId: input.operationId, publishTargetId: null,
    jobKind: "scheduled_publish", status: "scheduled",
    scheduledForIso: input.instant.utcIso, scheduledTimezone: input.instant.timeZone, scheduledLocalDatetime: input.instant.localDateTime, scheduledOffsetMinutes: input.instant.offsetMinutes,
    runAfterIso: input.instant.utcIso, priority: input.priority ?? 100,
    attemptCount: 0, maxAttempts: input.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts, retryBudget: budget, retryBudgetRemaining: budget, requeueCount: 0,
    leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, claimedAtIso: null, heartbeatAtIso: null,
    lastErrorKind: null, lastErrorClass: null, safeLastError: null, recoveryDisposition: null,
    correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, revision: 1,
    createdAtIso: nowIso, completedAtIso: null,
  };
  await ports.store.insertJob(job);
  await ports.publish.setOperationStatus(input.orgId, input.operationId, "scheduled");
  await ports.audit.log({ action: "meta.schedule.job_created", entityId: job.id, summary: "scheduled publish job created", metadata: { operationId: input.operationId, scheduledFor: job.scheduledForIso, timezone: job.scheduledTimezone } });
  return { job, resumed: false, events: [event(ports, "meta.post.scheduled", input.orgId, input.operationId, input.correlationId, { operationId: input.operationId, scheduledFor: job.scheduledForIso, timezone: job.scheduledTimezone })] };
}

/** Reschedule a not-yet-claimed scheduled job to a new instant. */
export async function rescheduleOperation(ports: SchedulePorts, orgId: string, operationId: string, instant: ResolvedInstant): Promise<{ ok: boolean; error: string | null; job: PublishJobRow | null }> {
  const job = await ports.store.findActivePrimaryJob(orgId, operationId);
  if (!job) return { ok: false, error: "not_found", job: null };
  if (job.status !== "scheduled") return { ok: false, error: `not_reschedulable:${job.status}`, job };
  const next: PublishJobRow = { ...job, scheduledForIso: instant.utcIso, runAfterIso: instant.utcIso, scheduledTimezone: instant.timeZone, scheduledLocalDatetime: instant.localDateTime, scheduledOffsetMinutes: instant.offsetMinutes, revision: job.revision + 1 };
  await ports.store.updateJob(next);
  await ports.audit.log({ action: "meta.schedule.job_rescheduled", entityId: job.id, summary: "scheduled publish job rescheduled", metadata: { operationId, scheduledFor: instant.utcIso } });
  return { ok: true, error: null, job: next };
}

/** Cancel a scheduled operation before it executes. */
export async function cancelScheduledOperation(ports: SchedulePorts, orgId: string, operationId: string, reason = "user_cancel"): Promise<{ ok: boolean; error: string | null; events: readonly MetaNotificationEvent[] }> {
  const job = await ports.store.findActivePrimaryJob(orgId, operationId);
  if (!job) return { ok: false, error: "not_found", events: [] };
  if (!canCancelJob(job.status) || job.status === "executing") return { ok: false, error: `not_cancellable:${job.status}`, events: [] };
  const cancelled: PublishJobRow = { ...job, status: "cancelled", ...RELEASED_LEASE, leaseExpiresAtIso: null, completedAtIso: ports.clock.nowIso(), revision: job.revision + 1 };
  await ports.store.updateJob(cancelled);
  await ports.publish.setOperationStatus(orgId, operationId, "cancelled");
  await ports.audit.log({ action: "meta.schedule.job_cancelled", entityId: job.id, summary: "scheduled publish cancelled", metadata: { operationId, reason } });
  return { ok: true, error: null, events: [event(ports, "meta.post.scheduled_cancelled", orgId, operationId, job.correlationId, { operationId, reason })] };
}

// ── Dispatch (atomic claim) ────────────────────────────────────────────────────
export interface DispatchOptions { limit?: number; perOrgMax?: number; leaseSeconds?: number; leaseOwner: string; concurrency?: ConcurrencyLimits }

/** Claim a bounded, fair batch of due jobs. Global concurrency bounds the limit. */
export async function dispatchDue(ports: SchedulePorts, opts: DispatchOptions): Promise<readonly PublishJobRow[]> {
  const limits = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const inFlight = await ports.store.countInFlight();
  const globalRoom = Math.max(0, limits.globalMax - inFlight.global);
  const limit = Math.max(0, Math.min(opts.limit ?? DEFAULT_DISPATCH_LIMIT, globalRoom));
  if (limit === 0) return [];
  const args: ClaimArgs = { nowMs: ports.clock.nowMs(), limit, perOrgMax: opts.perOrgMax ?? DEFAULT_PER_ORG_MAX, leaseOwner: opts.leaseOwner, leaseSeconds: Math.round((opts.leaseSeconds ?? DEFAULT_LEASE_MS / 1000)) };
  const claimed = await ports.store.claimDueJobs(args);
  for (const j of claimed) await ports.audit.log({ action: "meta.schedule.job_claimed", entityId: j.id, summary: "job claimed", metadata: { jobKind: j.jobKind, operationId: j.publishOperationId } });
  return claimed;
}

// ── Heartbeat ──────────────────────────────────────────────────────────────────
export async function heartbeat(ports: SchedulePorts, orgId: string, jobId: string, owner: string, token: string, leaseSeconds?: number): Promise<{ ok: boolean; reason: string | null }> {
  const job = await ports.store.getJob(orgId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const nowMs = ports.clock.nowMs();
  const hb = heartbeatLease(leaseState(job), owner, token, nowMs, (leaseSeconds ?? DEFAULT_LEASE_MS / 1000) * 1000);
  if (!hb.ok) return { ok: false, reason: hb.reason };
  await ports.store.updateJob({ ...job, leaseExpiresAtIso: new Date(hb.leaseExpiresAtMs!).toISOString(), heartbeatAtIso: new Date(hb.heartbeatAtMs!).toISOString(), revision: job.revision + 1 });
  return { ok: true, reason: null };
}

// ── Work a claimed job ─────────────────────────────────────────────────────────
export interface WorkContext { workerId: string; retryPolicy?: RetryPolicy }
export interface WorkResult { job: PublishJobRow; outcome: string; events: readonly MetaNotificationEvent[]; spawnedRetryJobIds: readonly string[] }

async function recordAttempt(ports: SchedulePorts, job: PublishJobRow, outcome: PublishJobAttemptRow["outcome"], startedMs: number, extra?: Partial<PublishJobAttemptRow>): Promise<void> {
  await ports.store.insertJobAttempt({
    id: ports.ids.uuid(), orgId: job.orgId, publishJobId: job.id, attemptNumber: job.attemptCount + 1, workerId: job.leaseOwner, leaseToken: job.leaseToken,
    startedAtIso: new Date(startedMs).toISOString(), completedAtIso: ports.clock.nowIso(), outcome,
    safeErrorKind: extra?.safeErrorKind ?? null, retryClass: extra?.retryClass ?? null, nextRunAfterIso: extra?.nextRunAfterIso ?? null, durationMs: ports.clock.nowMs() - startedMs, correlationId: job.correlationId,
  });
}

async function deadLetter(ports: SchedulePorts, job: PublishJobRow, reason: DeadLetterReason, errorKind: string | null, errorClass: string | null, extra: Record<string, unknown>): Promise<MetaNotificationEvent> {
  await ports.store.insertDeadLetter(buildDeadLetter({ id: ports.ids.uuid(), orgId: job.orgId, publishJobId: job.id, publishOperationId: job.publishOperationId, publishTargetId: job.publishTargetId, jobKind: job.jobKind, reason, terminalErrorKind: errorKind, terminalErrorClass: errorClass, attemptCount: job.attemptCount, createdAt: ports.clock.nowIso(), extra }));
  await ports.audit.log({ action: "meta.schedule.dead_lettered", entityId: job.id, summary: `job dead-lettered (${reason})`, metadata: { reason, operationId: job.publishOperationId, errorKind } });
  return event(ports, "meta.post.dead_lettered", job.orgId, job.publishOperationId, job.correlationId, { operationId: job.publishOperationId, targetId: job.publishTargetId, reason });
}

/**
 * Execute one claimed job by driving the Phase-3A executor. The caller (the
 * worker route) presents the lease it holds; we fence every mutation against it.
 */
export async function workJob(ports: SchedulePorts, job0: PublishJobRow, ctx: WorkContext): Promise<WorkResult> {
  const policy = ctx.retryPolicy ?? DEFAULT_RETRY_POLICY;
  // Re-read the CURRENT row and fence the worker's held lease against it: if a
  // reaper reclaimed/reassigned the job (new token) or it already finished, the
  // worker's stale token fails the guard and it aborts — no double-execution.
  const current = await ports.store.getJob(job0.orgId, job0.id);
  if (!current) return { job: job0, outcome: "fence_not_found", events: [], spawnedRetryJobIds: [] };
  if (JOB_TERMINAL.has(current.status)) return { job: current, outcome: "already_terminal", events: [], spawnedRetryJobIds: [] };
  const fence = canFinalize(leaseState(current), job0.leaseOwner ?? "", job0.leaseToken ?? "");
  if (!fence.ok) return { job: current, outcome: `fence_${fence.reason}`, events: [], spawnedRetryJobIds: [] };
  const job1 = current;

  const startedMs = ports.clock.nowMs();
  const job: PublishJobRow = { ...job1, status: "executing", heartbeatAtIso: ports.clock.nowIso(), revision: job1.revision + 1 };
  await ports.store.updateJob(job);
  await ports.audit.log({ action: "meta.schedule.job_executing", entityId: job.id, summary: "job executing", metadata: { jobKind: job.jobKind, operationId: job.publishOperationId } });

  if (job.jobKind === "scheduled_publish") return workScheduledPublish(ports, job, startedMs, policy);
  if (job.jobKind === "automatic_retry") return workAutomaticRetry(ports, job, startedMs, policy);
  // 'recovery' job kind is reserved; recovery runs via recoverAbandoned, not here.
  const done: PublishJobRow = { ...job, status: "failed", completedAtIso: ports.clock.nowIso(), ...RELEASED_LEASE, revision: job.revision + 1 };
  await ports.store.updateJob(done);
  return { job: done, outcome: "unsupported_job_kind", events: [], spawnedRetryJobIds: [] };
}

async function workScheduledPublish(ports: SchedulePorts, job: PublishJobRow, startedMs: number, policy: RetryPolicy): Promise<WorkResult> {
  await ports.publish.setOperationStatus(job.orgId, job.publishOperationId, "executing");
  const result = await ports.publish.executeOperation(job.orgId, job.publishOperationId);
  const events: MetaNotificationEvent[] = [];
  const spawned: string[] = [];

  for (const t of result.targets) {
    if (t.status === "succeeded") continue;
    if (t.status === "manual_review_required" || t.ambiguous) {
      // Ambiguous — never auto-retried; the Phase-3A executor already flagged it.
      events.push(await deadLetter(ports, { ...job, publishTargetId: t.targetId }, "ambiguous_result", t.errorKind, "ambiguous", { platform: undefined, targetId: t.targetId }));
      continue;
    }
    const decision = automaticRetryDecision({ errorKind: (t.errorKind ?? "internal") as MetaProviderErrorKind, ambiguous: t.ambiguous, attemptCount: 0, budgetRemaining: job.retryBudget, retryAfterMs: t.retryAfterMs, nowMs: ports.clock.nowMs(), jitterFraction: ports.random.fraction(), policy });
    if (decision.action === "retry") {
      const child = await spawnAutomaticRetryJob(ports, job, t.targetId, decision.runAfterMs!, decision.budgetRemaining);
      spawned.push(child.id);
      events.push(event(ports, "meta.post.retry_scheduled", job.orgId, job.publishOperationId, job.correlationId, { operationId: job.publishOperationId, targetId: t.targetId, runAfter: child.runAfterIso }));
    } else if (decision.action === "dead_letter") {
      events.push(await deadLetter(ports, { ...job, publishTargetId: t.targetId }, decision.deadLetterReason ?? "permanent_failure", t.errorKind, decision.category, { targetId: t.targetId }));
    } // 'blocked' → target waits for a human reconnect; no child job, no dead-letter.
  }

  const opStatus = spawned.length > 0 ? "retry_wait" : result.status;
  await ports.publish.setOperationStatus(job.orgId, job.publishOperationId, opStatus === "partially_succeeded" && spawned.length === 0 ? "partially_succeeded" : opStatus);
  const jobStatus: JobStatus = result.status === "succeeded" ? "succeeded" : "failed";
  const done: PublishJobRow = { ...job, status: jobStatus, completedAtIso: ports.clock.nowIso(), ...RELEASED_LEASE, revision: job.revision + 1 };
  await ports.store.updateJob(done);
  await recordAttempt(ports, job, spawned.length > 0 ? "retry_scheduled" : result.status === "succeeded" ? "succeeded" : "failed", startedMs);
  await ports.audit.log({ action: "meta.schedule.job_completed", entityId: job.id, summary: `scheduled publish ${jobStatus}`, metadata: { operationId: job.publishOperationId, successful: result.successful, failed: result.failed, spawnedRetries: spawned.length } });
  return { job: done, outcome: jobStatus, events, spawnedRetryJobIds: spawned };
}

async function spawnAutomaticRetryJob(ports: SchedulePorts, parent: PublishJobRow, targetId: string, runAfterMs: number, budgetRemaining: number): Promise<PublishJobRow> {
  const idempotencyKey = `${parent.idempotencyKey}:retry:${targetId}`;
  const existing = await ports.store.findJobByIdem(parent.orgId, idempotencyKey);
  if (existing) return existing; // idempotent: never spawn a duplicate retry job
  const nowIso = ports.clock.nowIso();
  const child: PublishJobRow = {
    id: ports.ids.uuid(), orgId: parent.orgId, publishOperationId: parent.publishOperationId, publishTargetId: targetId,
    jobKind: "automatic_retry", status: "retry_wait",
    scheduledForIso: new Date(runAfterMs).toISOString(), scheduledTimezone: parent.scheduledTimezone, scheduledLocalDatetime: null, scheduledOffsetMinutes: parent.scheduledOffsetMinutes,
    runAfterIso: new Date(runAfterMs).toISOString(), priority: parent.priority,
    attemptCount: 1, maxAttempts: parent.maxAttempts, retryBudget: parent.retryBudget, retryBudgetRemaining: budgetRemaining, requeueCount: 0,
    leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, claimedAtIso: null, heartbeatAtIso: null,
    lastErrorKind: null, lastErrorClass: null, safeLastError: null, recoveryDisposition: null,
    correlationId: parent.correlationId, idempotencyKey, revision: 1,
    createdAtIso: nowIso, completedAtIso: null,
  };
  await ports.store.insertJob(child);
  await ports.audit.log({ action: "meta.schedule.retry_scheduled", entityId: child.id, summary: "automatic retry scheduled", metadata: { operationId: parent.publishOperationId, targetId, runAfter: child.runAfterIso } });
  return child;
}

async function workAutomaticRetry(ports: SchedulePorts, job: PublishJobRow, startedMs: number, policy: RetryPolicy): Promise<WorkResult> {
  const targetId = job.publishTargetId!;
  const pre = await ports.publish.readTarget(job.orgId, targetId);
  if (!pre) { const done = await finalizeJob(ports, job, "failed", startedMs, "failed", null, null); return { job: done, outcome: "target_not_found", events: [], spawnedRetryJobIds: [] }; }
  if (pre.status === "succeeded") { const done = await finalizeJob(ports, job, "succeeded", startedMs, "succeeded", null, null); return { job: done, outcome: "already_succeeded", events: [], spawnedRetryJobIds: [] }; }

  const result = await ports.publish.retryTargetAutomatic(job.orgId, targetId);
  const events: MetaNotificationEvent[] = [];
  if (result.status === "succeeded") {
    const done = await finalizeJob(ports, job, "succeeded", startedMs, "succeeded", null, null);
    events.push(event(ports, "meta.post.published", job.orgId, job.publishOperationId, job.correlationId, { operationId: job.publishOperationId, targetId, retry: true }));
    return { job: done, outcome: "succeeded", events, spawnedRetryJobIds: [] };
  }
  // Failed again — decide automatically, honouring budget already spent.
  const decision = automaticRetryDecision({ errorKind: (result.errorKind ?? "internal") as MetaProviderErrorKind, ambiguous: result.ambiguous, attemptCount: job.attemptCount, budgetRemaining: job.retryBudgetRemaining, retryAfterMs: result.retryAfterMs, nowMs: ports.clock.nowMs(), jitterFraction: ports.random.fraction(), policy });
  if (decision.action === "retry") {
    const next: PublishJobRow = { ...job, status: "retry_wait", attemptCount: job.attemptCount + 1, retryBudgetRemaining: decision.budgetRemaining, runAfterIso: new Date(decision.runAfterMs!).toISOString(), lastErrorKind: result.errorKind, lastErrorClass: decision.category, safeLastError: null, ...RELEASED_LEASE, revision: job.revision + 1 };
    await ports.store.updateJob(next);
    await recordAttempt(ports, job, "retry_scheduled", startedMs, { safeErrorKind: result.errorKind, retryClass: decision.category, nextRunAfterIso: next.runAfterIso });
    await ports.audit.log({ action: "meta.schedule.retry_rescheduled", entityId: job.id, summary: "automatic retry rescheduled", metadata: { operationId: job.publishOperationId, targetId, runAfter: next.runAfterIso, budgetRemaining: decision.budgetRemaining } });
    events.push(event(ports, "meta.post.retry_scheduled", job.orgId, job.publishOperationId, job.correlationId, { operationId: job.publishOperationId, targetId, runAfter: next.runAfterIso }));
    return { job: next, outcome: "retry_scheduled", events, spawnedRetryJobIds: [] };
  }
  if (decision.action === "blocked") {
    const blocked: PublishJobRow = { ...job, status: "blocked", lastErrorKind: result.errorKind, lastErrorClass: decision.category, ...RELEASED_LEASE, revision: job.revision + 1 };
    await ports.store.updateJob(blocked);
    await recordAttempt(ports, job, "failed", startedMs, { safeErrorKind: result.errorKind, retryClass: decision.category });
    await ports.audit.log({ action: "meta.schedule.job_blocked", entityId: job.id, summary: "automatic retry blocked (reconnect required)", metadata: { operationId: job.publishOperationId, targetId } });
    return { job: blocked, outcome: "blocked", events, spawnedRetryJobIds: [] };
  }
  // dead_letter
  if (decision.deadLetterReason === "ambiguous_result") await ports.publish.markTargetManualReview(job.orgId, targetId);
  const dl = await deadLetter(ports, job, decision.deadLetterReason ?? "permanent_failure", result.errorKind, decision.category, { targetId });
  const done = await finalizeJob(ports, job, "dead_letter", startedMs, "dead_lettered", result.errorKind, decision.category);
  events.push(dl);
  return { job: done, outcome: "dead_letter", events, spawnedRetryJobIds: [] };
}

async function finalizeJob(ports: SchedulePorts, job: PublishJobRow, status: JobStatus, startedMs: number, outcome: PublishJobAttemptRow["outcome"], errorKind: string | null, errorClass: string | null): Promise<PublishJobRow> {
  const done: PublishJobRow = { ...job, status, completedAtIso: ports.clock.nowIso(), lastErrorKind: errorKind, lastErrorClass: errorClass, ...RELEASED_LEASE, revision: job.revision + 1 };
  await ports.store.updateJob(done);
  await recordAttempt(ports, job, outcome, startedMs, { safeErrorKind: errorKind, retryClass: errorClass });
  return done;
}

// ── Recovery of abandoned jobs ──────────────────────────────────────────────────
export interface RecoverOptions { limit?: number; maxRequeues?: number }
export interface RecoverResult { recovered: number; requeued: number; deadLettered: number; events: readonly MetaNotificationEvent[] }

/** Reap stale leases and reclassify abandoned jobs (safe requeue vs ambiguous DL). */
export async function recoverAbandoned(ports: SchedulePorts, opts?: RecoverOptions): Promise<RecoverResult> {
  const nowMs = ports.clock.nowMs();
  const stale = await ports.store.findStaleJobs(nowMs, opts?.limit ?? DEFAULT_RECOVERY_LIMIT);
  const events: MetaNotificationEvent[] = [];
  let requeued = 0, deadLettered = 0, recovered = 0;
  for (const job of stale) {
    const decision = recoverAbandonedJob(job.status, { lease: leaseState(job), nowMs, requeueCount: job.requeueCount, maxRequeues: opts?.maxRequeues ?? DEFAULT_MAX_REQUEUES });
    if (decision.disposition === "healthy") continue;
    recovered++;
    if (decision.disposition === "requeue") {
      const next: PublishJobRow = { ...job, status: "available", runAfterIso: new Date(decision.runAfterMs!).toISOString(), requeueCount: job.requeueCount + 1, recoveryDisposition: "requeued", ...RELEASED_LEASE, revision: job.revision + 1 };
      await ports.store.updateJob(next);
      await ports.audit.log({ action: "meta.schedule.job_requeued", entityId: job.id, summary: "abandoned job requeued (pre-execution)", metadata: { operationId: job.publishOperationId, requeueCount: next.requeueCount } });
      requeued++;
      continue;
    }
    // Ambiguous mid-execution OR requeue-exhausted → dead-letter, no auto-rerun.
    if (decision.requiresManualReview && job.publishTargetId) await ports.publish.markTargetManualReview(job.orgId, job.publishTargetId);
    const reason: DeadLetterReason = decision.deadLetterReason === "recovery_ambiguous" ? "recovery_ambiguous" : decision.deadLetterReason === "retries_exhausted" ? "retries_exhausted" : "ambiguous_result";
    events.push(await deadLetter(ports, job, reason, job.lastErrorKind, job.lastErrorClass, { requeueCount: job.requeueCount }));
    const done: PublishJobRow = { ...job, status: "dead_letter", recoveryDisposition: decision.disposition, completedAtIso: ports.clock.nowIso(), ...RELEASED_LEASE, revision: job.revision + 1 };
    await ports.store.updateJob(done);
    if (decision.requiresManualReview) await ports.publish.setOperationStatus(job.orgId, job.publishOperationId, "dead_letter");
    deadLettered++;
  }
  return { recovered, requeued, deadLettered, events };
}
