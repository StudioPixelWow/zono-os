// ============================================================================
// 🤖 ZONO — Copilot EXPLAINABILITY builder (pure). No black-box decisions.
// ----------------------------------------------------------------------------
// Every generated artifact must carry a uniform reasoning envelope. This pure
// helper constructs and validates it, so explainability is consistent and
// testable across all analyzers (classification/summary/NBA/reply/…).
// ============================================================================
import type { Explainability } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Build a complete Explainability envelope from a partial (confidence required). */
export function buildExplain(input: Partial<Explainability> & { confidence: number }): Explainability {
  return {
    confidence: clamp(input.confidence),
    reasoning: input.reasoning ?? [],
    evidence: input.evidence ?? [],
    evidenceMessageIds: input.evidenceMessageIds ?? [],
    deterministicSignals: input.deterministicSignals ?? [],
    llmContribution: input.llmContribution ?? null,
  };
}

/** True when an envelope is well-formed and non-empty (a real explanation, not a
 *  black box): confidence in range + at least one reasoning point + at least one
 *  deterministic signal or an explicit LLM contribution. */
export function isExplained(e: Explainability): boolean {
  const hasBasis = e.deterministicSignals.length > 0 || (e.llmContribution?.used ?? false);
  return e.confidence >= 0 && e.confidence <= 100 && e.reasoning.length > 0 && hasBasis;
}
