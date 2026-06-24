// ============================================================================
// ZONO — Distribution QUEUE service (server-only). The status state-machine for
// posting-queue records (distribution_posts) + analytics-prep counters. This is
// the INTERNAL queue: it transitions posts through the lifecycle. It does NOT
// call Facebook — actual publishing is a future integration. Every transition
// is org-scoped through the posts repository.
//
//   draft → scheduled → queued → publishing → published
//                                           ↘ failed
//   (scheduled|queued) → cancelled
// ============================================================================
import "server-only";
import { distributionPostsRepository, type QueueCounts } from "./distribution-posts-repository";
import type { PostingStatus } from "./scheduler-planner";

const ALLOWED: Record<PostingStatus, PostingStatus[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["queued", "cancelled", "draft"],
  queued: ["publishing", "cancelled", "scheduled"],
  publishing: ["published", "failed"],
  published: [],
  failed: ["scheduled", "queued"], // retry path
  cancelled: ["scheduled"],         // restore
};

export const distributionQueueService = {
  /** Validate a transition against the lifecycle. */
  canTransition(from: PostingStatus, to: PostingStatus): boolean {
    return ALLOWED[from]?.includes(to) ?? false;
  },

  /** Move a post into the work queue (ready for a future publisher to pick up). */
  async markQueued(postId: string): Promise<boolean> {
    return distributionPostsRepository.updateStatus(postId, "queued");
  },
  /** Mark a post as currently publishing (a publisher claimed it). */
  async markPublishing(postId: string): Promise<boolean> {
    return distributionPostsRepository.updateStatus(postId, "publishing");
  },
  /** Mark a post published with its external URL. */
  async markPublished(postId: string, externalPostUrl?: string | null): Promise<boolean> {
    return distributionPostsRepository.updateStatus(postId, "published", {
      publishedAt: new Date().toISOString(), externalPostUrl: externalPostUrl ?? null, failedReason: null,
    });
  },
  /** Mark a post failed with a reason. */
  async markFailed(postId: string, reason: string): Promise<boolean> {
    return distributionPostsRepository.updateStatus(postId, "failed", { failedReason: reason.slice(0, 500) });
  },
  /** Cancel a scheduled/queued post. */
  async cancel(postId: string): Promise<boolean> {
    return distributionPostsRepository.updateStatus(postId, "cancelled");
  },
  /** Reschedule a post to a new future time (returns to 'scheduled'). */
  async reschedule(postId: string, scheduledAt: string): Promise<boolean> {
    return distributionPostsRepository.updateSchedule(postId, scheduledAt);
  },

  /** ANALYTICS-PREP hook: counters consumed by the analytics layer + UI. */
  async analyticsSnapshot(campaignId?: string): Promise<QueueCounts> {
    return distributionPostsRepository.counts(campaignId);
  },
};
