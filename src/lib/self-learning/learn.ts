// ============================================================================
// 🧬 ZONO — Self-Learning AI — pattern detector (pure & deterministic). PHASE 54.0.
// Groups outcome signals by (dimension, value); computes success rate, sample
// size, recency and a confidence that rises with BOTH sample size and outcome
// extremity. Gates: below minSample → "insufficient" (false-pattern prevention);
// mixed ~50% → "inconclusive"; old evidence → "stale" with decayed confidence;
// only high-confidence, extreme, fresh patterns become "learned". Advisory only.
// ============================================================================
import {
  DEFAULT_THRESHOLDS, DIMENSION_HE, SELF_LEARNING_VERSION,
  type LearningSignal, type LearningThresholds, type LearnedPattern, type LearningDimension,
  type DimensionLearning, type LearningReport, type LearningRecommendation, type Direction, type PatternStatus, type Outcome,
  ADVISORY_NOTE,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const DAY = 86_400_000;
const DIM_HREF: Partial<Record<LearningDimension, string>> = { group: "/distribution/groups", copy_angle: "/marketing", hour: "/distribution", broker: "/team", street: "/territory", price_strategy: "/valuation" };

interface Group { value: string; label: string; successes: number; failures: number; ats: string[] }

function recDirection(rate: number, t: LearningThresholds): Direction {
  return rate >= t.strongRate ? "boost" : rate <= t.weakRate ? "caution" : "none";
}

function recommendationText(dim: LearningDimension, dir: Direction, label: string, rate: number): string {
  const he = DIMENSION_HE[dim];
  if (dir === "boost") return `הגבר שימוש ב${he} "${label}" — שיעור הצלחה ${rate}%.`;
  if (dir === "caution") return `צמצם/שנה ${he} "${label}" — שיעור הצלחה נמוך (${rate}%).`;
  return `${he} "${label}" — תוצאות מעורבות, המשך מדידה.`;
}

/** Build one learned-pattern from a group of outcomes for a (dimension,value). */
function toPattern(dim: LearningDimension, g: Group, t: LearningThresholds, now: number): LearnedPattern {
  const sample = g.successes + g.failures;
  const successRate = sample ? clamp((g.successes / sample) * 100) : 0;
  const ats = g.ats.filter(Boolean).sort();
  const firstAt = ats[0] ?? null;
  const lastAt = ats[ats.length - 1] ?? null;
  const recencyDays = lastAt ? Math.max(0, Math.round((now - new Date(lastAt).getTime()) / DAY)) : null;
  const stale = recencyDays != null && recencyDays > t.staleDays;

  const extremity = Math.abs(successRate - 50) / 50;                 // 0 (mixed) .. 1 (decisive)
  const base = Math.min(85, sample * 12);
  let confidence = clamp(base * (0.5 + 0.5 * extremity));
  if (stale) confidence = clamp(confidence * 0.5);

  const direction = recDirection(successRate, t);

  let status: PatternStatus;
  if (sample < t.minSample) status = "insufficient";              // ← false-pattern prevention
  else if (stale) status = "stale";
  else if (direction !== "none" && confidence >= t.learnConfidence) status = "learned";
  else if (direction !== "none" && confidence >= t.learnConfidence - 15) status = "emerging";
  else status = "inconclusive";

  const evidence = [
    `${g.successes}/${sample} הצלחות (${successRate}%)`,
    recencyDays != null ? `עדכני לפני ${recencyDays} ימים` : "",
    stale ? "ראיות ישנות — משקל מופחת" : "",
  ].filter(Boolean);

  return {
    dimension: dim, value: g.value, label: g.label, status, sample, successes: g.successes, failures: g.failures,
    successRate, confidence, direction: status === "learned" || status === "emerging" ? direction : "none",
    recommendation: recommendationText(dim, direction, g.label, successRate),
    evidence, firstAt, lastAt, recencyDays, stale,
  };
}

/** Detect learned patterns across all dimensions from raw outcome signals. */
export function learnPatterns(signals: LearningSignal[], thresholds: Partial<LearningThresholds> = {}, now: number = Date.now()): LearningReport {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  // Group by dimension → value.
  const byDim = new Map<LearningDimension, Map<string, Group>>();
  for (const s of signals) {
    if (!s.value) continue;
    const dm = byDim.get(s.dimension) ?? byDim.set(s.dimension, new Map()).get(s.dimension)!;
    const g = dm.get(s.value) ?? { value: s.value, label: s.label || s.value, successes: 0, failures: 0, ats: [] };
    if ((s.outcome as Outcome) === "success") g.successes += 1; else g.failures += 1;
    g.ats.push(s.at);
    dm.set(s.value, g);
  }

  const dimensions: DimensionLearning[] = [];
  const recommendations: LearningRecommendation[] = [];
  let learned = 0, insufficient = 0, stale = 0;

  for (const [dim, dm] of byDim) {
    const patterns = [...dm.values()].map((g) => toPattern(dim, g, t, now))
      .sort((a, b) => (b.status === "learned" ? 1 : 0) - (a.status === "learned" ? 1 : 0) || b.confidence - a.confidence || b.sample - a.sample);
    for (const p of patterns) { if (p.status === "learned") learned++; if (p.status === "insufficient") insufficient++; if (p.stale) stale++; }

    const winners = patterns.filter((p) => (p.status === "learned" || p.status === "emerging") && p.direction === "boost");
    const losers = patterns.filter((p) => (p.status === "learned" || p.status === "emerging") && p.direction === "caution");

    dimensions.push({
      dimension: dim, dimensionHe: DIMENSION_HE[dim], patterns,
      topWinner: winners[0] ?? null, topLoser: losers[0] ?? null,
      learnedCount: patterns.filter((p) => p.status === "learned").length,
    });

    for (const p of patterns.filter((p) => p.status === "learned")) {
      recommendations.push({ dimension: dim, dimensionHe: DIMENSION_HE[dim], direction: p.direction, text: p.recommendation, confidence: p.confidence, evidence: p.evidence, targetHref: DIM_HREF[dim] ?? null });
    }
  }

  dimensions.sort((a, b) => b.learnedCount - a.learnedCount);
  recommendations.sort((a, b) => b.confidence - a.confidence);

  const notes = [ADVISORY_NOTE];
  if (!signals.length) notes.unshift("אין עדיין תוצאות מספיקות ללמידה. המערכת תלמד ככל שיצטברו תוצאות אמת (פרסומים, לידים, סגירות).");

  return {
    version: SELF_LEARNING_VERSION,
    generatedAt: null,
    dimensions,
    recommendations,
    totals: { signals: signals.length, learned, insufficient, stale },
    hasData: signals.length > 0 && dimensions.some((d) => d.patterns.length > 0),
    notes,
  };
}
