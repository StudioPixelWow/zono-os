// ============================================================================
// Valuation Weight Engine™ — calculator (PURE, deterministic, no AI/LLM).
//
// Blends evidence-source confidences using effective weights into a final
// valuation confidence, and lets Market Acceptance narrow/widen the range.
// The estimated VALUE is carried through UNCHANGED from the AVM — acceptance
// never overrides verified transactions and never invents a price.
// ============================================================================
import { computeEffectiveWeights, getWeightProfile, type SourceAvailability } from "./weights";
import type { ValuationWeightInput, ValuationWeightResult, WeightEvidence, WeightProfile } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number, step = 1000) => Math.round(n / step) * step;
const r1 = (n: number) => Math.round(n * 10) / 10;

const ACCEPTANCE_MIN_SAMPLE = 5; // below this, Market Acceptance is IGNORED

const SOURCE_LABELS: Record<keyof WeightProfile, string> = {
  officialTransactions: "עסקאות רשמיות",
  currentMarket: "שוק נוכחי (מודעות פעילות)",
  marketAcceptance: "קבלת שוק (Market Acceptance)",
  marketTrend: "מגמת שוק",
  listingSimilarity: "דמיון נכסים",
  location: "מיקום",
  propertyFeatures: "מאפייני נכס",
};

/**
 * Run the weight engine over base AVM facts + (optional) Market Acceptance facts.
 * Deterministic: identical inputs always produce identical weights, confidence,
 * range and evidence.
 */
export function runValuationWeightEngine(input: ValuationWeightInput): ValuationWeightResult {
  const { base } = input;
  const profile = getWeightProfile(input.profile);
  const notes: string[] = [];

  // ── Per-source availability (0..1 strength) ────────────────────────────────
  const officialStrength = base.officialTxCount > 0 ? clamp(0.5 + 0.05 * base.officialTxCount, 0.5, 1) : 0;
  const acc = input.acceptance;
  const acceptanceUsable = !!acc && acc.present && acc.sampleSize >= ACCEPTANCE_MIN_SAMPLE && acc.aggregateConfidence > 0;
  if (acc && acc.present && acc.sampleSize < ACCEPTANCE_MIN_SAMPLE) {
    notes.push("מדגם קבלת שוק קטן מדי — לא נכלל בהערכה.");
  }
  const acceptanceStrength = acceptanceUsable ? clamp(acc!.sampleSize / 20, 0.25, 1) : 0;

  const availability: SourceAvailability = {
    officialTransactions: officialStrength,
    currentMarket: base.activeListingCount > 0 ? 1 : 0,
    marketAcceptance: acceptanceStrength,
    marketTrend: base.dataQualityScore > 0 ? 1 : 0,
    listingSimilarity: base.avgSimilarity > 0 ? 1 : 0,
    location: 1,
    propertyFeatures: 1,
  };
  const weights = computeEffectiveWeights(profile, availability);

  // ── Per-source confidence (0..100) ─────────────────────────────────────────
  const officialConf = clamp(40 + Math.min(45, base.officialTxCount * 7), 0, 100);
  const currentMarketConf = clamp(30 + Math.min(35, base.activeListingCount * 3), 0, 100);
  let marketAcceptanceConf = 0;
  if (acceptanceUsable) {
    const a = acc!;
    const accSig = (a.acceptanceRate ?? 0) * 30 - (a.rejectionRate ?? 0) * 30;
    const absorp = a.absorptionSpeed != null ? (a.absorptionSpeed - 50) * 0.2 : 0;
    marketAcceptanceConf = clamp(a.aggregateConfidence + accSig + absorp, 0, 100);
  }
  const marketTrendConf = clamp(40 + base.dataQualityScore * 0.4, 0, 100);
  const listingSimilarityConf = clamp(base.avgSimilarity, 0, 100);
  const locationConf = base.hasLocation ? 80 : 50;
  const propertyFeaturesConf = base.hasFeatures ? 70 : 45;

  const sourceConfidence: WeightProfile = {
    officialTransactions: Math.round(officialConf),
    currentMarket: Math.round(currentMarketConf),
    marketAcceptance: Math.round(marketAcceptanceConf),
    marketTrend: Math.round(marketTrendConf),
    listingSimilarity: Math.round(listingSimilarityConf),
    location: Math.round(locationConf),
    propertyFeatures: Math.round(propertyFeaturesConf),
  };

  // ── Blend → final confidence (weighted average of source confidences) ──────
  const sources = Object.keys(weights) as (keyof WeightProfile)[];
  let blended = 0;
  const evidence: WeightEvidence[] = [];
  for (const s of sources) {
    const w = weights[s];
    if (w <= 0) continue;
    const contribution = r1((w * sourceConfidence[s]) / 100);
    blended += contribution;
    evidence.push({ label: SOURCE_LABELS[s], source: s, weight: w, sourceConfidence: sourceConfidence[s], contribution });
  }
  evidence.sort((a, b) => b.weight - a.weight);
  const finalConfidence = clamp(Math.round(blended), 10, 98);

  // ── Range: acceptance may narrow (accepting/liquid) or widen (rejecting) ───
  const ev = base.estimatedValue;
  let estimatedLow = base.lowValue;
  let estimatedHigh = base.highValue;
  let rangeAdjustment: ValuationWeightResult["rangeAdjustment"] = "unchanged";
  if (ev > 0) {
    let baseSpread = (base.highValue - base.lowValue) / (2 * ev);
    if (!Number.isFinite(baseSpread) || baseSpread <= 0) baseSpread = 0.08;
    let factor = 1;
    if (acceptanceUsable) {
      const a = acc!;
      const accepting = (a.acceptanceRate ?? 0) - (a.rejectionRate ?? 0);
      if (accepting > 0.2 && a.aggregateConfidence >= 50) {
        factor = 1 - Math.min(0.15, accepting * 0.15 * acceptanceStrength);
        rangeAdjustment = "narrowed";
      } else if ((a.rejectionRate ?? 0) > 0.4) {
        factor = 1 + Math.min(0.15, (a.rejectionRate ?? 0) * 0.15 * acceptanceStrength);
        rangeAdjustment = "widened";
      }
    }
    const spread = clamp(baseSpread * factor, 0.03, 0.2);
    estimatedLow = round(ev * (1 - spread));
    estimatedHigh = round(ev * (1 + spread));
    if (rangeAdjustment === "narrowed") notes.push("טווח ההערכה צומצם בעקבות קבלת שוק חיובית.");
    if (rangeAdjustment === "widened") notes.push("טווח ההערכה הורחב בעקבות דחיית שוק.");
  }

  return {
    profile: input.profile,
    weights, sourceConfidence, finalConfidence,
    estimatedValue: ev,        // UNCHANGED — value never altered by acceptance
    estimatedLow, estimatedHigh, rangeAdjustment,
    evidence, explanation: "", notes,
  };
}
