// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — composable confidence engine (pure, client-safe).
// ----------------------------------------------------------------------------
// ONE confidence calculation for the whole platform. Engines emit confidence
// SIGNALS (source + value + weight + sample size); this composes them into a
// single confidence with a tier and a data-derived explanation. Honest by
// design: thin evidence is downgraded, never inflated. No module computes its
// own composite confidence anymore — they all call composeConfidence().
// ============================================================================
import type { ConfidenceSignal, ComposedConfidence, ConfidenceTier } from "./types";
import { clamp } from "./metrics";

export function tierFor(value: number): ConfidenceTier {
  if (value >= 90) return "verified";
  if (value >= 70) return "high";
  if (value >= 45) return "medium";
  if (value >= 20) return "low";
  return "insufficient";
}

/** Sample-size multiplier: <3 samples is penalised, ≥8 is full strength. */
function sampleFactor(sampleSize?: number): number {
  if (sampleSize == null) return 1;
  if (sampleSize <= 0) return 0.4;
  return Math.max(0.4, Math.min(1, 0.4 + (sampleSize / 8) * 0.6));
}

const TIER_HE: Record<ConfidenceTier, string> = {
  verified: "מאומת", high: "גבוה", medium: "בינוני", low: "נמוך", insufficient: "לא מספיק",
};

/**
 * Compose many confidence signals into one. Weighted by `weight × sampleFactor`
 * so both importance and evidence depth matter. Empty input → insufficient.
 */
export function composeConfidence(signals: ConfidenceSignal[]): ComposedConfidence {
  const usable = signals.filter((s) => Number.isFinite(s.value));
  if (!usable.length) {
    return { value: 0, tier: "insufficient", signals: [], explanation: "אין מספיק נתונים לחישוב ביטחון." };
  }
  let num = 0, den = 0, evidenceUnits = 0;
  for (const s of usable) {
    const w = Math.max(0, s.weight ?? 1) * sampleFactor(s.sampleSize);
    num += clamp(s.value) * w; den += w;
    // Absent sampleSize → assume adequate (8) so we don't penalise legitimate
    // signals that simply don't report depth; explicit small samples DO penalise.
    evidenceUnits += s.sampleSize ?? 8;
  }
  // Absolute evidence factor: thin total evidence downgrades the final value
  // (reaches full strength at ~8 evidence units). Honest, never inflates.
  const evidenceFactor = Math.min(1, 0.55 + evidenceUnits * 0.06);
  const value = den ? clamp((num / den) * evidenceFactor) : 0;
  const tier = tierFor(value);
  const top = usable.slice().sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1)).slice(0, 3).map((s) => s.source);
  const explanation = `ביטחון ${tier in TIER_HE ? TIER_HE[tier] : tier} (${value}%) על בסיס ${usable.length} מקורות${top.length ? `: ${top.join(", ")}` : ""}.`;
  return { value, tier, signals: usable, explanation };
}

/** Blend two already-composed confidences (e.g. context over knowledge). */
export function blendConfidence(a: ComposedConfidence, b: ComposedConfidence): ComposedConfidence {
  return composeConfidence([
    ...a.signals.map((s) => ({ ...s, source: s.source })),
    ...b.signals.map((s) => ({ ...s, source: s.source })),
  ]);
}
