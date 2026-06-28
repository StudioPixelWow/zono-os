// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — explainability envelope (pure, client-safe).
// ----------------------------------------------------------------------------
// REUSES the existing ZONO explainability contract (@/lib/explainability) for
// score reasons and wraps it in the Fabric superset: confidence + sources +
// reasoning + dependencies + lastUpdate + relatedEntities. Nothing in ZONO ever
// returns a bare number again — everything can answer "why". No fabrication:
// this layer only transports reasons produced by deterministic engines.
// ============================================================================
import { buildExplanation, type ExplainableScoreType } from "@/lib/explainability/types";
import type { FabricExplanation, ComposedConfidence, EntityRef } from "./types";

export function buildFabricExplanation(input: {
  scoreType: ExplainableScoreType;
  score: number;
  band?: string;
  entity?: EntityRef;
  reasons: string[];
  confidence: ComposedConfidence;
  sources: string[];
  reasoning: string;
  dependencies?: EntityRef[];
  lastUpdate?: string | null;
  relatedEntities?: EntityRef[];
}): FabricExplanation {
  return {
    score: buildExplanation({
      scoreType: input.scoreType,
      score: input.score,
      band: input.band,
      entityType: input.entity?.type,
      entityId: input.entity?.id ?? null,
      reasons: input.reasons,
      source: input.sources[0],
    }),
    confidence: input.confidence,
    sources: [...new Set(input.sources.filter(Boolean))],
    reasoning: input.reasoning,
    dependencies: input.dependencies ?? [],
    lastUpdate: input.lastUpdate ?? null,
    relatedEntities: input.relatedEntities ?? [],
  };
}

/** Pick the freshest ISO timestamp from a set (for lastUpdate). */
export function freshest(...iso: (string | null | undefined)[]): string | null {
  const times = iso.filter((x): x is string => !!x).map((x) => ({ x, t: new Date(x).getTime() })).filter((o) => !Number.isNaN(o.t));
  if (!times.length) return null;
  return times.sort((a, b) => b.t - a.t)[0].x;
}
