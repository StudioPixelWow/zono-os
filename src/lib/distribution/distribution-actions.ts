"use server";

// ============================================================================
// ZONO — Distribution posting-queue server actions (Phase 5). Thin, validated
// wrappers over the scheduler + queue services + posts repository. Every write
// goes to Supabase (org-scoped); none of these contact Facebook. Each returns
// { error?: string } (+ payload) so the UI can toast + refresh.
// ============================================================================
import { revalidatePath } from "next/cache";
import { distributionSchedulerService } from "./distribution-scheduler-service";
import { distributionQueueService } from "./distribution-queue-service";
import { distributionPostsRepository, type QueueFilters } from "./distribution-posts-repository";
import { distributionRepo } from "./repository";
import type { ScheduleConfig } from "./scheduler-planner";

const PATH = "/distribution";

export interface BuilderVariation {
  id: string; angle: string | null; hook: string | null; headline: string | null;
  wowScore: number; engagementScore: number; leadScore: number; isSelected: boolean;
}

/** Variations for a campaign — feeds the Schedule Builder's variation picker.
 *  `isSelected` marks the AI-chosen top variations (the natural default). */
export async function getCampaignVariationsAction(campaignId: string): Promise<{ variations: BuilderVariation[] }> {
  if (!campaignId) return { variations: [] };
  const rows = await distributionRepo.listVariations(campaignId);
  return {
    variations: rows.map((v) => ({
      id: v.id, angle: v.angle, hook: v.hook ?? v.headline, headline: v.headline,
      wowScore: v.wow_score, engagementScore: v.engagement_score, leadScore: v.lead_score || v.prediction_score,
      isSelected: v.is_selected,
    })),
  };
}

/** 1. Build the posting queue from selected groups × variations (smart schedule). */
export async function createPostingQueueAction(config: ScheduleConfig): Promise<{ error?: string; created?: number; skipped?: number; planned?: number }> {
  const res = await distributionSchedulerService.buildQueue(config);
  if (!res.ok) return { error: res.errors.join(" · ") || "בניית התור נכשלה", created: 0, skipped: res.skippedDuplicates, planned: res.planned };
  revalidatePath(PATH);
  return { created: res.created, skipped: res.skippedDuplicates, planned: res.planned };
}

/** Preview the schedule without writing (for the builder UI). */
export async function previewPostingQueueAction(config: ScheduleConfig): Promise<{ error?: string; planned?: { groupId: string; variationId: string; scheduledAt: string }[] }> {
  const errors = await distributionSchedulerService.validate(config);
  if (errors.length) return { error: errors.join(" · ") };
  const planned = await distributionSchedulerService.preview(config);
  return { planned };
}

/** 2. Edit a scheduled post's time. Validates a future date + lifecycle. */
export async function updatePostScheduleAction(input: { postId: string; scheduledAt: string }): Promise<{ error?: string }> {
  if (!input.postId) return { error: "פוסט חסר" };
  if (!input.scheduledAt || Number.isNaN(Date.parse(input.scheduledAt))) return { error: "תאריך לא תקין" };
  if (Date.parse(input.scheduledAt) < Date.now()) return { error: "יש לבחור תאריך עתידי" };
  const post = await distributionPostsRepository.getById(input.postId);
  if (!post) return { error: "הפוסט לא נמצא" };
  if (post.status === "published" || post.status === "publishing") return { error: "לא ניתן לשנות פוסט שכבר בפרסום/פורסם" };
  const ok = await distributionQueueService.reschedule(input.postId, input.scheduledAt);
  if (!ok) return { error: "עדכון התזמון נכשל" };
  revalidatePath(PATH);
  return {};
}

/** 3. Cancel a scheduled/queued post. */
export async function cancelScheduledPostAction(input: { postId: string }): Promise<{ error?: string }> {
  const post = await distributionPostsRepository.getById(input.postId);
  if (!post) return { error: "הפוסט לא נמצא" };
  if (post.status === "published") return { error: "לא ניתן לבטל פוסט שפורסם" };
  const ok = await distributionQueueService.cancel(input.postId);
  if (!ok) return { error: "ביטול הפוסט נכשל" };
  revalidatePath(PATH);
  return {};
}

/** 4. Reschedule (alias of edit-time, kept as a distinct action per the spec). */
export async function reschedulePostAction(input: { postId: string; scheduledAt: string }): Promise<{ error?: string }> {
  return updatePostScheduleAction(input);
}

/** 5. Read the posting queue (server action so client views can refresh on demand). */
export async function getPostingQueueAction(filters: QueueFilters = {}): Promise<{ posts: Awaited<ReturnType<typeof distributionPostsRepository.listQueue>>; counts: Awaited<ReturnType<typeof distributionPostsRepository.counts>> }> {
  const [posts, counts] = await Promise.all([
    distributionPostsRepository.listQueue(filters),
    distributionPostsRepository.counts(filters.campaignId),
  ]);
  return { posts, counts };
}
