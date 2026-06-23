// ============================================================================
// ZONO — LEAD DETECTION service (server-only).
// ----------------------------------------------------------------------------
// Scans unclassified distribution_comments, applies the pure intent engine, and
// (a) writes intent/sentiment/score back onto each comment, (b) promotes high-
// intent comments into distribution_leads — idempotently (one lead per comment).
// Deterministic and free of external calls; safe to run on a schedule.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { detectIntent } from "./lead-intent";
import { TBL } from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;

interface CommentRow {
  id: string; post_id: string | null; group_id: string | null; comment_text: string | null;
  author_name: string | null; is_lead: boolean;
}

export interface DetectResult { scanned: number; classified: number; leadsCreated: number }

export const leadDetectionService = {
  /** Classify unprocessed comments and promote leads. `handled=false` rows that
   *  have not yet been scored are the work set. */
  async detectForOrg(orgId: string, db?: DB, leadThreshold = 55): Promise<DetectResult> {
    const sb = db ?? (await createClient());
    const res: DetectResult = { scanned: 0, classified: 0, leadsCreated: 0 };

    const { data } = await sb.from(TBL.comments as never)
      .select("id, post_id, group_id, comment_text, author_name, is_lead")
      .eq("org_id", orgId).eq("handled", false).limit(500);
    const comments = (data ?? []) as unknown as CommentRow[];
    res.scanned = comments.length;
    if (!comments.length) return res;

    // Which comments already produced a lead (idempotency guard).
    const ids = comments.map((c) => c.id);
    const { data: existingLeads } = await sb.from(TBL.leads as never)
      .select("comment_id").eq("org_id", orgId).in("comment_id", ids);
    const leadComment = new Set(((existingLeads ?? []) as { comment_id: string | null }[]).map((l) => l.comment_id).filter(Boolean));

    for (const c of comments) {
      const r = detectIntent(c.comment_text, leadThreshold);
      // Write classification back onto the comment; mark handled so it isn't rescanned.
      await sb.from(TBL.comments as never).update({
        intent: r.intent, intent_score: r.intentScore, sentiment: r.sentiment, is_lead: r.isLead, handled: true,
      } as never).eq("id", c.id);
      res.classified += 1;

      if (r.isLead && !leadComment.has(c.id)) {
        const { error } = await sb.from(TBL.leads as never).insert({
          org_id: orgId, post_id: c.post_id, comment_id: c.id, group_id: c.group_id,
          name: c.author_name, phone: r.phone, source: "comment",
          intent_score: r.intentScore, status: "new",
          metadata: { intent: r.intent, sentiment: r.sentiment },
        } as never);
        if (!error) res.leadsCreated += 1;
        else console.error("[distribution.leads] insert failed:", error.message);
      }
    }
    return res;
  },
};
