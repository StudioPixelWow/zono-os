// ============================================================================
// 🕸️ Relationship Graph — edge metrics + explainability (pure). 27.9. Parts 3+9.
// Aggregates repeated raw relations into ONE first-class edge with strength,
// confidence (capped by evidence), duration, freshness and verification. Reuses
// Truth-Engine freshness (no duplicated logic). Evidence-only.
// ============================================================================
import { freshnessScore, freshnessLevel } from "../truth-engine/freshness";
import {
  RELATION_HE,
  type RawRelation, type RelationshipEdge, type RelationType, type EntityType, type VerificationLevel,
} from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));

function verificationOf(occurrences: number, diversity: number): VerificationLevel {
  if (occurrences >= 3 && diversity >= 2) return "verified";
  if (occurrences >= 2 || diversity >= 2) return "corroborated";
  if (occurrences === 1) return "single_source";
  return "unverified";
}

/** Build one aggregated edge from a group of raw relations (same from→to→type). */
export function buildEdge(id: string, from: string, to: string, fromType: EntityType, toType: EntityType, type: RelationType, group: RawRelation[]): RelationshipEdge {
  const occurrences = group.length;
  const sources = [...new Set(group.map((g) => g.source).filter(Boolean))];
  const diversity = sources.length;
  const ats = group.map((g) => g.at).filter((x): x is string => !!x).sort();
  const firstAt = ats[0] ?? null;
  const lastAt = ats[ats.length - 1] ?? null;
  const durationDays = firstAt && lastAt ? Math.round((new Date(lastAt).getTime() - new Date(firstAt).getTime()) / 86400000) : null;

  const freshness = freshnessScore(lastAt);
  const flevel = freshnessLevel(lastAt);
  const verification = verificationOf(occurrences, diversity);

  const base = Math.min(100, occurrences * 18);
  const strength = clamp(0.7 * base + 0.3 * freshness);
  const confidence = clamp(Math.min(strength, 0.5 * base + 0.3 * freshness + 0.2 * Math.min(100, diversity * 30)));

  const evidence = [...new Set(group.map((g) => g.evidence).filter(Boolean))].slice(0, 6);
  const rel = RELATION_HE[type] ?? String(type);
  const history = durationDays != null && durationDays > 0
    ? `${occurrences} אינטראקציות לאורך ${durationDays} ימים`
    : `${occurrences} אינטראקציות`;

  return {
    id, from, to, fromType, toType, type,
    strength, confidence, occurrences, evidence, sources,
    firstAt, lastAt, durationDays, freshness, freshnessLevel: flevel, verification,
    explanation: {
      why: `יחס "${rel}" נגזר מ-${occurrences} ראיות מ-${diversity} מקורות (${sources.slice(0, 3).join(", ")}).`,
      evidence: evidence.length ? evidence : ["ראיה מהגרף המקושר"],
      history, confidence, verification,
    },
  };
}
