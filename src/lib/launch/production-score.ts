// ============================================================================
// ZONO — production readiness score (pure, deterministic). Rolls five weighted
// category sub-signals (0..1) into per-category percentages and an overall
// launch-readiness percentage + band. No AI, no randomness.
// ============================================================================
import type { ProductionScore, ScoreCategory, ScoreCategoryKey, ScoreInput } from "./types";

const CATEGORY_LABELS: Record<ScoreCategoryKey, string> = {
  infrastructure: "Infrastructure",
  security: "Security",
  performance: "Performance",
  monitoring: "Monitoring",
  reliability: "Reliability",
};

// Launch readiness weights category importance (security weighted highest).
const WEIGHTS: Record<ScoreCategoryKey, number> = {
  infrastructure: 0.2,
  security: 0.25,
  performance: 0.2,
  monitoring: 0.15,
  reliability: 0.2,
};

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const pct = (n: number): number => Math.round(clamp01(n) * 100);

export function computeProductionScore(input: ScoreInput): ProductionScore {
  const categories: ScoreCategory[] = (Object.keys(CATEGORY_LABELS) as ScoreCategoryKey[]).map((key) => ({
    key, label: CATEGORY_LABELS[key], percent: pct(input[key]),
  }));

  const weighted = (Object.keys(WEIGHTS) as ScoreCategoryKey[]).reduce(
    (acc, key) => acc + clamp01(input[key]) * WEIGHTS[key], 0,
  );
  const launchReadinessPercent = Math.round(weighted * 100);

  const band: ProductionScore["band"] =
    launchReadinessPercent >= 95 ? "ready" : launchReadinessPercent >= 80 ? "caution" : "not_ready";

  return { categories, launchReadinessPercent, band };
}
