// ============================================================================
// 🤖 ZONO — Copilot PERSISTENCE (server-only). Phase 1.
// ----------------------------------------------------------------------------
// Writes ONLY copilot_conversation_insight + communication_summaries. It never
// touches canonical conversation tables. Freshness: it reads the prior
// deterministic hash and SKIPS the write (and any future LLM pass) when the
// deterministic output is unchanged. Org-scoped via the service-role client with
// an explicit org_id (the summary-select RLS is org-only; writes are trusted).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { conversationRefToUuid } from "./ids";
import { buildInsightRow, buildSummaryRow, buildReplyRows, buildMilestoneRows, deterministicHash, hashExtraOf, replyFreshnessHash, timelineFreshnessHash, shouldRegenerate } from "./record";
import type { CopilotPipelineResult } from "./pipeline";

export interface PersistResult { changed: boolean; insightChanged: boolean; repliesChanged: boolean; timelineChanged: boolean; classification: string }

/** Persist the insight + summary + reply suggestions + timeline milestones for a
 *  conversation, with an INDEPENDENT freshness gate per sink. */
export async function persistInsight(
  orgId: string, result: CopilotPipelineResult, nowIso: string, force: boolean,
): Promise<PersistResult> {
  const db = createServiceRoleClient();
  const { classification, summary } = result;
  const ref = result.analysis.ref;
  const nextHash = deterministicHash(classification, summary, hashExtraOf(result));
  const nextReply = replyFreshnessHash(result);
  const nextTimeline = timelineFreshnessHash(result);

  // Read prior hashes (org-scoped) to decide freshness per sink.
  const prev = await db.from("copilot_conversation_insight" as never)
    .select("explainability").eq("org_id", orgId).eq("conversation_ref", ref).maybeSingle();
  const ex = (prev.data as { explainability?: { deterministicHash?: string; replyHash?: string; timelineHash?: string } } | null)?.explainability;
  const insightChanged = shouldRegenerate(ex?.deterministicHash ?? null, nextHash, force);
  const repliesChanged = shouldRegenerate(ex?.replyHash ?? null, nextReply, force);
  const timelineChanged = shouldRegenerate(ex?.timelineHash ?? null, nextTimeline, force);

  if (!insightChanged && !repliesChanged && !timelineChanged) {
    return { changed: false, insightChanged: false, repliesChanged: false, timelineChanged: false, classification: classification.classification };
  }

  // Insight + summary — rewrite when anything changed (so stored hashes stay current).
  await db.from("copilot_conversation_insight" as never)
    .upsert(buildInsightRow(orgId, result, nowIso) as never, { onConflict: "org_id,conversation_ref" });
  const entityId = conversationRefToUuid(ref);
  await db.from("communication_summaries" as never).delete()
    .eq("org_id", orgId).eq("entity_type", "conversation").eq("entity_id", entityId).eq("scope", "conversation");
  await db.from("communication_summaries" as never).insert(buildSummaryRow(orgId, summary, ref, nowIso) as never);

  // Reply suggestions — replace the set only when the reply hash changed (Phase 3).
  if (repliesChanged) {
    await db.from("copilot_reply_suggestion" as never).delete().eq("org_id", orgId).eq("conversation_ref", ref);
    if (result.replies.length) await db.from("copilot_reply_suggestion" as never).insert(buildReplyRows(orgId, ref, result) as never);
  }

  // Timeline milestones — replace the set only when the milestone set changed.
  if (timelineChanged) {
    await db.from("copilot_timeline_milestone" as never).delete().eq("org_id", orgId).eq("conversation_ref", ref);
    if (result.milestones.length) await db.from("copilot_timeline_milestone" as never).insert(buildMilestoneRows(orgId, ref, result) as never);
  }

  await logAudit({
    action: "copilot.insight_generated", category: "recommendation", entityType: "conversation", entityId: ref,
    summary: `Copilot insight: ${classification.classification}`, metadata: { classification: classification.classification, replies: repliesChanged, timeline: timelineChanged },
  });

  return { changed: true, insightChanged, repliesChanged, timelineChanged, classification: classification.classification };
}
