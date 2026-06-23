// ============================================================================
// ZONO — PUBLISHING service (server-only).
// ----------------------------------------------------------------------------
// The channel-agnostic publish orchestrator. It does NOT call any external API
// itself — it resolves the right channel adapter, hands it the post content, and
// maps the adapter's outcome back onto the queue + the distribution_posts row.
// In this architecture phase every adapter returns `not_configured`, so jobs are
// parked as 'dead' with a clear reason and the post is marked failed. When real
// adapters land, only the adapters change — this orchestration stays identical.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getChannelAdapter } from "../channels/registry";
import { queueService } from "./queue-service";
import { TBL, type ChannelRow, type PublishJobRow, type PublishRequest } from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
const nowIso = () => new Date().toISOString();

interface PostRow {
  id: string; org_id: string; post_title: string | null; post_text: string | null;
  hashtags: string[] | null; cta: string | null; image_url: string | null; metadata: Record<string, unknown> | null;
}

export interface ProcessResult {
  jobId: string;
  outcome: "succeeded" | "rescheduled" | "retrying" | "dead";
  message: string;
}

export const publishingService = {
  /** Process ONE claimed job end-to-end: load post + channel, run the adapter,
   *  and reconcile the queue + post status from the adapter outcome. */
  async processJob(job: PublishJobRow, db?: DB): Promise<ProcessResult> {
    const sb = db ?? (await createClient());
    await queueService.markRunning(job.id, job.attempts, sb);

    if (!job.post_id) {
      await queueService.fail(job, "job has no post_id", false, sb);
      return { jobId: job.id, outcome: "dead", message: "אין פוסט מקושר" };
    }
    if (!job.channel_id) {
      await queueService.fail(job, "job has no channel", false, sb);
      return { jobId: job.id, outcome: "dead", message: "אין ערוץ מקושר" };
    }

    // Load the post + channel within org scope (RLS enforces isolation anyway).
    const [{ data: postData }, { data: chanData }] = await Promise.all([
      sb.from(TBL.posts as never).select("id, org_id, post_title, post_text, hashtags, cta, image_url, metadata").eq("id", job.post_id).maybeSingle(),
      sb.from(TBL.channels as never).select("*").eq("id", job.channel_id).maybeSingle(),
    ]);
    const post = postData as unknown as PostRow | null;
    const channel = chanData as unknown as ChannelRow | null;
    if (!post) { await queueService.fail(job, "post not found", false, sb); return { jobId: job.id, outcome: "dead", message: "הפוסט לא נמצא" }; }
    if (!channel) { await queueService.fail(job, "channel not found", false, sb); return { jobId: job.id, outcome: "dead", message: "הערוץ לא נמצא" }; }

    const adapter = getChannelAdapter(job.channel_kind);
    if (!adapter) { await queueService.fail(job, `no adapter for ${job.channel_kind}`, false, sb); return { jobId: job.id, outcome: "dead", message: "אין מתאם לערוץ" }; }

    const validationError = adapter.validate(channel);
    if (validationError) {
      await markPost(sb, post.id, "failed", { failure_reason: validationError });
      await queueService.fail(job, validationError, false, sb);
      return { jobId: job.id, outcome: "dead", message: validationError };
    }

    const req: PublishRequest = {
      channel, postId: post.id, title: post.post_title, body: post.post_text ?? "",
      hashtags: post.hashtags ?? [], cta: post.cta, imageUrl: post.image_url,
      context: (post.metadata ?? {}) as Record<string, unknown>,
    };

    let outcome: Awaited<ReturnType<typeof adapter.publish>>;
    try {
      outcome = await adapter.publish(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "adapter threw";
      const status = await queueService.fail(job, msg, true, sb);
      return { jobId: job.id, outcome: status === "dead" ? "dead" : "retrying", message: msg };
    }

    switch (outcome.status) {
      case "published": {
        await markPost(sb, post.id, "published", { published_at: nowIso(), external_post_url: outcome.externalPostUrl ?? null, failure_reason: null });
        await touchChannel(sb, channel);
        await queueService.complete(job.id, { externalPostId: outcome.externalPostId ?? null, externalPostUrl: outcome.externalPostUrl ?? null }, sb);
        return { jobId: job.id, outcome: "succeeded", message: "פורסם" };
      }
      case "rate_limited": {
        const runAfter = new Date(Date.now() + outcome.retryAfterMs).toISOString();
        await queueService.requeue(job.id, runAfter, outcome.message, sb);
        return { jobId: job.id, outcome: "rescheduled", message: outcome.message };
      }
      case "not_configured": {
        // Architecture phase: no live integration → park as dead with the reason.
        await markPost(sb, post.id, "failed", { failure_reason: outcome.message });
        await queueService.fail(job, outcome.message, false, sb);
        return { jobId: job.id, outcome: "dead", message: outcome.message };
      }
      case "error":
      default: {
        const retryable = outcome.status === "error" ? outcome.retryable : false;
        if (!retryable) await markPost(sb, post.id, "failed", { failure_reason: outcome.message });
        const status = await queueService.fail(job, outcome.message, retryable, sb);
        return { jobId: job.id, outcome: status === "dead" ? "dead" : "retrying", message: outcome.message };
      }
    }
  },

  /** Convenience: claim + process a batch in one call (a worker tick). */
  async runWorkerTick(orgId: string, workerId: string, batch = 5, db?: DB): Promise<ProcessResult[]> {
    const sb = db ?? (await createClient());
    await queueService.recoverStaleLeases(orgId, sb);
    const jobs = await queueService.claimBatch(orgId, workerId, batch, undefined, sb);
    const results: ProcessResult[] = [];
    for (const job of jobs) results.push(await this.processJob(job, sb));
    return results;
  },
};

async function markPost(sb: DB, postId: string, status: string, patch: Record<string, unknown>): Promise<void> {
  await sb.from(TBL.posts as never).update({ status, ...patch } as never).eq("id", postId);
}
async function touchChannel(sb: DB, channel: ChannelRow): Promise<void> {
  await sb.from(TBL.channels as never)
    .update({ last_published_at: nowIso(), posts_today: (channel.posts_today ?? 0) + 1, last_error: null } as never)
    .eq("id", channel.id);
}
