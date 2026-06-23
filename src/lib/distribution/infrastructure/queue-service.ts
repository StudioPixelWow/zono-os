// ============================================================================
// ZONO — Distribution QUEUE service (server-only).
// ----------------------------------------------------------------------------
// A durable, leased work queue over distribution_publish_jobs. Producers enqueue
// publish jobs (idempotently); a worker fleet claims a batch under a lease,
// processes it, and reports success/failure with exponential back-off. Stale
// leases (crashed workers) are recovered. No external calls happen here — this
// is pure queue mechanics that any number of workers can run safely.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  TBL, DEFAULT_LEASE_MS, BACKOFF_BASE_MS,
  type ChannelKind, type PublishJobRow, type PublishJobStatus,
} from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
const nowIso = () => new Date().toISOString();
const plusMs = (ms: number) => new Date(Date.now() + ms).toISOString();

export interface EnqueueParams {
  orgId: string;
  postId: string;
  channelId: string | null;
  channelKind: ChannelKind;
  campaignId?: string | null;
  scheduleId?: string | null;
  priority?: number;       // higher = sooner
  runAfter?: string | null; // ISO; null → now
  maxAttempts?: number;
  idempotencyKey?: string | null; // dedupe live jobs per org
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

export const queueService = {
  /** Enqueue a publish job. Idempotent: a duplicate idempotency_key returns the
   *  existing live job instead of creating a second one. */
  async enqueue(params: EnqueueParams, db?: DB): Promise<{ id: string; deduped: boolean } | null> {
    const sb = db ?? (await createClient());
    const row = {
      org_id: params.orgId, post_id: params.postId, channel_id: params.channelId,
      channel_kind: params.channelKind, campaign_id: params.campaignId ?? null,
      schedule_id: params.scheduleId ?? null, status: "queued" as PublishJobStatus,
      priority: params.priority ?? 0, run_after: params.runAfter ?? nowIso(),
      max_attempts: params.maxAttempts ?? 3, idempotency_key: params.idempotencyKey ?? null,
      created_by: params.createdBy ?? null, metadata: params.metadata ?? {},
    };
    const { data, error } = await sb.from(TBL.jobs as never).insert(row as never).select("id").single();
    if (!error && data) return { id: (data as { id: string }).id, deduped: false };
    // Unique-violation on (org_id, idempotency_key) → return the existing job.
    if (error && error.code === "23505" && params.idempotencyKey) {
      const { data: existing } = await sb.from(TBL.jobs as never)
        .select("id").eq("org_id", params.orgId).eq("idempotency_key", params.idempotencyKey)
        .limit(1).maybeSingle();
      if (existing) return { id: (existing as { id: string }).id, deduped: true };
    }
    if (error) console.error("[distribution.queue] enqueue failed:", error.message);
    return null;
  },

  /** Claim up to `batch` ready jobs under a worker lease. Each claim is a guarded
   *  conditional update (status still 'queued'), so two workers never take the
   *  same job. Returns the jobs this worker now owns. */
  async claimBatch(orgId: string, workerId: string, batch = 5, leaseMs = DEFAULT_LEASE_MS, db?: DB): Promise<PublishJobRow[]> {
    const sb = db ?? (await createClient());
    const { data: candidates } = await sb.from(TBL.jobs as never)
      .select("id").eq("org_id", orgId).eq("status", "queued").lte("run_after", nowIso())
      .order("priority", { ascending: false }).order("run_after", { ascending: true }).limit(batch);
    const ids = ((candidates ?? []) as { id: string }[]).map((c) => c.id);
    const claimed: PublishJobRow[] = [];
    for (const id of ids) {
      const { data: got } = await sb.from(TBL.jobs as never)
        .update({ status: "claimed", locked_by: workerId, locked_at: nowIso(), lease_expires_at: plusMs(leaseMs) } as never)
        .eq("id", id).eq("status", "queued")          // optimistic guard
        .select("*").maybeSingle();
      if (got) {
        // attempts is bumped when the job actually starts running (markRunning).
        claimed.push(got as unknown as PublishJobRow);
      }
    }
    return claimed;
  },

  /** Transition a claimed job to running and count the attempt. */
  async markRunning(jobId: string, attempts: number, db?: DB): Promise<void> {
    const sb = db ?? (await createClient());
    await sb.from(TBL.jobs as never).update({ status: "running", attempts: attempts + 1 } as never).eq("id", jobId);
  },

  /** Mark a job succeeded with an optional result payload. */
  async complete(jobId: string, result: Record<string, unknown>, db?: DB): Promise<void> {
    const sb = db ?? (await createClient());
    await sb.from(TBL.jobs as never)
      .update({ status: "succeeded", result, last_error: null, locked_by: null, lease_expires_at: null } as never)
      .eq("id", jobId);
  },

  /** Reschedule a job for later (e.g. rate-limited) without consuming retries. */
  async requeue(jobId: string, runAfter: string, lastError?: string, db?: DB): Promise<void> {
    const sb = db ?? (await createClient());
    await sb.from(TBL.jobs as never)
      .update({ status: "queued", run_after: runAfter, locked_by: null, locked_at: null, lease_expires_at: null, last_error: lastError ?? null } as never)
      .eq("id", jobId);
  },

  /** Report a failure. Retries with exponential back-off until max_attempts, then
   *  parks the job as 'dead'. A non-retryable failure goes straight to 'dead'. */
  async fail(job: PublishJobRow, error: string, retryable: boolean, db?: DB): Promise<PublishJobStatus> {
    const sb = db ?? (await createClient());
    const exhausted = job.attempts >= job.max_attempts;
    if (!retryable || exhausted) {
      await sb.from(TBL.jobs as never)
        .update({ status: "dead", last_error: error.slice(0, 500), locked_by: null, lease_expires_at: null } as never)
        .eq("id", job.id);
      return "dead";
    }
    const backoff = BACKOFF_BASE_MS * Math.pow(2, Math.max(0, job.attempts - 1));
    await sb.from(TBL.jobs as never)
      .update({ status: "queued", run_after: plusMs(backoff), last_error: error.slice(0, 500), locked_by: null, locked_at: null, lease_expires_at: null } as never)
      .eq("id", job.id);
    return "queued";
  },

  /** Cancel a job that has not yet succeeded. */
  async cancel(jobId: string, db?: DB): Promise<void> {
    const sb = db ?? (await createClient());
    await sb.from(TBL.jobs as never)
      .update({ status: "canceled", locked_by: null, lease_expires_at: null } as never)
      .eq("id", jobId).in("status", ["queued", "claimed", "failed"]);
  },

  /** Recover jobs whose worker lease expired (crashed / hung worker) → requeue. */
  async recoverStaleLeases(orgId: string, db?: DB): Promise<number> {
    const sb = db ?? (await createClient());
    const { data } = await sb.from(TBL.jobs as never)
      .update({ status: "queued", locked_by: null, locked_at: null, lease_expires_at: null } as never)
      .eq("org_id", orgId).in("status", ["claimed", "running"]).lt("lease_expires_at", nowIso())
      .select("id");
    return ((data ?? []) as unknown[]).length;
  },

  /** Queue depth by status — for dashboards / health checks. */
  async stats(orgId: string, db?: DB): Promise<Record<PublishJobStatus, number>> {
    const sb = db ?? (await createClient());
    const { data } = await sb.from(TBL.jobs as never).select("status").eq("org_id", orgId);
    const out = { queued: 0, claimed: 0, running: 0, succeeded: 0, failed: 0, canceled: 0, dead: 0 } as Record<PublishJobStatus, number>;
    for (const r of (data ?? []) as { status: PublishJobStatus }[]) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  },
};
