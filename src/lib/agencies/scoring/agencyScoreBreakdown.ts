// ============================================================================
// ZONO — Agency overall-score breakdown (Phase 26.5, PURE, client-safe).
// Combines the available component scores into one overall score, REDISTRIBUTING
// the weight of any null component across the present ones (null is never read as
// 0). Also derives a 0..100 data-confidence from evidence breadth + freshness.
// ============================================================================
import { DEFAULT_SCORE_WEIGHTS, clamp, round1 } from "./agencyScoringTypes";
import type { AgencyScoreKey, AgencyScoreInput } from "./agencyScoringTypes";

export interface OverallResult {
  overall: number | null;
  breakdown: Record<string, { value: number | null; weight: number; contribution: number | null }>;
  missing: AgencyScoreKey[];
}

/**
 * Weighted overall over the AVAILABLE components only. The weights of null
 * components are redistributed proportionally across the present components, so
 * missing data never silently drags the score toward 0.
 */
export function weightedOverall(
  components: Record<AgencyScoreKey, number | null>,
  weights: Record<AgencyScoreKey, number> = DEFAULT_SCORE_WEIGHTS,
): OverallResult {
  const present = (Object.keys(weights) as AgencyScoreKey[]).filter((k) => {
    const v = components[k];
    return typeof v === "number" && Number.isFinite(v);
  });
  const missing = (Object.keys(weights) as AgencyScoreKey[]).filter((k) => !present.includes(k));

  const presentWeightSum = present.reduce((s, k) => s + weights[k], 0);
  const breakdown: OverallResult["breakdown"] = {};
  for (const k of Object.keys(weights) as AgencyScoreKey[]) {
    breakdown[k] = { value: components[k] ?? null, weight: 0, contribution: null };
  }

  if (present.length === 0 || presentWeightSum <= 0) {
    return { overall: null, breakdown, missing };
  }

  let overall = 0;
  for (const k of present) {
    const effWeight = weights[k] / presentWeightSum; // redistributed
    const value = components[k] as number;
    const contribution = effWeight * value;
    overall += contribution;
    breakdown[k] = { value, weight: round1(effWeight * 100) / 100, contribution: round1(contribution) };
  }
  return { overall: round1(clamp(overall, 0, 100)), breakdown, missing };
}

/**
 * Data confidence (0..100) from evidence breadth + freshness. Reflects how much
 * real data backed the scores — NOT how high they are. Low confidence is stored
 * so consumers can flag it.
 */
export function dataConfidence(input: AgencyScoreInput): number {
  let c = 0;
  // Breadth of related entities.
  c += clamp((input.activeListings + input.soldCount) / 12, 0, 1) * 22;
  c += clamp(input.territoryStatsCount / 6, 0, 1) * 18;
  c += clamp(input.agentCount / 4, 0, 1) * 12;
  c += clamp((input.cities + input.neighborhoods) / 6, 0, 1) * 10;
  // Closed-deal evidence (strongest).
  c += clamp(input.dealsCount / 3, 0, 1) * 12;
  c += input.soldCount > 0 ? 6 : 0;
  // Digital + reputation availability.
  c += input.digitalFieldsTracked ? 6 : 0;
  c += input.hasReputationData ? 6 : 0;
  // Freshness (newer data → more confidence).
  if (input.dataAgeDays != null) c += clamp(1 - input.dataAgeDays / 180, 0, 1) * 8;
  return Math.round(clamp(c, 0, 100));
}
