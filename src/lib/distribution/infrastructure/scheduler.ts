// ============================================================================
// ZONO — SCHEDULER (server-only).
// ----------------------------------------------------------------------------
// Bridges PLANS (distribution_schedules / scheduled posts) to the WORK QUEUE.
// On each tick it finds due schedule slots, enqueues a publish job for each, and
// advances the slot (handling daily/weekly recurrence by creating the next slot).
// The scheduler decides WHEN; the queue + publishing service decide HOW. A cron
// route or scheduled task calls `tick(orgId)` on an interval.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { queueService } from "./queue-service";
import { TBL, type ChannelKind } from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
const nowIso = () => new Date().toISOString();

interface ScheduleRow {
  id: string; org_id: string; campaign_id: string | null; post_id: string | null;
  group_id: string | null; scheduled_for: string; recurrence: "none" | "daily" | "weekly"; status: string;
}
interface PostChannelRow { id: string; channel_kind?: ChannelKind | null; channel_id?: string | null; platform?: string | null; priority_score?: number | null }

export interface SchedulerTickResult {
  due: number; enqueued: number; deduped: number; skipped: number; recurred: number;
}

export const scheduler = {
  /** One scheduler pass for an org. Idempotent per slot via the job idempotency
   *  key (schedule:<id>), so re-running the tick won't double-enqueue. */
  async tick(orgId: string, db?: DB): Promise<SchedulerTickResult> {
    const sb = db ?? (await createClient());
    const res: SchedulerTickResult = { due: 0, enqueued: 0, deduped: 0, skipped: 0, recurred: 0 };

    const { data } = await sb.from(TBL.schedules as never)
      .select("id, org_id, campaign_id, post_id, group_id, scheduled_for, recurrence, status")
      .eq("org_id", orgId).eq("status", "planned").lte("scheduled_for", nowIso())
      .order("scheduled_for", { ascending: true }).limit(100);
    const slots = (data ?? []) as unknown as ScheduleRow[];
    res.due = slots.length;

    for (const slot of slots) {
      if (!slot.post_id) { await this.markSlot(sb, slot.id, "skipped"); res.skipped++; continue; }

      // Resolve the channel for this post (kind + id). Posts carry platform/kind;
      // channel resolution is best-effort and tolerant of missing channel rows.
      const { data: postRow } = await sb.from(TBL.posts as never)
        .select("id, platform, priority_score, metadata").eq("id", slot.post_id).maybeSingle();
      const post = postRow as unknown as (PostChannelRow & { metadata?: Record<string, unknown> }) | null;
      const channelKind = (post?.metadata?.channel_kind as ChannelKind) ?? "facebook_group";
      const channelId = (post?.metadata?.channel_id as string) ?? null;

      const enq = await queueService.enqueue({
        orgId, postId: slot.post_id, channelId, channelKind,
        campaignId: slot.campaign_id, scheduleId: slot.id,
        priority: post?.priority_score ?? 0,
        idempotencyKey: `schedule:${slot.id}`,
        metadata: { source: "scheduler", group_id: slot.group_id },
      }, sb);

      if (!enq) { res.skipped++; continue; }
      if (enq.deduped) res.deduped++; else res.enqueued++;
      await this.markSlot(sb, slot.id, "queued");

      // Recurrence → materialize the next slot.
      const next = nextOccurrence(slot.scheduled_for, slot.recurrence);
      if (next) {
        await sb.from(TBL.schedules as never).insert({
          org_id: orgId, campaign_id: slot.campaign_id, post_id: slot.post_id, group_id: slot.group_id,
          scheduled_for: next, recurrence: slot.recurrence, status: "planned",
        } as never);
        res.recurred++;
      }
    }
    return res;
  },

  async markSlot(sb: DB, id: string, status: string): Promise<void> {
    await sb.from(TBL.schedules as never).update({ status } as never).eq("id", id);
  },

  /** Create a one-off or recurring schedule slot for a post. */
  async schedulePost(params: { orgId: string; postId: string; campaignId?: string | null; groupId?: string | null; scheduledFor: string; recurrence?: "none" | "daily" | "weekly"; createdBy?: string | null }, db?: DB): Promise<string | null> {
    const sb = db ?? (await createClient());
    const { data, error } = await sb.from(TBL.schedules as never).insert({
      org_id: params.orgId, post_id: params.postId, campaign_id: params.campaignId ?? null,
      group_id: params.groupId ?? null, scheduled_for: params.scheduledFor,
      recurrence: params.recurrence ?? "none", status: "planned", created_by: params.createdBy ?? null,
    } as never).select("id").single();
    if (error) { console.error("[distribution.scheduler] schedulePost failed:", error.message); return null; }
    return (data as { id: string }).id;
  },
};

/** Compute the next occurrence ISO for a recurrence, or null for one-offs. */
function nextOccurrence(fromIso: string, recurrence: "none" | "daily" | "weekly"): string | null {
  if (recurrence === "none") return null;
  const base = new Date(fromIso);
  const addDays = recurrence === "daily" ? 1 : 7;
  base.setDate(base.getDate() + addDays);
  return base.toISOString();
}
