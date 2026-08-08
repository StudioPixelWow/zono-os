// ============================================================================
// ZONO — Facebook Groups: ingest comments observed on OUR posts (server-only).
// ----------------------------------------------------------------------------
// The paired browser extension reports comments it sees on the group posts WE
// published (it already knows our post id from the prepared-post hand-off). We
// persist them into the canonical distribution_comments (idempotent on
// external_comment_id), classify each with the SAME engine the manual inbox uses
// (classifyComment), and — for high-intent, lead-worthy comments — create a
// distribution_lead linked to the comment/post/group/property. This is the real
// automated INGEST the social-lead pipeline was missing; downstream classify →
// lead → CRM-promotion → journey are the existing, unchanged paths.
//
// No FB credentials, ever — only the comment text/author the user can see, tied
// to a post we own. No parallel lead model: distribution_leads is the staging the
// existing approval-gated bridge already promotes into the CRM `leads` table.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { classifyComment } from "./comment-classifier";
import type { AuthedInstance } from "./extension-service";

/* eslint-disable @typescript-eslint/no-explicit-any */

const COMMENTS = "distribution_comments";
const LEADS = "distribution_leads";
const POSTS = "distribution_posts";
const LOG = "[fb-comment-import]";

/** One comment as observed by the extension on one of our published group posts. */
export interface ScannedComment {
  postId: string;                    // OUR distribution_posts.id (from the prepared-post hand-off)
  externalCommentId?: string | null; // Facebook comment id (idempotency key)
  authorName?: string | null;
  authorExternalId?: string | null;
  authorProfileUrl?: string | null;
  text: string;
  occurredAt?: string | null;
}

export interface CommentImportResult {
  ok: boolean;
  imported: number;   // new comments stored
  updated: number;    // duplicates (already stored) — refreshed classification
  leads: number;      // distribution_leads created from high-intent comments
  skipped: number;    // invalid / not-our-post
  total: number;
  error?: string;
}

/**
 * Persist + classify the extension's observed comments and spin high-intent ones
 * into distribution_leads. Idempotent on (org, external_comment_id).
 */
export async function importScannedComments(inst: AuthedInstance, comments: ScannedComment[]): Promise<CommentImportResult> {
  if (!isServiceRoleConfigured()) return { ok: false, imported: 0, updated: 0, leads: 0, skipped: 0, total: 0, error: "service unavailable" };
  const db: any = createServiceRoleClient();
  const now = new Date().toISOString();

  const valid = (Array.isArray(comments) ? comments : []).filter(
    (c) => c && typeof c.postId === "string" && c.postId.trim() && typeof c.text === "string" && c.text.trim(),
  );
  let imported = 0, updated = 0, leads = 0, skipped = (comments?.length ?? 0) - valid.length;

  // Cache post → {group_id, property_id, campaign_id} lookups (org-scoped: must be OUR post).
  const postCache = new Map<string, { groupId: string | null; propertyId: string | null; campaignId: string | null } | null>();
  async function resolvePost(postId: string) {
    if (postCache.has(postId)) return postCache.get(postId)!;
    const { data } = await db.from(POSTS).select("id,group_id,property_id,campaign_id").eq("id", postId).eq("org_id", inst.orgId).maybeSingle();
    const row = data as { group_id: string | null; property_id: string | null; campaign_id: string | null } | null;
    const val = row ? { groupId: row.group_id, propertyId: row.property_id, campaignId: row.campaign_id } : null;
    postCache.set(postId, val);
    return val;
  }

  for (const c of valid) {
    const post = await resolvePost(c.postId);
    if (!post) { skipped++; continue; } // not our post → ignore (never trust an arbitrary target)

    const a = classifyComment(c.text);
    const commentRow = {
      org_id: inst.orgId, post_id: c.postId, group_id: post.groupId,
      author_name: c.authorName ?? null, author_external_id: c.authorExternalId ?? null,
      author_profile_url: c.authorProfileUrl ?? null, external_comment_id: c.externalCommentId ?? null,
      comment_text: c.text, occurred_at: c.occurredAt ?? now,
      category: a.category, sentiment: a.sentiment, lead_intent_score: a.leadIntentScore,
      suggested_reply: a.suggestedReply, should_create_lead: a.shouldCreateLead, analysis_reason: a.reason,
      is_lead: a.shouldCreateLead, handled: false,
    };

    const { data: ins, error } = await db.from(COMMENTS).insert(commentRow).select("id,lead_id").maybeSingle();
    let commentId: string | null = (ins as { id: string } | null)?.id ?? null;
    let existingLeadId: string | null = (ins as { lead_id?: string | null } | null)?.lead_id ?? null;

    if (error) {
      if (!/duplicate key|23505/i.test(error.message)) { console.error(`${LOG} insert failed: ${error.message}`); skipped++; continue; }
      // Already ingested → refresh classification, keep the row (idempotent).
      const { data: existing } = await db.from(COMMENTS).update({
        category: a.category, sentiment: a.sentiment, lead_intent_score: a.leadIntentScore,
        suggested_reply: a.suggestedReply, should_create_lead: a.shouldCreateLead, analysis_reason: a.reason,
      }).eq("org_id", inst.orgId).eq("external_comment_id", c.externalCommentId).select("id,lead_id").maybeSingle();
      commentId = (existing as { id: string } | null)?.id ?? null;
      existingLeadId = (existing as { lead_id?: string | null } | null)?.lead_id ?? existingLeadId;
      updated++;
    } else {
      imported++;
    }

    // High-intent, lead-worthy → create a distribution_lead (staging) if not already linked.
    if (a.shouldCreateLead && commentId && !existingLeadId) {
      const { data: lead } = await db.from(LEADS).insert({
        org_id: inst.orgId, campaign_id: post.campaignId, post_id: c.postId, comment_id: commentId,
        group_id: post.groupId, property_id: post.propertyId, name: c.authorName ?? null,
        source: "facebook_group", intent_score: a.leadIntentScore, status: "new",
        metadata: { origin: "comment_ingest", category: a.category },
      }).select("id").maybeSingle();
      const leadId = (lead as { id: string } | null)?.id ?? null;
      if (leadId) {
        await db.from(COMMENTS).update({ lead_id: leadId }).eq("id", commentId).eq("org_id", inst.orgId);
        leads++;
      }
    }
  }

  console.log(`${LOG} org=${inst.orgId} imported=${imported} updated=${updated} leads=${leads} skipped=${skipped}`);
  return { ok: true, imported, updated, leads, skipped, total: valid.length };
}
