// ============================================================================
// ZONO — Distribution COMMENTS repository (server-only). Real, org-scoped
// Supabase queries over distribution_comments — manual comment import storage +
// classification fields. RLS enforces org isolation; org_id is stamped on writes.
// No mock comments, ever.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { DIST, type DistCommentRow } from "./db-types";

type DB = Awaited<ReturnType<typeof createClient>>;
async function scope(): Promise<{ db: DB; orgId: string; userId: string | null } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { db: await createClient(), orgId: profile.org_id, userId: profile.id ?? null };
}
const list = <T>(d: unknown): T[] => (d ?? []) as T[];

export interface CommentInput {
  postId: string | null; groupId?: string | null; authorName?: string | null;
  authorProfileUrl?: string | null; externalCommentId?: string | null; commentText: string;
  occurredAt?: string | null;
}
export interface CommentAnalysisPatch {
  category: string; sentiment: string; intent?: string | null; leadIntentScore: number;
  suggestedReply: string; shouldCreateLead: boolean; reason: string; isLead?: boolean;
}

export const distributionCommentsRepository = {
  /** Insert one comment. */
  async create(input: CommentInput): Promise<DistCommentRow | null> {
    const s = await scope(); if (!s || !input.commentText?.trim()) return null;
    const { data, error } = await s.db.from(DIST.comments as never).insert({
      org_id: s.orgId, post_id: input.postId, group_id: input.groupId ?? null,
      author_name: input.authorName ?? null, author_profile_url: input.authorProfileUrl ?? null,
      external_comment_id: input.externalCommentId ?? null, comment_text: input.commentText,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    } as never).select("*").single();
    if (error) { console.error("[distribution.comments] create:", error.message); return null; }
    return data as unknown as DistCommentRow;
  },

  /** Bulk insert (manual paste of many comments). */
  async bulkCreate(inputs: CommentInput[]): Promise<DistCommentRow[]> {
    const s = await scope(); if (!s) return [];
    const rows = inputs.filter((i) => i.commentText?.trim()).map((i) => ({
      org_id: s.orgId, post_id: i.postId, group_id: i.groupId ?? null,
      author_name: i.authorName ?? null, author_profile_url: i.authorProfileUrl ?? null,
      external_comment_id: i.externalCommentId ?? null, comment_text: i.commentText,
      occurred_at: i.occurredAt ?? new Date().toISOString(),
    }));
    if (!rows.length) return [];
    const { data, error } = await s.db.from(DIST.comments as never).insert(rows as never).select("*");
    if (error) { console.error("[distribution.comments] bulkCreate:", error.message); return []; }
    return list<DistCommentRow>(data);
  },

  async getById(id: string): Promise<DistCommentRow | null> {
    const s = await scope(); if (!s) return null;
    const { data } = await s.db.from(DIST.comments as never).select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle();
    return (data as unknown as DistCommentRow) ?? null;
  },

  async getByPost(postId: string): Promise<DistCommentRow[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(DIST.comments as never).select("*").eq("org_id", s.orgId).eq("post_id", postId).order("occurred_at", { ascending: false });
    return list<DistCommentRow>(data);
  },

  /** Comments for a campaign — resolved via the campaign's posts. */
  async getByCampaign(campaignId: string): Promise<DistCommentRow[]> {
    const s = await scope(); if (!s) return [];
    const { data: posts } = await s.db.from(DIST.posts as never).select("id").eq("org_id", s.orgId).eq("campaign_id", campaignId);
    const postIds = list<{ id: string }>(posts).map((p) => p.id);
    if (!postIds.length) return [];
    const { data } = await s.db.from(DIST.comments as never).select("*").eq("org_id", s.orgId).in("post_id", postIds).order("occurred_at", { ascending: false });
    return list<DistCommentRow>(data);
  },

  /** All recent comments for the org (the Comments & Leads board). */
  async listRecent(limit = 300): Promise<DistCommentRow[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(DIST.comments as never).select("*").eq("org_id", s.orgId).order("occurred_at", { ascending: false }).limit(limit);
    return list<DistCommentRow>(data);
  },

  /** Persist the classifier output onto a comment. */
  async updateAnalysis(id: string, a: CommentAnalysisPatch): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.comments as never).update({
      category: a.category, sentiment: a.sentiment, intent: a.intent ?? a.category,
      intent_score: a.leadIntentScore, lead_intent_score: a.leadIntentScore,
      suggested_reply: a.suggestedReply, should_create_lead: a.shouldCreateLead,
      analysis_reason: a.reason, is_lead: a.isLead ?? a.shouldCreateLead,
    } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  /** Link a comment to the lead it generated + mark handled. */
  async linkToLead(commentId: string, leadId: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.comments as never)
      .update({ lead_id: leadId, is_lead: true, handled: true } as never).eq("id", commentId).eq("org_id", s.orgId);
    return !error;
  },

  async markHandled(id: string, handled = true): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.comments as never).update({ handled } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  /** Merge a patch into the comment's metadata jsonb (read-modify-write, org-scoped). */
  async updateMetadata(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { data } = await s.db.from(DIST.comments as never).select("metadata").eq("id", id).eq("org_id", s.orgId).limit(1).maybeSingle();
    const current = ((data as { metadata?: Record<string, unknown> } | null)?.metadata) ?? {};
    const { error } = await s.db.from(DIST.comments as never)
      .update({ metadata: { ...current, ...patch } } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
};
