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
import { buildInsightRow, buildSummaryRow, deterministicHash, shouldRegenerate } from "./record";
import type { ClassificationArtifact, SummaryArtifact } from "./types";
import type { ConversationAnalysis } from "./analyze";

export interface PersistResult { changed: boolean; classification: string }

/** Persist the insight + summary for a conversation, hash-gated. */
export async function persistInsight(
  orgId: string, analysis: ConversationAnalysis, classification: ClassificationArtifact, summary: SummaryArtifact,
  nowIso: string, force: boolean,
): Promise<PersistResult> {
  const db = createServiceRoleClient();
  const ref = analysis.ref;
  const nextHash = deterministicHash(classification, summary);

  // Read the prior hash (org-scoped) to decide freshness.
  const prev = await db.from("copilot_conversation_insight" as never)
    .select("explainability").eq("org_id", orgId).eq("conversation_ref", ref).maybeSingle();
  const prevHash = ((prev.data as { explainability?: { deterministicHash?: string } } | null)?.explainability?.deterministicHash) ?? null;

  if (!shouldRegenerate(prevHash, nextHash, force)) {
    return { changed: false, classification: classification.classification };
  }

  // Upsert the insight (one current snapshot per conversation).
  await db.from("copilot_conversation_insight" as never)
    .upsert(buildInsightRow(orgId, analysis, classification, summary, nowIso) as never, { onConflict: "org_id,conversation_ref" });

  // Replace the conversation-scoped summary (delete prior, insert fresh) —
  // never touches relationship-scoped summaries written by other code.
  const entityId = conversationRefToUuid(ref);
  await db.from("communication_summaries" as never).delete()
    .eq("org_id", orgId).eq("entity_type", "conversation").eq("entity_id", entityId).eq("scope", "conversation");
  await db.from("communication_summaries" as never).insert(buildSummaryRow(orgId, summary, ref, nowIso) as never);

  await logAudit({
    action: "copilot.insight_generated", category: "recommendation", entityType: "conversation", entityId: ref,
    summary: `Copilot insight: ${classification.classification}`, metadata: { classification: classification.classification }, // no message bodies
  });

  return { changed: true, classification: classification.classification };
}
