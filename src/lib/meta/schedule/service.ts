// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SCHEDULE SERVICE (server wiring). Phase 3B.
// ----------------------------------------------------------------------------
// Wires the pure scheduling engine to production adapters: the Supabase schedule
// store (atomic SKIP LOCKED claim + atomic budget), and a publish seam that
// REUSES the Phase-3A executor (executeOperationForSchedule / automaticRetryTarget
// — never a second publishing engine). Enforces the publish-permission gate
// (approval permission alone does NOT grant scheduling), timezone-safe scheduling,
// and durable rate budgets. The dispatcher/worker/recover entrypoints are driven
// only by the protected internal routes (Bearer CRON_SECRET). Returns safe DTOs.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { canPublish } from "../publish/service";
import { executeOperationForSchedule, automaticRetryTarget, readTargetStatus, setOperationStatusRaw, markTargetManualReviewRaw, createScheduledOperation } from "../publish/service";
import { createSupabaseScheduleStore } from "./store";
import type { SchedulePorts, PublishExecutorSeam } from "./ports";
import * as engine from "./engine";
import { validateScheduleTime, type LeadTimePolicy } from "./timezone";
import { computeQueueHealth } from "./queue-health";
import { toScheduledJobDTO, toDeadLetterDTO, type ScheduledJobDTO, type DeadLetterDTO } from "./read";
import { windowStartMs } from "./budget";
import type { QueueHealthSnapshot } from "./queue-health";

/** Scheduling permission == publish permission (an approver alone is not enough). */
export function canSchedule(role: string): boolean { return canPublish(role); }

/** Bounded lead-time policy: at least 2 minutes out, at most 180 days. */
export const LEAD_TIME_POLICY: LeadTimePolicy = { minLeadMs: 2 * 60_000, maxLeadMs: 180 * 24 * 60 * 60_000 };

/** Durable per-org scheduled-dispatch budget (fixed window). Bounded constants. */
const DISPATCH_BUDGET = { scope: "meta_publish_dispatch", windowSeconds: 60, limit: 30 };

function publishSeam(): PublishExecutorSeam {
  return {
    executeOperation: (orgId, operationId) => executeOperationForSchedule(orgId, operationId),
    retryTargetAutomatic: (orgId, targetId) => automaticRetryTarget(orgId, targetId),
    readTarget: (orgId, targetId) => readTargetStatus(orgId, targetId),
    setOperationStatus: (orgId, operationId, status) => setOperationStatusRaw(orgId, operationId, status),
    markTargetManualReview: (orgId, targetId) => markTargetManualReviewRaw(orgId, targetId),
  };
}

export function buildSchedulePorts(): SchedulePorts {
  return {
    store: createSupabaseScheduleStore(),
    publish: publishSeam(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_publish_job", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
    random: { fraction: () => Math.random() },
  };
}

// ── User-facing scheduling ─────────────────────────────────────────────────────
export type ScheduleResult = { ok: true; job: ScheduledJobDTO } | { ok: false; error: string; blocked?: unknown };

/** Schedule an approved draft version to publish at a future local time. */
export async function schedulePublish(orgId: string, userId: string, role: string, draftId: string, targetIds: readonly string[], localDateTime: string, timezone: string): Promise<ScheduleResult> {
  if (!canSchedule(role)) return { ok: false, error: "forbidden" };
  const time = validateScheduleTime(localDateTime, timezone, Date.now(), LEAD_TIME_POLICY);
  if (!time.ok) return { ok: false, error: `invalid_time:${time.reason}` };

  const opRes = await createScheduledOperation(orgId, userId, role, draftId, targetIds, { scheduledForIso: time.instant.utcIso, timezone, localDateTime: time.instant.localDateTime, offsetMinutes: time.instant.offsetMinutes });
  if (!opRes.ok) return { ok: false, error: opRes.error, blocked: opRes.blocked };

  const ports = buildSchedulePorts();
  const idempotencyKey = crypto.createHash("sha256").update(`${orgId}|${opRes.operationId}|sched|${time.instant.utcIso}`).digest("hex");
  const sched = await engine.scheduleOperation(ports, { orgId, operationId: opRes.operationId, instant: time.instant, correlationId: opRes.correlationId, idempotencyKey });
  // Bind the operation to its execution job.
  await createServiceRoleClient().from("meta_publish_operation" as never).update({ execution_job_id: sched.job.id, updated_at: new Date().toISOString() } as never).eq("org_id", orgId).eq("id", opRes.operationId);
  return { ok: true, job: toScheduledJobDTO(sched.job) };
}

/** Reschedule a not-yet-claimed scheduled operation. */
export async function reschedule(orgId: string, role: string, operationId: string, localDateTime: string, timezone: string): Promise<ScheduleResult> {
  if (!canSchedule(role)) return { ok: false, error: "forbidden" };
  const time = validateScheduleTime(localDateTime, timezone, Date.now(), LEAD_TIME_POLICY);
  if (!time.ok) return { ok: false, error: `invalid_time:${time.reason}` };
  const ports = buildSchedulePorts();
  const r = await engine.rescheduleOperation(ports, orgId, operationId, time.instant);
  if (!r.ok || !r.job) return { ok: false, error: r.error ?? "reschedule_failed" };
  await createServiceRoleClient().from("meta_publish_operation" as never).update({ scheduled_for: time.instant.utcIso, scheduled_timezone: timezone, scheduled_local_datetime: time.instant.localDateTime, scheduled_offset_minutes: time.instant.offsetMinutes, rescheduled_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("org_id", orgId).eq("id", operationId);
  return { ok: true, job: toScheduledJobDTO(r.job) };
}

/** Cancel a scheduled operation before it executes. */
export async function cancelScheduled(orgId: string, role: string, operationId: string): Promise<{ ok: boolean; error?: string }> {
  if (!canSchedule(role)) return { ok: false, error: "forbidden" };
  const r = await engine.cancelScheduledOperation(buildSchedulePorts(), orgId, operationId);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "cancel_failed" };
}

// ── Internal worker entrypoints (driven ONLY by protected internal routes) ─────
export interface TickResult { claimed: number; executed: number; succeeded: number; failed: number; retriesScheduled: number; deadLettered: number; blocked: number }

/**
 * One dispatch+work tick: consult the durable dispatch budget, atomically claim a
 * fair bounded batch of due jobs, and drive each through the Phase-3A executor.
 */
export async function runDispatchTick(opts?: { limit?: number; perOrgMax?: number }): Promise<TickResult> {
  const ports = buildSchedulePorts();
  const leaseOwner = `worker:${crypto.randomUUID()}`;
  const claimed = await engine.dispatchDue(ports, { leaseOwner, limit: opts?.limit, perOrgMax: opts?.perOrgMax });
  const res: TickResult = { claimed: claimed.length, executed: 0, succeeded: 0, failed: 0, retriesScheduled: 0, deadLettered: 0, blocked: 0 };
  for (const job of claimed) {
    // Durable per-org budget gate (fixed window) before running.
    const windowStartIso = new Date(windowStartMs(Date.now(), DISPATCH_BUDGET.windowSeconds)).toISOString();
    const budget = await ports.store.consumeRateBudget(job.orgId, DISPATCH_BUDGET.scope, windowStartIso, DISPATCH_BUDGET.windowSeconds, DISPATCH_BUDGET.limit);
    if (!budget.allowed) {
      // Over budget this window → release the claim back to available for the next tick.
      await ports.store.updateJob({ ...job, status: "available", leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, revision: job.revision + 1 });
      continue;
    }
    const out = await engine.workJob(ports, job, { workerId: leaseOwner });
    res.executed++;
    if (out.outcome === "succeeded") res.succeeded++;
    else if (out.outcome === "blocked") res.blocked++;
    else if (out.outcome === "failed") res.failed++;
    // A scheduled_publish job spawns per-target retry jobs and/or per-target
    // dead-letters; count those from its emitted events + spawned children.
    res.retriesScheduled += out.spawnedRetryJobIds.length + (out.outcome === "retry_scheduled" ? 1 : 0);
    res.deadLettered += out.events.filter((e) => e.event === "meta.post.dead_lettered").length;
  }
  return res;
}

/** Recovery sweep: reclassify abandoned jobs (stale leases). */
export async function runRecoveryTick(opts?: { limit?: number; maxRequeues?: number }): Promise<{ recovered: number; requeued: number; deadLettered: number }> {
  const ports = buildSchedulePorts();
  const r = await engine.recoverAbandoned(ports, { limit: opts?.limit, maxRequeues: opts?.maxRequeues });
  return { recovered: r.recovered, requeued: r.requeued, deadLettered: r.deadLettered };
}

/** Worker heartbeat for a long-running job (extends the durable lease). */
export async function heartbeatJob(orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason?: string }> {
  const r = await engine.heartbeat(buildSchedulePorts(), orgId, jobId, owner, token);
  return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? "heartbeat_failed" };
}

// ── Read entrypoints ───────────────────────────────────────────────────────────
export async function listScheduledOperations(orgId: string): Promise<readonly ScheduledJobDTO[]> {
  const store = createSupabaseScheduleStore();
  const db = createServiceRoleClient();
  const r = await db.from("meta_publish_job" as never).select("*").eq("org_id", orgId).order("run_after", { ascending: true } as never);
  void store;
  const rows = (r.data as Record<string, unknown>[]) ?? [];
  // Map through the store's row mapper by reloading via getJob would be N calls;
  // instead reuse the DTO mapper on a light re-read is unnecessary — map inline.
  return rows.map((d) => toScheduledJobDTO({
    id: String(d.id), orgId: String(d.org_id), publishOperationId: String(d.publish_operation_id), publishTargetId: (d.publish_target_id as string) ?? null,
    jobKind: d.job_kind as never, status: d.status as never,
    scheduledForIso: String(d.scheduled_for), scheduledTimezone: (d.scheduled_timezone as string) ?? null, scheduledLocalDatetime: (d.scheduled_local_datetime as string) ?? null, scheduledOffsetMinutes: (d.scheduled_offset_minutes as number) ?? null,
    runAfterIso: String(d.run_after), priority: Number(d.priority ?? 100),
    attemptCount: Number(d.attempt_count ?? 0), maxAttempts: Number(d.max_attempts ?? 5), retryBudget: Number(d.retry_budget ?? 5), retryBudgetRemaining: Number(d.retry_budget_remaining ?? 0), requeueCount: Number(d.requeue_count ?? 0),
    leaseOwner: null, leaseToken: null, leaseExpiresAtIso: null, claimedAtIso: null, heartbeatAtIso: null,
    lastErrorKind: (d.last_error_kind as string) ?? null, lastErrorClass: (d.last_error_class as string) ?? null, safeLastError: (d.safe_last_error as string) ?? null, recoveryDisposition: null,
    correlationId: String(d.correlation_id ?? ""), idempotencyKey: "", revision: Number(d.revision ?? 0),
    createdAtIso: String(d.created_at ?? new Date().toISOString()), completedAtIso: (d.completed_at as string) ?? null,
  }));
}

export async function listDeadLetters(orgId: string): Promise<readonly DeadLetterDTO[]> {
  return (await createSupabaseScheduleStore().listDeadLetters(orgId)).map(toDeadLetterDTO);
}

export async function getQueueHealth(orgId: string | null): Promise<QueueHealthSnapshot> {
  const counts = await createSupabaseScheduleStore().queueHealth(orgId, Date.now());
  return computeQueueHealth(counts);
}
