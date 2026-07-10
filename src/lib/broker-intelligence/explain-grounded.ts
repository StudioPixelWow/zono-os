// ============================================================================
// 💬 ZONO OS 2.0 — Stage 4 · Batch 4.5E · Grounded recommendation explanation (server).
// Wraps the PURE, deterministic explainRecommendation with the ONE shared assembler
// in recommendation_explanation mode. The canonical recommendation SCORE, RANKING
// and IDENTITY are never changed here — the assembler ONLY enriches the "why?" with
// memory / timeline / graph provenance. Explicit facts stay facts, derived facts
// are already phrased as calculations by the pure layer, inferred memory is labeled
// by the renderer, unknowns stay unknown. Best-effort: grounding failure never
// breaks the explanation.
// ============================================================================
import "server-only";
import { groundRecommendationContext, toGroundedSummary, type GroundedSummary } from "@/lib/ai-context";
import { explainRecommendation, type RecommendationExplanation, type ExplainContext } from "./explain";
import type { PrioritizedRecommendation } from "./priority";

export interface GroundedRecommendationExplanation extends RecommendationExplanation {
  /** Stable recommendation identity (preserved). */
  recommendationId: string;
  /** How many intelligence engines corroborated it (contributing engines). */
  contributingEngines: number;
  /** Shared-assembler grounding (provenance counts + partial diagnostics), or null. */
  grounding: GroundedSummary | null;
}

/** Explain a recommendation deterministically, then enrich with shared-assembler provenance. */
export async function explainRecommendationGrounded(
  rec: PrioritizedRecommendation,
  ctx: ExplainContext = {},
): Promise<GroundedRecommendationExplanation> {
  const base = explainRecommendation(rec, ctx); // deterministic — score/rank/identity untouched
  let grounding: GroundedSummary | null = null;
  try {
    const g = await groundRecommendationContext(rec.entityType, rec.entityId);
    grounding = toGroundedSummary(g);
  } catch {
    grounding = null; // never fabricate; explanation still returns the real deterministic facts
  }
  return { ...base, recommendationId: rec.id, contributingEngines: rec.mergedCount, grounding };
}
