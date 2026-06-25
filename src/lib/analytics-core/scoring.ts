// ============================================================================
// ZONO — Analytics Core: scoring + banding (pure, canonical). Normalizes raw
// signals to 0..100 and maps scores to bands / severities consistently.
// ============================================================================
import { clamp, round } from "./percentages";
import type { Confidence, Severity } from "./types";

/** Clamp+round a raw score into 0..100. */
export function normalizeScore(raw: number): number {
  return round(clamp(raw, 0, 100), 0);
}

export type HealthBand = "excellent" | "good" | "fair" | "at_risk";
export function scoreBand(score: number): HealthBand {
  return score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "at_risk";
}

export const BAND_LABELS: Record<HealthBand, string> = { excellent: "מצוין", good: "טוב", fair: "סביר", at_risk: "בסיכון" };

/** Severity from a 0..100 risk/likelihood score. */
export function severityFromScore(score: number): Severity {
  return score >= 75 ? "urgent" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";
}
export const SEVERITY_RANK: Record<Severity, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const SEVERITY_LABELS: Record<Severity, string> = { urgent: "דחוף", high: "גבוה", medium: "בינוני", low: "נמוך" };

/** Confidence band from a sample/denominator size (deterministic thresholds). */
export function confidenceFromSample(n: number): Confidence {
  return n >= 50 ? "high" : n >= 15 ? "medium" : "low";
}
export const CONFIDENCE_LABELS: Record<Confidence, string> = { high: "ודאות גבוהה", medium: "ודאות בינונית", low: "ודאות נמוכה" };

/** Weighted blend of 0..100 components → 0..100 total. */
export function weightedScore(components: { score: number; weight: number }[]): number {
  let weighted = 0, weightSum = 0;
  for (const c of components) { weighted += clamp(c.score, 0, 100) * c.weight; weightSum += c.weight; }
  return round(weightSum > 0 ? weighted / weightSum : 0, 0);
}
