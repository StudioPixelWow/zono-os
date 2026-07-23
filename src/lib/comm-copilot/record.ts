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
import type { CopilotPipelineResult } from "./pipeline";

/** Optional Phase-2 signals folded into the freshness hash so a sentiment /
 *  recommendation / attention change also triggers regeneration. */
export interface HashExtra { sentiment?: string; action?: string; attention?: string[] }

/** Stable hash of the DETERMINISTIC output (excludes timestamps). Drives
 *  freshness: identical hash → nothing changed → skip regeneration + LLM. */
export function deterministicHash(classification: ClassificationArtifact, summary: SummaryArtifact, extra: HashExtra = {}): string {
  const stable = JSON.stringify({
    c: classification.classification,
    cs: classification.explain.deterministicSignals,
    s: summary.stage, i: summary.intent, f: summary.facts, o: summary.objections, p: summary.promises, n: summary.nextAction,
    sent: extra.sentiment ?? null, act: extra.action ?? null, att: extra.attention ?? [],
  });
  return crypto.createHash("sha1").update(stable).digest("hex");
}

/** Extra signals for a full pipeline result. */
export function hashExtraOf(r: CopilotPipelineResult): HashExtra {
  return { sentiment: r.sentiment.sentiment, action: r.recommendedAction.action, attention: r.attention.map((f) => f.kind).sort() };
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

/** Build the insight row from a full pipeline result (Phase 1 + 2). */
export function buildInsightRow(orgId: string, r: CopilotPipelineResult, nowIso: string): InsightRow {
  return {
    org_id: orgId,
    conversation_ref: r.analysis.ref,
    agent_id: null,
    classification: r.classification.classification,
    classification_confidence: r.classification.explain.confidence,
    sentiment: r.sentiment.sentiment,
    sentiment_confidence: r.sentiment.explain.confidence,
    recommended_action: r.recommendedAction.action,
    recommended_action_reason: r.recommendedAction.explain.reasoning[0] ?? r.summary.nextAction,
    waiting: r.analysis.waiting,
    attention: r.attention,                                // detected attention flags (+ evidence)
    explainability: {
      classification: r.classification.explain,
      summary: r.summary.explain,
      sentiment: r.sentiment.explain,
      recommendedAction: r.recommendedAction.explain,
      attention: r.attention,
      deterministicHash: deterministicHash(r.classification, r.summary, hashExtraOf(r)),
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
