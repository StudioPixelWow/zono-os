// ============================================================================
// 🤖 ZONO — Copilot RECORD builders + freshness (pure). Phase 1.
// ----------------------------------------------------------------------------
// Pure functions that turn analysis+classification+summary into the exact rows
// persisted to copilot_conversation_insight and communication_summaries, plus
// the deterministic-hash freshness decision. No I/O — so the persistence shape
// and the "skip when unchanged" rule are both unit-testable.
// ============================================================================
import crypto from "node:crypto";
import { conversationRefToUuid } from "./ids";
import type { ClassificationArtifact, SummaryArtifact } from "./types";
import type { ConversationAnalysis } from "./analyze";

/** Stable hash of the DETERMINISTIC output (excludes timestamps). Drives
 *  freshness: identical hash → nothing changed → skip regeneration + LLM. */
export function deterministicHash(classification: ClassificationArtifact, summary: SummaryArtifact): string {
  const stable = JSON.stringify({
    c: classification.classification,
    cs: classification.explain.deterministicSignals,
    s: summary.stage, i: summary.intent, f: summary.facts, o: summary.objections, p: summary.promises, n: summary.nextAction,
  });
  return crypto.createHash("sha1").update(stable).digest("hex");
}

/** Regenerate when: forced (manual/reopen) OR the deterministic output changed.
 *  Never regenerates (and never runs an LLM) when the hash is unchanged. */
export function shouldRegenerate(prevHash: string | null, nextHash: string, force: boolean): boolean {
  if (force) return prevHash !== nextHash;   // manual/reopen still no-ops if truly identical
  return prevHash !== nextHash;
}

export interface InsightRow {
  org_id: string; conversation_ref: string; agent_id: string | null;
  classification: string; classification_confidence: number;
  sentiment: string | null; sentiment_confidence: number;
  recommended_action: string | null; recommended_action_reason: string | null;
  waiting: boolean; attention: unknown; explainability: unknown; analyzed_at: string;
}

const SENTIMENT_MAP: Record<string, string> = {
  positive: "positive", excited: "high_intent", urgent: "high_intent",
  neutral: "neutral", cold: "hesitant", negative: "frustrated", frustrated: "frustrated",
};

export function buildInsightRow(
  orgId: string, analysis: ConversationAnalysis, classification: ClassificationArtifact, summary: SummaryArtifact, nowIso: string,
): InsightRow {
  const topRisk = analysis.risks[0];
  return {
    org_id: orgId,
    conversation_ref: analysis.ref,
    agent_id: null,
    classification: classification.classification,
    classification_confidence: classification.explain.confidence,
    sentiment: SENTIMENT_MAP[analysis.sentiment.sentiment] ?? "neutral",
    sentiment_confidence: analysis.sentiment.score,
    recommended_action: null,                              // Phase 2 (NBA) fills this
    recommended_action_reason: topRisk?.recommended_action ?? summary.nextAction,
    waiting: analysis.waiting,
    attention: [],
    explainability: {
      classification: classification.explain,
      summary: summary.explain,
      deterministicHash: deterministicHash(classification, summary),
    },
    analyzed_at: nowIso,
  };
}

export interface SummaryRow {
  org_id: string; entity_type: string; entity_id: string; thread_id: null; scope: string;
  summary_text: string; what_client_wants: string | null; what_changed: null;
  blocking_progress: string | null; next_step: string; key_points: unknown; generated_at: string;
}

export function buildSummaryRow(orgId: string, summary: SummaryArtifact, ref: string, nowIso: string): SummaryRow {
  return {
    org_id: orgId,
    entity_type: "conversation",
    entity_id: conversationRefToUuid(ref),                 // deterministic uuid (no FK)
    thread_id: null,
    scope: "conversation",
    summary_text: (summary.explain.evidence[0] ?? ""),     // grounded key summary
    what_client_wants: summary.intent || null,
    what_changed: null,
    blocking_progress: summary.objections.length ? summary.objections.join("; ") : null,
    next_step: summary.nextAction,
    key_points: {
      conversation_ref: ref,
      stage: summary.stage,
      facts: summary.facts,
      promises: summary.promises,
      contributions: summary.contributions,               // per-section evidence (explainability)
      explain: summary.explain,
    },
    generated_at: nowIso,
  };
}
