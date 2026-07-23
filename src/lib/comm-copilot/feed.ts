// ============================================================================
// 🤖 ZONO — Copilot ATTENTION FEED (server-only). Phase 2.
// ----------------------------------------------------------------------------
// Surfaces conversations needing attention for the Command Center / inbox to
// READ. It queries only the Copilot's own copilot_conversation_insight (RLS
// org-scoped) — it does NOT write or mutate the Command Center, and it never
// touches a transport table. Transport-agnostic (canonical refs). This is the
// integration seam: the Command Center reads this; the Copilot pushes nothing.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AttentionFlag, ConversationClassification, CopilotSentiment, RecommendedActionKind } from "./types";

export interface AttentionFeedItem {
  conversationRef: string;
  classification: ConversationClassification;
  sentiment: CopilotSentiment | null;
  recommendedAction: RecommendedActionKind | null;
  recommendedActionReason: string | null;
  waiting: boolean;
  attention: AttentionFlag[];
  analyzedAt: string | null;
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 } as const;

interface Row {
  conversation_ref: string; classification: string; sentiment: string | null;
  recommended_action: string | null; recommended_action_reason: string | null;
  waiting: boolean; attention: AttentionFlag[] | null; analyzed_at: string | null;
}

/** Attention feed for the current org (RLS-scoped). Items are conversations that
 *  are waiting or carry an attention flag, ranked by severity then recency. */
export async function getAttentionFeed(limit = 100): Promise<AttentionFeedItem[]> {
  const db = await createClient();
  const { data } = await db.from("copilot_conversation_insight" as never)
    .select("conversation_ref,classification,sentiment,recommended_action,recommended_action_reason,waiting,attention,analyzed_at")
    .order("analyzed_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, limit * 3)));           // over-fetch, then filter for attention

  const rows = (data as Row[] | null) ?? [];
  const items: AttentionFeedItem[] = rows
    .filter((r) => r.waiting || (Array.isArray(r.attention) && r.attention.length > 0))
    .map((r) => ({
      conversationRef: r.conversation_ref,
      classification: r.classification as ConversationClassification,
      sentiment: (r.sentiment as CopilotSentiment | null) ?? null,
      recommendedAction: (r.recommended_action as RecommendedActionKind | null) ?? null,
      recommendedActionReason: r.recommended_action_reason,
      waiting: r.waiting,
      attention: Array.isArray(r.attention) ? r.attention : [],
      analyzedAt: r.analyzed_at,
    }));

  const topSeverity = (it: AttentionFeedItem) => it.attention.reduce((m, f) => Math.max(m, SEVERITY_RANK[f.severity]), it.waiting ? 1 : 0);
  return items
    .sort((a, b) => topSeverity(b) - topSeverity(a) || (b.analyzedAt ?? "").localeCompare(a.analyzedAt ?? ""))
    .slice(0, limit);
}
