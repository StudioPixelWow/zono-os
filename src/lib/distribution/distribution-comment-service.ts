// ============================================================================
// ZONO — Distribution COMMENT service (server-only). Orchestrates the comment →
// classification → lead pipeline over Supabase. Manual import now; the same
// service will later be fed by the official Meta API. Classification is the
// deterministic engine in comment-classifier.ts (no fabrication). No mock data.
// ============================================================================
import "server-only";
import { distributionCommentsRepository, type CommentInput } from "./distribution-comments-repository";
import { distributionRepo } from "./repository";
import { classifyComment, isHotLead } from "./comment-classifier";
import type { DistCommentRow, DistGroupRow, DistPostRow } from "./db-types";

export interface CommentView {
  id: string; postId: string | null; groupId: string | null; groupName: string | null;
  postTitle: string | null; externalPostUrl: string | null; campaignId: string | null; propertyId: string | null;
  authorName: string | null; authorProfileUrl: string | null; externalCommentId: string | null;
  text: string; category: string | null; sentiment: string | null; leadIntentScore: number;
  suggestedReply: string | null; shouldCreateLead: boolean; reason: string | null;
  handled: boolean; isLead: boolean; leadId: string | null; occurredAt: string;
}

export interface CommentsBoard {
  comments: CommentView[];
  counts: { comments: number; hotLeads: number; leads: number; needsReply: number; ignored: number; converted: number; conversionRate: number };
}

const IGNORED = ["spam", "not_relevant", "negative", "broker_comment"];

async function postContext(): Promise<Map<string, DistPostRow>> {
  const posts = await distributionRepo.listPosts({ limit: 500 });
  return new Map(posts.map((p) => [p.id, p]));
}
async function groupContext(): Promise<Map<string, DistGroupRow>> {
  const groups = await distributionRepo.listGroups({ limit: 500 });
  return new Map(groups.map((g) => [g.id, g]));
}

function toView(c: DistCommentRow, posts: Map<string, DistPostRow>, groups: Map<string, DistGroupRow>): CommentView {
  const post = c.post_id ? posts.get(c.post_id) ?? null : null;
  const group = c.group_id ? groups.get(c.group_id) ?? null : (post?.group_id ? groups.get(post.group_id) ?? null : null);
  return {
    id: c.id, postId: c.post_id, groupId: c.group_id ?? post?.group_id ?? null,
    groupName: group?.name ?? null, postTitle: post?.post_title ?? null, externalPostUrl: post?.external_post_url ?? null,
    campaignId: post?.campaign_id ?? null, propertyId: post?.property_id ?? null,
    authorName: c.author_name, authorProfileUrl: c.author_profile_url, externalCommentId: c.external_comment_id,
    text: c.comment_text ?? "", category: c.category, sentiment: c.sentiment, leadIntentScore: c.lead_intent_score,
    suggestedReply: c.suggested_reply, shouldCreateLead: c.should_create_lead, reason: c.analysis_reason,
    handled: c.handled, isLead: c.is_lead, leadId: c.lead_id, occurredAt: c.occurred_at,
  };
}

export const distributionCommentService = {
  /** Classify a comment and persist the analysis. */
  async analyzeRow(c: DistCommentRow): Promise<void> {
    const a = classifyComment(c.comment_text);
    await distributionCommentsRepository.updateAnalysis(c.id, {
      category: a.category, sentiment: a.sentiment, leadIntentScore: a.leadIntentScore,
      suggestedReply: a.suggestedReply, shouldCreateLead: a.shouldCreateLead, reason: a.reason,
    });
  },

  /** Import one comment (create → classify → optional auto-lead). */
  async importComment(input: CommentInput, autoLead = true): Promise<CommentView | null> {
    const created = await distributionCommentsRepository.create(input);
    if (!created) return null;
    await this.analyzeRow(created);
    if (autoLead) { const a = classifyComment(created.comment_text); if (a.shouldCreateLead) await this.createLeadFromComment(created.id); }
    const fresh = await distributionCommentsRepository.getById(created.id);
    const [posts, groups] = await Promise.all([postContext(), groupContext()]);
    return fresh ? toView(fresh, posts, groups) : null;
  },

  /** Bulk import (paste many) → classify each → optional auto-lead. */
  async bulkImport(postId: string | null, groupId: string | null, items: { authorName?: string | null; text: string; commentUrl?: string | null; profileUrl?: string | null }[], autoLead = true): Promise<number> {
    const created = await distributionCommentsRepository.bulkCreate(items.map((i) => ({
      postId, groupId, authorName: i.authorName ?? null, authorProfileUrl: i.profileUrl ?? null,
      externalCommentId: i.commentUrl ?? null, commentText: i.text,
    })));
    for (const c of created) {
      await this.analyzeRow(c);
      if (autoLead) { const a = classifyComment(c.comment_text); if (a.shouldCreateLead) await this.createLeadFromComment(c.id); }
    }
    return created.length;
  },

  /** Re-run classification for one comment. */
  async analyze(commentId: string): Promise<boolean> {
    const c = await distributionCommentsRepository.getById(commentId);
    if (!c) return false;
    await this.analyzeRow(c);
    return true;
  },

  /** Create a distribution_lead from a comment + link them. */
  async createLeadFromComment(commentId: string, notes?: string): Promise<string | null> {
    const c = await distributionCommentsRepository.getById(commentId);
    if (!c) return null;
    if (c.lead_id) return c.lead_id; // already linked
    const posts = await postContext();
    const post = c.post_id ? posts.get(c.post_id) ?? null : null;
    const lead = await distributionRepo.createLead({
      name: c.author_name, source: "facebook_group_comment", campaignId: post?.campaign_id ?? null,
      postId: c.post_id, commentId: c.id, propertyId: post?.property_id ?? null,
      intentScore: c.lead_intent_score, notes: notes ?? c.comment_text ?? null,
    });
    if (!lead) return null;
    await distributionCommentsRepository.linkToLead(commentId, lead.id);
    return lead.id;
  },

  async markHandled(commentId: string, handled = true): Promise<boolean> {
    return distributionCommentsRepository.markHandled(commentId, handled);
  },

  /** The Comments & Leads board (sections derived client-side from these views). */
  async board(filters: { campaignId?: string } = {}): Promise<CommentsBoard> {
    const rows = filters.campaignId
      ? await distributionCommentsRepository.getByCampaign(filters.campaignId)
      : await distributionCommentsRepository.listRecent(300);
    const [posts, groups] = await Promise.all([postContext(), groupContext()]);
    const comments = rows.map((c) => toView(c, posts, groups));

    const hotLeads = comments.filter((c) => isHotLead({ category: c.category, leadIntentScore: c.leadIntentScore })).length;
    const leads = comments.filter((c) => c.isLead || c.leadId).length;
    const needsReply = comments.filter((c) => !c.handled && !IGNORED.includes(c.category ?? "") && (c.suggestedReply?.length ?? 0) > 0).length;
    const ignored = comments.filter((c) => IGNORED.includes(c.category ?? "")).length;
    const converted = comments.filter((c) => Boolean(c.leadId)).length;
    const conversionRate = comments.length ? Math.round((leads / comments.length) * 10000) / 100 : 0;

    return { comments, counts: { comments: comments.length, hotLeads, leads, needsReply, ignored, converted, conversionRate } };
  },
};
