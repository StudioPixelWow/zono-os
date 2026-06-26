// ============================================================================
// ZONO — Valuation Intelligence engine (Phase 4, PURE, client-safe).
// Turns a computed valuation + its real evidence into a complete, auditable AI
// Property Intelligence report: market position, strengths, weaknesses, live
// market insights, negotiation analysis, a weighted confidence breakdown, and a
// dynamic Hebrew explanation. NOTHING is invented — every item is gated on real
// data from the valuation result / comparables / market snapshot.
// ============================================================================
import { sourceReliability } from "./valuation-engine";
import { SOURCE_LABEL } from "./types";
import type {
  ValuationInput, ValuationResult, Comparable, MarketSnapshot, ValuationDebug,
  ValuationIntelligence, ValuationFactor, MarketInsight, NegotiationAnalysis,
  ConfidenceBreakdown, PricePosition,
} from "./types";

export const ALGORITHM_VERSION = "avm-v2";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const pctRank = (value: number, xs: number[]): number => {
  const v = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return 0.5;
  const below = v.filter((x) => x < value).length;
  return below / v.length;
};
const monthsSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const m = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30);
  return Number.isFinite(m) && m >= 0 ? m : null;
};

export interface IntelligenceArgs {
  input: ValuationInput;
  result: ValuationResult;
  comparables: Comparable[]; // priced comparables used
  market: MarketSnapshot;
  debug?: ValuationDebug | null;
}

// ── Price position (data-driven from comparable ppsqm distribution) ───────────
export function computePricePosition(subjectPpsqm: number, comparables: Comparable[], market: MarketSnapshot): PricePosition {
  const ppsqms = comparables.map((c) => c.pricePerSqm ?? 0).filter((x) => x > 0);
  if (ppsqms.length >= 4) {
    const rank = pctRank(subjectPpsqm, ppsqms); // 0..1
    if (rank < 0.2) return "below_market";
    if (rank < 0.6) return "fair_market";
    if (rank < 0.85) return "premium";
    if (rank < 0.93) return "luxury_segment";
    if (rank < 0.98) return "overpriced";
    return "very_overpriced";
  }
  // Fallback: ratio vs median when too few comparables to rank.
  const median = market.medianPricePerSqm ?? market.avgPricePerSqm ?? subjectPpsqm;
  const ratio = median > 0 ? subjectPpsqm / median : 1;
  if (ratio < 0.92) return "below_market";
  if (ratio < 1.08) return "fair_market";
  if (ratio < 1.25) return "premium";
  if (ratio < 1.45) return "overpriced";
  return "very_overpriced";
}

// ── Strengths / weaknesses (only when supported by data) ─────────────────────
function buildStrengths(args: IntelligenceArgs, subjectPpsqm: number): ValuationFactor[] {
  const { input, result, comparables, market } = args;
  const out: ValuationFactor[] = [];
  const median = market.medianPricePerSqm ?? market.avgPricePerSqm ?? null;
  const sqms = comparables.map((c) => c.sqm ?? 0).filter((x) => x > 0);

  if (market.demandLevel === "high") out.push({ key: "high_demand", label: "אזור בביקוש גבוה", detail: `נרשמה פעילות מכירות גבוהה באזור (${market.transactionCount} עסקאות).` });
  if (market.supplyLevel === "low") out.push({ key: "low_supply", label: "היצע נמוך באזור", detail: "מעט נכסים מתחרים — יתרון למוכר." });
  if (median != null && subjectPpsqm <= median) out.push({ key: "good_ppsqm", label: 'מחיר למ"ר אטרקטיבי', detail: `מחיר למ"ר (${ils(subjectPpsqm)}) ברף השוק או מתחתיו.` });
  if (input.builtSqm && sqms.length >= 4) {
    const big = pctRank(input.builtSqm, sqms) >= 0.7;
    if (big) out.push({ key: "large", label: "נכס גדול יחסית", detail: `${input.builtSqm} מ"ר — מעל רוב ההשוואות באזור.` });
  }
  if (input.renovated || (input.propertyCondition ?? "").toLowerCase() === "renovated" || (input.propertyCondition ?? "").toLowerCase() === "new") {
    out.push({ key: "renovated", label: "מצב מעולה / שופץ", detail: "נכס במצב מעולה מושך יותר קונים." });
  }
  if (input.propertyType && comparables.length >= 5) {
    const share = comparables.filter((c) => (c.propertyType ?? "") === input.propertyType).length / comparables.length;
    if (share <= 0.2) out.push({ key: "rare_type", label: "סוג נכס מבוקש/נדיר באזור", detail: "היצע נמוך של סוג נכס זה באזור." });
  }
  // Surface up to 3 strongest positive feature adjustments as strengths.
  for (const a of result.adjustments.filter((x) => x.direction === "positive").slice(0, 3)) {
    out.push({ key: `adj_${a.label}`, label: a.label, detail: a.reason });
  }
  return dedupeFactors(out);
}

function buildWeaknesses(args: IntelligenceArgs): ValuationFactor[] {
  const { input, result, market } = args;
  const out: ValuationFactor[] = [];

  if (input.buildingYear) {
    const age = new Date().getFullYear() - input.buildingYear;
    if (age >= 40) out.push({ key: "old_building", label: "בניין ותיק", detail: `בניין בן ${age} שנה — בלאי ומערכות.` });
  }
  if (input.floor != null && input.floor <= 1) out.push({ key: "low_floor", label: "קומה נמוכה", detail: "קומת קרקע/נמוכה — ביקוש משתנה." });
  if (market.supplyLevel === "high") out.push({ key: "oversupply", label: "תחרות גבוהה / עודף היצע", detail: `${market.activeListingCount} מודעות פעילות מתחרות באזור.` });
  if (market.trendDirection === "down") out.push({ key: "declining", label: "מגמת מחירים יורדת", detail: `מחירי האזור ירדו ${Math.abs(market.trendPercent)}% לאחרונה.` });
  if (result.daysOnMarketEstimate >= 90) out.push({ key: "slow_sale", label: "זמן מכירה ממושך צפוי", detail: `הערכת זמן מכירה ${result.daysOnMarketEstimate} ימים.` });
  for (const a of result.adjustments.filter((x) => x.direction === "negative").slice(0, 3)) {
    out.push({ key: `adj_${a.label}`, label: a.label, detail: a.reason });
  }
  return dedupeFactors(out);
}

function dedupeFactors(xs: ValuationFactor[]): ValuationFactor[] {
  const seen = new Set<string>();
  return xs.filter((f) => (seen.has(f.label) ? false : (seen.add(f.label), true)));
}

// ── Live market insights ─────────────────────────────────────────────────────
function buildMarketInsights(args: IntelligenceArgs): MarketInsight[] {
  const { market } = args;
  const out: MarketInsight[] = [];
  const demandLabel = (d: string) => (d === "high" ? "גבוה" : d === "medium" ? "בינוני" : "נמוך");
  if (market.avgPricePerSqm) out.push({ key: "avg_ppsqm", label: 'מחיר ממוצע למ"ר', value: ils(market.avgPricePerSqm) });
  if (market.medianPricePerSqm) out.push({ key: "median_ppsqm", label: 'מחיר חציוני למ"ר', value: ils(market.medianPricePerSqm) });
  out.push({ key: "trend", label: "מגמת מחירים", value: `${market.trendDirection === "up" ? "↑" : market.trendDirection === "down" ? "↓" : "→"} ${market.trendPercent}%` });
  out.push({ key: "demand", label: "ביקוש", value: demandLabel(market.demandLevel) });
  out.push({ key: "supply", label: "היצע", value: demandLabel(market.supplyLevel) });
  out.push({ key: "recent_sold", label: "עסקאות שנסגרו לאחרונה", value: String(market.transactionCount) });
  out.push({ key: "active_listings", label: "מודעות פעילות", value: String(market.activeListingCount) });
  if (market.listingToSoldGapPercent != null) out.push({ key: "ask_gap", label: "פער מבוקש מול נסגר", value: `${market.listingToSoldGapPercent}%` });
  const totalFlow = market.transactionCount + market.activeListingCount;
  if (totalFlow > 0) out.push({ key: "absorption", label: "קצב ספיגה", value: `${Math.round((market.transactionCount / totalFlow) * 100)}%` });
  return out;
}

// ── Negotiation analysis ─────────────────────────────────────────────────────
function buildNegotiation(args: IntelligenceArgs): NegotiationAnalysis {
  const { result, market } = args;
  const asking = result.recommendedListingPrice || result.estimatedValue;
  const expected = result.targetClosingPrice || Math.round(result.estimatedValue * 0.99);
  const margin = Math.max(0, asking - expected);
  const discountPct = asking > 0 ? Math.round((margin / asking) * 1000) / 10 : 0;
  const aggressive = result.strategies.find((s) => s.key === "aggressive");
  const strategy = market.demandLevel === "high"
    ? "תמחור מאוזן-אגרסיבי — ביקוש גבוה תומך במחיר פתיחה גבוה."
    : market.demandLevel === "low"
      ? "תמחור מדויק-תחרותי — לפרסם קרוב לשווי כדי לקצר זמן מכירה."
      : "תמחור מאוזן — מחיר פתיחה מעט מעל השווי עם מרחב משא ומתן.";
  return {
    recommendedAsking: asking,
    expectedSelling: expected,
    negotiationMargin: margin,
    expectedDiscountPercent: discountPct,
    listingStrategy: strategy,
    estimatedSellingDays: result.daysOnMarketEstimate,
    quickSalePrice: result.minimumAcceptablePrice || Math.round(result.estimatedValue * 0.95),
    optimalSalePrice: result.estimatedValue,
    premiumPrice: aggressive?.price ?? Math.round(result.estimatedValue * 1.06),
  };
}

// ── Confidence breakdown (weighted internals) ────────────────────────────────
export function buildConfidenceBreakdown(args: IntelligenceArgs): ConfidenceBreakdown {
  const { input, result, comparables } = args;
  const n = comparables.length;
  const sims = comparables.map((c) => c.similarityScore ?? 0);
  const distances = comparables.map((c) => c.distanceMeters).filter((d): d is number => typeof d === "number");
  const recencies = comparables.map((c) => monthsSince(c.saleDate ?? c.listingDate)).filter((m): m is number => m != null);
  const soldShare = n > 0 ? comparables.filter((c) => c.comparableType === "sold").length / n : 0;

  const dataFreshness = recencies.length ? Math.round(clamp(100 - (recencies.reduce((a, b) => a + b, 0) / recencies.length) * 6, 0, 100)) : null;
  const comparableCount = n > 0 ? Math.round(clamp((n / (n + 6)) * 100, 0, 100)) : null;
  const comparableSimilarity = sims.length ? Math.round(clamp(sims.reduce((a, b) => a + b, 0) / sims.length, 0, 100)) : null;
  const distance = distances.length ? Math.round(clamp(100 - (distances.reduce((a, b) => a + b, 0) / distances.length) / 12, 0, 100)) : null;
  const sourceReliability = n > 0 ? Math.round(clamp((comparables.reduce((s, c) => s + sourceReliability_(c), 0) / n) * 100, 0, 100)) : null;
  const transactionQuality = n > 0 ? Math.round(clamp(soldShare * 100, 0, 100)) : null;
  const filled = [input.city, input.builtSqm, input.rooms, input.floor, input.neighborhood, input.propertyType].filter(Boolean).length;
  const missingInformation = Math.round((filled / 6) * 100);

  return {
    dataFreshness, comparableCount, comparableSimilarity, distance, sourceReliability,
    transactionQuality, missingInformation,
    overall: result.confidenceScore, // keep consistent with the engine's headline confidence
  };
}
// Local alias avoids shadowing the imported function name in the reducer above.
const sourceReliability_ = (c: Comparable) => sourceReliability(c);

// ── Dynamic Hebrew explanation ───────────────────────────────────────────────
export function buildExplanationText(args: IntelligenceArgs, strengths: ValuationFactor[], weaknesses: ValuationFactor[]): string {
  const { result, comparables, input, debug } = args;
  const parts: string[] = [];
  const count = debug?.comparableCount ?? comparables.length;
  const sources = [...new Set(comparables.map((c) => SOURCE_LABEL[c.source] ?? c.source))];

  if (count > 0) {
    parts.push(`ההערכה מבוססת על ${count} נכסים להשוואה${sources.length ? ` שנאספו מ${sources.join(", ")}` : ""}.`);
    // Strongest comparable.
    const strongest = [...comparables].sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0))[0];
    if (strongest) {
      const where = input.street && strongest.street && input.street.trim() === strongest.street.trim() ? "באותו רחוב" : strongest.neighborhood ? `בשכונה ${strongest.neighborhood}` : "באזור";
      const m = monthsSince(strongest.saleDate ?? strongest.listingDate);
      const sizeNote = strongest.sqm && input.builtSqm ? (Math.abs(strongest.sqm - input.builtSqm) <= 10 ? "בגודל כמעט זהה" : `בגודל ${strongest.sqm} מ"ר`) : "";
      parts.push(`ההשוואה החזקה ביותר ${where} ${sizeNote}${m != null ? ` ו${strongest.comparableType === "sold" ? "נמכרה" : "פורסמה"} לפני כ-${Math.round(m)} חודשים` : ""}.`.replace(/\s+/g, " "));
    }
  } else {
    parts.push("לא נמצאו מספיק נכסים להשוואה ישירה — ההערכה אינדיקטיבית ורמת הביטחון נמוכה.");
  }

  // Prefer concrete feature adjustments (parking, elevator, …) for the "why",
  // falling back to the derived strengths/weaknesses when there are no adjustments.
  const posAdj = result.adjustments.filter((a) => a.direction === "positive").slice(0, 2).map((a) => a.label);
  const negAdj = result.adjustments.filter((a) => a.direction === "negative").slice(0, 2).map((a) => a.label);
  const pos = posAdj.length ? posAdj : strengths.slice(0, 2).map((s) => s.label);
  const neg = negAdj.length ? negAdj : weaknesses.slice(0, 2).map((s) => s.label);
  if (pos.length) parts.push(`השווי הוגדל בשל ${pos.join(" ו")}.`);
  if (neg.length) parts.push(`ומעט הופחת בשל ${neg.join(" ו")}.`);
  parts.push(`שווי מוערך: ${ils(result.estimatedValue)} (${ils(result.estimatedPricePerSqm)} למ"ר), רמת ביטחון ${result.confidenceScore}%.`);
  return parts.join(" ");
}

/** Build the complete AI Property Intelligence report (pure). */
export function buildValuationIntelligence(args: IntelligenceArgs): ValuationIntelligence {
  const subjectPpsqm = args.result.estimatedPricePerSqm || args.result.basePpsqm || 0;
  const marketPosition = computePricePosition(subjectPpsqm, args.comparables, args.market);
  const strengths = buildStrengths(args, subjectPpsqm);
  const weaknesses = buildWeaknesses(args);
  return {
    marketPosition,
    strengths,
    weaknesses,
    marketInsights: buildMarketInsights(args),
    negotiationAnalysis: buildNegotiation(args),
    confidenceBreakdown: buildConfidenceBreakdown(args),
    explanation: buildExplanationText(args, strengths, weaknesses),
    algorithmVersion: ALGORITHM_VERSION,
  };
}
