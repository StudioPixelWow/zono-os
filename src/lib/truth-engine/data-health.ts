// ============================================================================
// 🛡️ Truth Engine — Data Health (pure). 27.7. Parts 6 + 8.
// Aggregates entity Truth Scores into scope-level health (organization / office
// / broker / property / market) and produces the executive-trust adjustment the
// Chief of Staff consumes (low trust lowers recommendation confidence).
// ============================================================================
import { clamp } from "./truth-score";
import type { TruthScore, DataHealth, ExecutiveTrust } from "./types";

const mean = (xs: number[]): number => (xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : 0);

/** Evidence-weighted health over a set of entity truth scores. */
export function computeDataHealth(scope: string, scores: TruthScore[]): DataHealth {
  const notes: string[] = [];
  if (!scores.length) {
    notes.push(`אין ישויות מסוג ${scope} עם ראיות — לא ניתן לחשב בריאות נתונים.`);
    return { scope, entities: 0, score: 0, avgConfidence: 0, avgFreshness: 0, verifiedPct: 0, contradictionRatePct: 0, staleCount: 0, missingHeavyCount: 0, notes };
  }

  // Weight each entity by evidence volume so noisy 1-source entities count less.
  const totalW = scores.reduce((s, x) => s + Math.max(1, x.evidenceCount), 0);
  const weighted = scores.reduce((s, x) => s + x.truthScore * Math.max(1, x.evidenceCount), 0);
  const score = clamp(weighted / totalW);

  const verified = scores.filter((x) => x.verificationLevel === "verified" || x.verificationLevel === "corroborated").length;
  const withContra = scores.filter((x) => x.contradictions > 0).length;
  const stale = scores.filter((x) => x.freshnessLevel === "stale" || x.freshnessLevel === "expired" || x.freshnessLevel === "unknown").length;
  const missingHeavy = scores.filter((x) => x.missingInfo.length >= 2).length;

  if (score < 50) notes.push("בריאות נתונים נמוכה — נדרש איסוף ראיות ואימות.");
  if (withContra / scores.length > 0.3) notes.push("שיעור סתירות גבוה — בדוק מקורות סותרים.");

  return {
    scope, entities: scores.length, score,
    avgConfidence: mean(scores.map((x) => x.confidence)),
    avgFreshness: mean(scores.map((x) => x.freshness)),
    verifiedPct: clamp((verified / scores.length) * 100),
    contradictionRatePct: clamp((withContra / scores.length) * 100),
    staleCount: stale, missingHeavyCount: missingHeavy, notes,
  };
}

/**
 * Part 8 — how the Chief of Staff should consume the Truth Score. Low org trust
 * discounts CoS AI confidence (never inflates it). Read-only: CoS itself is not
 * modified; this returns the adjustment to apply at the executive surface.
 */
export function buildExecutiveTrust(cosBusinessScore: number, cosAiConfidence: number, orgTruthScore: number): ExecutiveTrust {
  const factor = clamp(orgTruthScore) / 100;                 // 0..1
  const truthAdjustedConfidence = clamp(cosAiConfidence * factor);
  const gap = cosAiConfidence - truthAdjustedConfidence;
  const note = gap >= 10
    ? `אמון הנתונים (${clamp(orgTruthScore)}) מוריד את ביטחון ה-AI מ-${clamp(cosAiConfidence)} ל-${truthAdjustedConfidence}. חזק ראיות לפני החלטות.`
    : `אמון הנתונים תומך בביטחון ה-AI (${truthAdjustedConfidence}).`;
  return { cosBusinessScore: clamp(cosBusinessScore), cosAiConfidence: clamp(cosAiConfidence), orgTruthScore: clamp(orgTruthScore), truthAdjustedConfidence, note };
}
