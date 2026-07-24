// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SCHEDULE STORE ADAPTER. Phase 3B (server).
// ----------------------------------------------------------------------------
// Supabase-backed ScheduleStore (service-role writes; org-scoped reads). Persists
// only canonical, secret-free state. The atomic, distributed-safe claim and the
// atomic rate-budget consume are delegated to SECURITY DEFINER SQL functions
// (`meta_publish_claim_due` uses FOR UPDATE SKIP LOCKED; `meta_publish_consume_
// budget` increments in one statement) so two dispatchers/limiters can never race.
// The lease token lives only in these rows and the SQL claim — never in a DTO.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ScheduleStore, PublishJobRow, PublishJobAttemptRow, ClaimArgs, InFlightCounts, QueueHealthCounts, RateBudgetConsumeResult } from "./ports";
import type { JobStatus, JobKind } from "./job-state";
import type { DeadLetterRecord, DeadLetterReason } from "./dead-letter";

type Row = Record<string, unknown>;
const db = () => createServiceRoleClient();
const now = () => new Date().toISOString();

const jobToDb = (j: PublishJobRow): Row => ({
  id: j.id, org_id: j.orgId, publish_operation_id: j.publishOperationId, publish_target_id: j.publishTargetId,
  job_kind: j.jobKind, status: j.status,
  scheduled_for: j.scheduledForIso, scheduled_timezone: j.scheduledTimezone, scheduled_local_datetime: j.scheduledLocalDatetime, scheduled_offset_minutes: j.scheduledOffsetMinutes,
  run_after: j.runAfterIso, priority: j.priority,
  attempt_count: j.attemptCount, max_attempts: j.maxAttempts, retry_budget: j.retryBudget, retry_budget_remaining: j.retryBudgetRemaining, requeue_count: j.requeueCount,
  lease_owner: j.leaseOwner, lease_token: j.leaseToken, lease_expires_at: j.leaseExpiresAtIso, claimed_at: j.claimedAtIso, heartbeat_at: j.heartbeatAtIso,
  last_error_kind: j.lastErrorKind, last_error_class: j.lastErrorClass, safe_last_error: j.safeLastError, recovery_disposition: j.recoveryDisposition,
  correlation_id: j.correlationId, idempotency_key: j.idempotencyKey, revision: j.revision, completed_at: j.completedAtIso, updated_at: now(),
});
const jobFromDb = (d: Row): PublishJobRow => ({
  id: String(d.id), orgId: String(d.org_id), publishOperationId: String(d.publish_operation_id), publishTargetId: (d.publish_target_id as string) ?? null,
  jobKind: d.job_kind as JobKind, status: d.status as JobStatus,
  scheduledForIso: String(d.scheduled_for), scheduledTimezone: (d.scheduled_timezone as string) ?? null, scheduledLocalDatetime: (d.scheduled_local_datetime as string) ?? null, scheduledOffsetMinutes: (d.scheduled_offset_minutes as number) ?? null,
  runAfterIso: String(d.run_after), priority: Number(d.priority ?? 100),
  attemptCount: Number(d.attempt_count ?? 0), maxAttempts: Number(d.max_attempts ?? 5), retryBudget: Number(d.retry_budget ?? 5), retryBudgetRemaining: Number(d.retry_budget_remaining ?? 0), requeueCount: Number(d.requeue_count ?? 0),
  leaseOwner: (d.lease_owner as string) ?? null, leaseToken: (d.lease_token as string) ?? null, leaseExpiresAtIso: (d.lease_expires_at as string) ?? null, claimedAtIso: (d.claimed_at as string) ?? null, heartbeatAtIso: (d.heartbeat_at as string) ?? null,
  lastErrorKind: (d.last_error_kind as string) ?? null, lastErrorClass: (d.last_error_class as string) ?? null, safeLastError: (d.safe_last_error as string) ?? null, recoveryDisposition: (d.recovery_disposition as string) ?? null,
  correlationId: String(d.correlation_id ?? ""), idempotencyKey: String(d.idempotency_key ?? ""), revision: Number(d.revision ?? 0),
  createdAtIso: String(d.created_at ?? now()), completedAtIso: (d.completed_at as string) ?? null,
});

const dlToDb = (r: DeadLetterRecord): Row => ({ id: r.id, org_id: r.orgId, publish_job_id: r.publishJobId, publish_operation_id: r.publishOperationId, publish_target_id: r.publishTargetId, job_kind: r.jobKind, reason: r.reason, terminal_error_kind: r.terminalErrorKind, terminal_error_class: r.terminalErrorClass, attempt_count: r.attemptCount, safe_context: r.safeContext, created_at: r.createdAt });
const dlFromDb = (d: Row): DeadLetterRecord => ({ id: String(d.id), orgId: String(d.org_id), publishJobId: String(d.publish_job_id), publishOperationId: String(d.publish_operation_id), publishTargetId: (d.publish_target_id as string) ?? null, jobKind: d.job_kind as JobKind, reason: d.reason as DeadLetterReason, terminalErrorKind: (d.terminal_error_kind as string) ?? null, terminalErrorClass: (d.terminal_error_class as string) ?? null, attemptCount: Number(d.attempt_count ?? 0), safeContext: (d.safe_context as Record<string, unknown>) ?? {}, createdAt: String(d.created_at) });

const WORKING: readonly JobStatus[] = ["claimed", "executing"];

export function createSupabaseScheduleStore(): ScheduleStore {
  return {
    async insertJob(row) { await db().from("meta_publish_job" as never).insert({ ...jobToDb(row), created_at: row.createdAtIso } as never); },
    async getJob(orgId, id) { const r = await db().from("meta_publish_job" as never).select("*").eq("org_id", orgId).eq("id", id).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async findJobByIdem(orgId, key) { const r = await db().from("meta_publish_job" as never).select("*").eq("org_id", orgId).eq("idempotency_key", key).maybeSingle(); return r.data ? jobFromDb(r.data as Row) : null; },
    async findActivePrimaryJob(orgId, operationId) {
      const r = await db().from("meta_publish_job" as never).select("*").eq("org_id", orgId).eq("publish_operation_id", operationId).eq("job_kind", "scheduled_publish").in("status", ["scheduled", "available", "claimed", "executing", "retry_wait", "blocked"] as never).maybeSingle();
      return r.data ? jobFromDb(r.data as Row) : null;
    },
    async listJobsForOperation(orgId, operationId) { const r = await db().from("meta_publish_job" as never).select("*").eq("org_id", orgId).eq("publish_operation_id", operationId); return ((r.data as Row[]) ?? []).map(jobFromDb); },
    async updateJob(row) { await db().from("meta_publish_job" as never).update(jobToDb(row) as never).eq("id", row.id); },
    async claimDueJobs(args: ClaimArgs) {
      const r = await db().rpc("meta_publish_claim_due" as never, { p_now: new Date(args.nowMs).toISOString(), p_limit: args.limit, p_per_org_max: args.perOrgMax, p_lease_owner: args.leaseOwner, p_lease_seconds: args.leaseSeconds } as never);
      return ((r.data as unknown as Row[]) ?? []).map(jobFromDb);
    },
    async findStaleJobs(nowMs, limit) {
      const r = await db().from("meta_publish_job" as never).select("*").in("status", WORKING as never).lte("lease_expires_at", new Date(nowMs).toISOString()).order("lease_expires_at", { ascending: true } as never).limit(limit);
      return ((r.data as Row[]) ?? []).map(jobFromDb);
    },
    async insertJobAttempt(row: PublishJobAttemptRow) { await db().from("meta_publish_job_attempt" as never).insert({ id: row.id, org_id: row.orgId, publish_job_id: row.publishJobId, attempt_number: row.attemptNumber, worker_id: row.workerId, lease_token: row.leaseToken, started_at: row.startedAtIso, completed_at: row.completedAtIso, outcome: row.outcome, safe_error_kind: row.safeErrorKind, retry_class: row.retryClass, next_run_after: row.nextRunAfterIso, duration_ms: row.durationMs, correlation_id: row.correlationId } as never); },
    async listJobAttempts(orgId, jobId) { const r = await db().from("meta_publish_job_attempt" as never).select("*").eq("org_id", orgId).eq("publish_job_id", jobId).order("attempt_number", { ascending: true } as never); return ((r.data as Row[]) ?? []).map((a) => ({ id: String(a.id), orgId, publishJobId: jobId, attemptNumber: Number(a.attempt_number), workerId: (a.worker_id as string) ?? null, leaseToken: (a.lease_token as string) ?? null, startedAtIso: String(a.started_at), completedAtIso: (a.completed_at as string) ?? null, outcome: (a.outcome as PublishJobAttemptRow["outcome"]) ?? null, safeErrorKind: (a.safe_error_kind as string) ?? null, retryClass: (a.retry_class as string) ?? null, nextRunAfterIso: (a.next_run_after as string) ?? null, durationMs: (a.duration_ms as number) ?? null, correlationId: (a.correlation_id as string) ?? null })); },
    async insertDeadLetter(row) { await db().from("meta_publish_dead_letter" as never).insert(dlToDb(row) as never); },
    async getDeadLetterByJob(orgId, jobId) { const r = await db().from("meta_publish_dead_letter" as never).select("*").eq("org_id", orgId).eq("publish_job_id", jobId).maybeSingle(); return r.data ? dlFromDb(r.data as Row) : null; },
    async listDeadLetters(orgId) { const r = await db().from("meta_publish_dead_letter" as never).select("*").eq("org_id", orgId).order("created_at", { ascending: false } as never); return ((r.data as Row[]) ?? []).map(dlFromDb); },
    async countInFlight(): Promise<InFlightCounts> {
      const r = await db().from("meta_publish_job" as never).select("org_id").in("status", WORKING as never);
      const rows = (r.data as Row[]) ?? [];
      const perOrg: Record<string, number> = {};
      for (const row of rows) { const o = String(row.org_id); perOrg[o] = (perOrg[o] ?? 0) + 1; }
      return { global: rows.length, perOrg };
    },
    async consumeRateBudget(orgId, scope, windowStartIso, windowSeconds, limit): Promise<RateBudgetConsumeResult> {
      const r = await db().rpc("meta_publish_consume_budget" as never, { p_org_id: orgId, p_scope: scope, p_window_start: windowStartIso, p_window_seconds: windowSeconds, p_limit: limit } as never);
      const row = ((r.data as unknown as Row[]) ?? [])[0] as { allowed?: boolean; used?: number; limit_value?: number } | undefined;
      return { allowed: Boolean(row?.allowed), used: Number(row?.used ?? 0), limit: Number(row?.limit_value ?? limit) };
    },
    async queueHealth(orgId, nowMs): Promise<QueueHealthCounts> {
      let q = db().from("meta_publish_job" as never).select("status, run_after");
      if (orgId) q = q.eq("org_id", orgId);
      const r = await q;
      const rows = (r.data as Row[]) ?? [];
      const byStatus: Record<string, number> = {};
      let oldestDueMs: number | null = null;
      for (const row of rows) {
        const s = String(row.status); byStatus[s] = (byStatus[s] ?? 0) + 1;
        if ((s === "scheduled" || s === "available" || s === "retry_wait") && row.run_after) {
          const due = Date.parse(String(row.run_after));
          if (due <= nowMs) { const age = nowMs - due; if (oldestDueMs == null || age > oldestDueMs) oldestDueMs = age; }
        }
      }
      let dl = 0;
      const dlr = orgId ? await db().from("meta_publish_dead_letter" as never).select("id").eq("org_id", orgId) : await db().from("meta_publish_dead_letter" as never).select("id");
      dl = ((dlr.data as Row[]) ?? []).length;
      return { byStatus, deadLetter: dl, oldestDueMs };
    },
  };
}
