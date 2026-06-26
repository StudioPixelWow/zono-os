// ============================================================================
// ZONO — PHASE 26.9: RAIN node-importance + edge-strength scoring (PURE).
// Deterministic, client-safe, no IO. Real data only: every score is built from
// observed inputs. When nothing is observable the score is NULL and confidence
// is "low" — we never fabricate a 0. All scores clamp to 0..100.
// ============================================================================
import type { RainConfidence } from "./rainTypes";

export const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Confidence bucket from the count of real data points behind a score. */
export function confidenceFromDataPoints(n: number): RainConfidence {
  if (n >= 3) return "high";
  if (n >= 1) return "medium";
  return "low";
}

/** Average the present (non-null) components; NULL when none are present. */
function combine(components: Array<number | null | undefined>): { score: number | null; dataPoints: number } {
  const present = components.filter((c): c is number => typeof c === "number" && !Number.isNaN(c));
  if (present.length === 0) return { score: null, dataPoints: 0 };
  const avg = present.reduce((a, b) => a + b, 0) / present.length;
  return { score: clamp100(avg), dataPoints: present.length };
}

export interface ScoredValue { importance: number | null; confidence: RainConfidence }

const finalize = (score: number | null, dataPoints: number): ScoredValue =>
  score == null ? { importance: null, confidence: "low" } : { importance: score, confidence: confidenceFromDataPoints(dataPoints) };

// ── Node importance ────────────────────────────────────────────────────────

/** Agency: overall + threat + momentum (0..100 each) + active-signal volume. */
export function scoreAgencyNode(i: {
  overall?: number | null; threat?: number | null; momentum?: number | null; activeSignals?: number | null;
}): ScoredValue {
  const signalScore = i.activeSignals != null ? clamp100((i.activeSignals / 5) * 100) : null;
  const { score, dataPoints } = combine([i.overall, i.threat, i.momentum, signalScore]);
  return finalize(score, dataPoints);
}

/** Agent: number of related properties + agency-relationship confidence (0..1). */
export function scoreAgentNode(i: {
  relatedProperties?: number | null; agencyRelationConfidence?: number | null;
}): ScoredValue {
  const propScore = i.relatedProperties != null ? clamp100((i.relatedProperties / 10) * 100) : null;
  const relScore = i.agencyRelationConfidence != null ? clamp100(i.agencyRelationConfidence * 100) : null;
  const { score, dataPoints } = combine([propScore, relScore]);
  return finalize(score, dataPoints);
}

/** Property: status weight + price tier (0..100) + activity volume + related signals. */
export function scorePropertyNode(i: {
  statusScore?: number | null; priceTier?: number | null; activity?: number | null; relatedSignals?: number | null;
}): ScoredValue {
  const activityScore = i.activity != null ? clamp100((i.activity / 8) * 100) : null;
  const signalScore = i.relatedSignals != null ? clamp100((i.relatedSignals / 4) * 100) : null;
  const { score, dataPoints } = combine([i.statusScore, i.priceTier, activityScore, signalScore]);
  return finalize(score, dataPoints);
}

/** Territory: dominance activity (0..100) + number of agencies + signal volume. */
export function scoreTerritoryNode(i: {
  dominanceActivity?: number | null; agencyCount?: number | null; signals?: number | null;
}): ScoredValue {
  const agencyScore = i.agencyCount != null ? clamp100((i.agencyCount / 6) * 100) : null;
  const signalScore = i.signals != null ? clamp100((i.signals / 5) * 100) : null;
  const { score, dataPoints } = combine([i.dominanceActivity, agencyScore, signalScore]);
  return finalize(score, dataPoints);
}

/** Signal: severity weight (0..100) + importance (0..100). */
export function scoreSignalNode(i: { severityScore?: number | null; importance?: number | null }): ScoredValue {
  const { score, dataPoints } = combine([i.severityScore, i.importance]);
  return finalize(score, dataPoints);
}

/** Map a textual severity to a 0..100 weight (null when unknown). */
export function severityWeight(sev: string | null | undefined): number | null {
  switch (sev) {
    case "critical": return 100;
    case "high": return 75;
    case "medium": return 50;
    case "low": return 25;
    default: return null;
  }
}

// ── Edge strength ──────────────────────────────────────────────────────────

export interface EdgeStrengthResult { strength: number | null; confidence: RainConfidence }

/**
 * Edge strength 0..100 from: relationship confidence (0..1), supporting events,
 * recency (days since last seen), activity volume, and territory overlap (0..1).
 * NULL when no signal at all. Recency decays linearly over ~180 days.
 */
export function scoreEdgeStrength(i: {
  relationshipConfidence?: number | null;
  supportingEvents?: number | null;
  recencyDays?: number | null;
  activityVolume?: number | null;
  territoryOverlap?: number | null;
}): EdgeStrengthResult {
  const confScore = i.relationshipConfidence != null ? clamp100(i.relationshipConfidence * 100) : null;
  const eventsScore = i.supportingEvents != null ? clamp100((Math.min(i.supportingEvents, 10) / 10) * 100) : null;
  const recencyScore = i.recencyDays != null ? clamp100((1 - Math.min(Math.max(i.recencyDays, 0), 180) / 180) * 100) : null;
  const activityScore = i.activityVolume != null ? clamp100((Math.min(i.activityVolume, 12) / 12) * 100) : null;
  const overlapScore = i.territoryOverlap != null ? clamp100(i.territoryOverlap * 100) : null;
  const { score, dataPoints } = combine([confScore, eventsScore, recencyScore, activityScore, overlapScore]);
  return score == null ? { strength: null, confidence: "low" } : { strength: score, confidence: confidenceFromDataPoints(dataPoints) };
}
