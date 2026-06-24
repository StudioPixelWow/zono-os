"use server";

// ============================================================================
// ZONO — Comment & lead server actions (Phase 7). Manual comment import +
// classification + lead creation, all org-scoped via the service/repository.
// Nothing scrapes Facebook; comments are imported by the agent by hand.
// ============================================================================
import { revalidatePath } from "next/cache";
import { distributionCommentService, type CommentView, type CommentsBoard } from "./distribution-comment-service";
import { distributionRepo } from "./repository";
import type { DistLeadRow } from "./db-types";

const PATH = "/distribution";
const ok = () => { revalidatePath(PATH); return {}; };

/** 1. Import a single comment (paste). */
export async function importCommentAction(input: {
  postId: string | null; groupId?: string | null; authorName?: string; commentText: string;
  commentUrl?: string; profileUrl?: string;
}): Promise<{ error?: string; comment?: CommentView }> {
  if (!input.commentText?.trim()) return { error: "טקסט התגובה חסר" };
  const comment = await distributionCommentService.importComment({
    postId: input.postId, groupId: input.groupId ?? null, authorName: input.authorName ?? null,
    commentText: input.commentText, externalCommentId: input.commentUrl ?? null, authorProfileUrl: input.profileUrl ?? null,
  });
  if (!comment) return { error: "ייבוא התגובה נכשל" };
  revalidatePath(PATH);
  return { comment };
}

/** 2. Bulk import comments (paste many, one per line or structured). */
export async function bulkImportCommentsAction(input: {
  postId: string | null; groupId?: string | null;
  items: { authorName?: string | null; text: string; commentUrl?: string | null; profileUrl?: string | null }[];
}): Promise<{ error?: string; imported?: number }> {
  const items = (input.items ?? []).filter((i) => i.text?.trim());
  if (!items.length) return { error: "אין תגובות לייבוא" };
  const imported = await distributionCommentService.bulkImport(input.postId, input.groupId ?? null, items);
  revalidatePath(PATH);
  return { imported };
}

/** 3. Re-run classification for a comment. */
export async function analyzeCommentAction(input: { commentId: string }): Promise<{ error?: string }> {
  const done = await distributionCommentService.analyze(input.commentId);
  return done ? ok() : { error: "ניתוח התגובה נכשל" };
}

/** 4. Create a lead from a comment. */
export async function createLeadFromCommentAction(input: { commentId: string; notes?: string }): Promise<{ error?: string; leadId?: string }> {
  const leadId = await distributionCommentService.createLeadFromComment(input.commentId, input.notes);
  if (!leadId) return { error: "יצירת הליד נכשלה" };
  revalidatePath(PATH);
  return { leadId };
}

/** 5. Mark a comment as handled (or unhandled). */
export async function markCommentHandledAction(input: { commentId: string; handled?: boolean }): Promise<{ error?: string }> {
  const done = await distributionCommentService.markHandled(input.commentId, input.handled ?? true);
  return done ? ok() : { error: "עדכון התגובה נכשל" };
}

/** 6. Read the comments board (optionally for one campaign). */
export async function getCampaignCommentsAction(input: { campaignId?: string } = {}): Promise<{ board: CommentsBoard }> {
  return { board: await distributionCommentService.board(input.campaignId ? { campaignId: input.campaignId } : {}) };
}

/** 7. Read the distribution leads list. */
export async function getDistributionLeadsAction(input: { status?: DistLeadRow["status"] } = {}): Promise<{ leads: DistLeadRow[] }> {
  return { leads: await distributionRepo.listLeads(input.status ? { status: input.status } : {}) };
}
