// ============================================================================
// ZONO — Evidence-quality models (PURE, LEAF, dependency-free, client-safe).
// ----------------------------------------------------------------------------
// The ONE canonical confidence + range + recency + dispersion model for the AVM.
// Every input is a primitive the engine already computes from REAL evidence, so
// this file has no imports and is directly unit-testable under node strip-types.
//
// Design goals (from the live QA that found HIGH/90% on CITY-tier 4-year-old
// evidence with ±5% range):
//   • Confidence must FALL for broad (city) + stale + dispersed + type-mismatched
//     evidence, and rise only for near, recent, same-type, low-dispersion evidence.
//   • Range must reflect REAL ₪/m² dispersion (not a cosmetic ±5%).
//   • Recency decays gracefully — old evidence counts less, never zero.
// Nothing here fabricates: with no evidence the caller stays on the honest
// "no valuation" path; these models only shape confidence/range when real
// comparables exist.
// ============================================================================

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/** Proximity tiers, nearest → broadest. `market` = no comparable, market baseline. */
export type EvidenceTier = "building" | "street" | "neighborhood" | "radius" | "city" | "market";
const TIER_SCORE: Record<EvidenceTier, number> = {
  building: 16, street: 13, neighborhood: 8, radius: 4, city: -2, market: -14,
};

/**
 * Graceful recency decay (0.2..1). Full weight ≤3 months, then ~3%/month, with a
 * steeper knee past 3y and a hard floor so very old deals never dominate but are
 * never deleted. Replaces the old floor-0.55 curve that let 5-year-old deals keep
 * ~55% weight.
 */
export function recencyDecay(months: number | null | undefined): number {
  if (months == null || !Number.isFinite(months) || months < 0) return 0.9;
  let w = 1 - Math.max(0, months - 3) * 0.03;
  if (months > 36) w -= (months - 36) * 0.01; // steeper knee past 3y
  return clamp(w, 0.2, 1);
}

/** Robust ₪/m² dispersion: median, p25, p75, and relative IQR (spread/median). */
export function robustDispersion(ppsqms: number[]): { median: number | null; p25: number | null; p75: number | null; relIQR: number } {
  const v = ppsqms.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return { median: null, p25: null, p75: null, relIQR: 0 };
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.floor((v.length - 1) * p)))];
  const median = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  const p25 = q(0.25), p75 = q(0.75);
  const relIQR = median > 0 ? (p75 - p25) / median : 0;
  return { median, p25, p75, relIQR };
}

export interface ConfidenceInputs {
  tier: EvidenceTier;
  comparableCount: number;
  strongCount: number;
  medianAgeMonths: number | null; // null = no dated evidence
  avgSimilarity: number;          // 0..100
  typeMatchShare: number;         // 0..1 share of used comps in subject's type family
  sourceDiversity: number;        // # distinct sources
  relIQR: number;                 // robust ₪/m² dispersion
  hasGeo: boolean;                // subject geocoded (proximity actually usable)
}

/**
 * ONE canonical confidence model (0..100). No hardcoded outcomes — every term is
 * evidence-driven. Broad/stale/dispersed/type-mismatched evidence pulls it down;
 * near/recent/same-type/tight evidence pushes it up.
 */
export function computeConfidence(f: ConfidenceInputs): number {
  let s = 22; // conservative base
  s += Math.min(22, f.strongCount * 2.5);          // strong comps are the backbone
  s += Math.min(8, f.comparableCount * 0.3);       // breadth, diminishing
  s += (clamp(f.avgSimilarity, 0, 100) / 100) * 14; // similarity
  // recency (median age of used comps)
  const a = f.medianAgeMonths;
  s += a == null ? -4 : a <= 6 ? 14 : a <= 12 ? 9 : a <= 24 ? 2 : a <= 48 ? -6 : -11;
  // proximity tier — CITY is a penalty, market fallback a heavy one
  s += TIER_SCORE[f.tier];
  // property-type match — thin same-type evidence is penalised
  s += clamp(f.typeMatchShare, 0, 1) * 12 - (f.typeMatchShare < 0.25 ? 6 : 0);
  // source diversity
  s += f.sourceDiversity >= 2 ? 3 : 0;
  // dispersion — wide ₪/m² spread means low certainty
  s -= Math.min(16, Math.max(0, f.relIQR) * 22);
  // geocoding quality (proximity trustworthy only when subject is located)
  s += f.hasGeo ? 3 : -2;
  return clamp(round(s), 5, 97);
}

export type ConfidenceBand = "high" | "medium" | "low";
export function confidenceBand(score: number): ConfidenceBand {
  return score >= 72 ? "high" : score >= 50 ? "medium" : "low";
}
/** Customer-facing Hebrew label (§23): גבוהה / בינונית / מוגבלת. */
export function confidenceLabelHe(score: number): string {
  const b = confidenceBand(score);
  return b === "high" ? "גבוהה" : b === "medium" ? "בינונית" : "מוגבלת";
}

/**
 * Range from REAL dispersion + confidence (§7). Replaces the cosmetic fixed ±5%.
 * Width grows with ₪/m² dispersion and shrinks with confidence — a HIGH-confidence
 * CITY valuation on 3× dispersion can no longer show ±5%.
 */
export function computeRange(value: number, confidence: number, relIQR: number): { low: number; high: number; spreadPct: number } {
  const dispSpread = clamp(Math.max(0, relIQR) * 0.45, 0.05, 0.22);
  const confWiden = 1 + (1 - clamp(confidence, 0, 100) / 100) * 0.5;
  const spread = clamp(dispSpread * confWiden, 0.05, 0.35);
  const roundK = (n: number) => Math.round(n / 1000) * 1000;
  return { low: roundK(value * (1 - spread)), high: roundK(value * (1 + spread)), spreadPct: Math.round(spread * 1000) / 10 };
}

const TIER_HE: Record<EvidenceTier, string> = {
  building: "באותו בניין", street: "באותו רחוב", neighborhood: "באותה שכונה",
  radius: "בסביבה הקרובה", city: "ברמת העיר", market: "ללא השוואות ישירות",
};

/**
 * Customer-facing Hebrew evidence line (§21) — one honest sentence about WHAT the
 * valuation is based on: how many comparables, sold vs asking, how near, how
 * fresh, and the confidence label. No technical engine names.
 */
export function evidenceQualityLine(f: {
  tier: EvidenceTier; comparableCount: number; sold: number; asking: number; internal: number;
  medianAgeDays: number | null; confidence: number;
}): string {
  const n = f.comparableCount;
  if (n <= 0) return `הערכה ${TIER_HE[f.tier]} · רמת ודאות ${confidenceLabelHe(f.confidence)}`;
  const parts: string[] = [`בוסס על ${n.toLocaleString("he-IL")} השוואות ${TIER_HE[f.tier]}`];
  const mix: string[] = [];
  if (f.sold) mix.push(`${f.sold.toLocaleString("he-IL")} עסקאות שנסגרו`);
  if (f.asking) mix.push(`${f.asking.toLocaleString("he-IL")} מודעות פעילות`);
  if (f.internal) mix.push(`${f.internal.toLocaleString("he-IL")} נכסי המשרד`);
  if (mix.length) parts.push(`(${mix.join(" · ")})`);
  const d = f.medianAgeDays;
  if (d != null) parts.push(d <= 120 ? "רובן מהחודשים האחרונים" : d <= 365 ? "מהשנה האחרונה" : d <= 730 ? "מהשנתיים האחרונות" : "חלקן ישנות יחסית");
  return `${parts.join(" ")} · רמת ודאות ${confidenceLabelHe(f.confidence)}`;
}

/** Evidence-quality summary persisted/reported for fallback honesty (§13). */
export interface EvidenceQuality {
  tier: EvidenceTier;
  fallbackUsed: boolean;      // tier worse than neighborhood
  comparableCount: number;
  strongCount: number;
  soldCount: number;
  askingCount: number;
  internalCount: number;
  brokerSoldCount: number;
  medianAgeDays: number | null;
  relIQR: number;
  confidence: number;
  confidenceBand: ConfidenceBand;
}
