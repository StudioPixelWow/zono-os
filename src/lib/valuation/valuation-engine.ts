// ============================================================================
// ZONO Price Intelligence — valuation engine (PURE, deterministic, client-safe).
// ----------------------------------------------------------------------------
// Turns a property input + real evidence (comparable sold transactions, active
// listings, the broker's own nearby sales, a market snapshot) into an indicative
// valuation with explainable adjustments, pricing strategies and a what-if model.
//
// HONESTY: every number traces to an input field or an evidence row. With no
// usable price evidence the engine returns a low-confidence result and says so
// in the Hebrew explanation — it never fabricates a price per sqm.
// ============================================================================
import type {
  Comparable, BrokerSoldProperty, ValuationInput, ValuationResult,
  ValuationAdjustment, MarketSnapshot, PricingStrategy, WhatIfPoint,
  ConfidenceLevel, DemandLevel, ValuationDebug, ValuationQualityLevel,
} from "./types";
import { typeRelation } from "./property-type";
import { canonicalNeighborhood } from "@/lib/geo/locality";
import { resolutionRank, type GeoResolution } from "@/lib/geo/address";
import {
  recencyDecay, robustDispersion, computeConfidence, computeRange,
  confidenceBand, type EvidenceTier,
} from "./evidence-quality";

/**
 * Per-source reliability (0..1) — public alias of sourceWeight, exposed so the
 * unified-comparable normalizer and QA can reference the same priority order:
 * SOLD beats ACTIVE; official/internal sources beat portals.
 */
export function sourceReliability(c: Comparable): number {
  return sourceWeight(c);
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number, step = 1000) => Math.round(n / step) * step;
const median = (xs: number[]): number | null => {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// ── Input normalization & validation ─────────────────────────────────────────
export function normalizeInput(raw: ValuationInput): ValuationInput {
  const num = (x: unknown): number | null => {
    if (x === null || x === undefined || x === "") return null;
    const n = typeof x === "string" ? Number(x.replace(/[^\d.-]/g, "")) : Number(x);
    return Number.isFinite(n) ? n : null;
  };
  return {
    ...raw,
    city: raw.city?.trim() || null,
    neighborhood: raw.neighborhood?.trim() || null,
    street: raw.street?.trim() || null,
    rooms: num(raw.rooms),
    builtSqm: num(raw.builtSqm),
    balconySqm: num(raw.balconySqm),
    gardenSqm: num(raw.gardenSqm),
    floor: num(raw.floor),
    totalFloors: num(raw.totalFloors),
    parkingCount: num(raw.parkingCount),
    buildingYear: num(raw.buildingYear),
  };
}

export interface ValidationResult { ok: boolean; errors: string[]; warnings: string[] }
export function validateInput(input: ValuationInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input.city) errors.push("יש להזין עיר.");
  if (!input.builtSqm || input.builtSqm <= 0) errors.push("יש להזין שטח בנוי במ\"ר.");
  if (!input.rooms || input.rooms <= 0) warnings.push("מספר חדרים חסר — ההערכה תהיה פחות מדויקת.");
  if (!input.neighborhood) warnings.push("שכונה חסרה — ההשוואה תתבצע ברמת העיר.");
  return { ok: errors.length === 0, errors, warnings };
}

// ── Similarity (0..100) between subject and a comparable ─────────────────────
export function computeSimilarity(input: ValuationInput, c: Comparable): number {
  let score = 100;
  // property type — a penthouse must not look like an ordinary apartment. Different
  // families are heavily down-ranked; adjacent ones mildly; unknown → no judgement.
  const rel = typeRelation(input.propertyType, c.propertyType);
  if (rel === "different") score -= 34;
  else if (rel === "adjacent") score -= 12;
  // rooms difference (strengthened: rooms are a primary comparability axis)
  if (input.rooms != null && c.rooms != null) score -= Math.min(34, Math.abs(input.rooms - c.rooms) * 15);
  // size difference (%)
  if (input.builtSqm && c.sqm) {
    const diff = Math.abs(input.builtSqm - c.sqm) / input.builtSqm;
    score -= Math.min(25, diff * 60);
  }
  // floor difference (strengthened slightly)
  if (input.floor != null && c.floor != null) score -= Math.min(12, Math.abs(input.floor - c.floor) * 2.5);
  // neighborhood match (canonical fold — spelling drift no longer counts as a miss)
  if (input.neighborhood && c.neighborhood) {
    const a = canonicalNeighborhood(input.neighborhood), b = canonicalNeighborhood(c.neighborhood);
    if (a && b && a !== b && !a.includes(b) && !b.includes(a)) score -= 12;
  }
  // distance
  if (c.distanceMeters != null) score -= Math.min(18, c.distanceMeters / 250);
  // recency (sold)
  if (c.saleDate) {
    const months = (Date.now() - new Date(c.saleDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    score -= Math.min(15, Math.max(0, months - 6) * 1.2);
  }
  // listings are weaker evidence than closed deals
  if (c.comparableType === "listing") score -= 6;
  return clamp(Math.round(score), 0, 100);
}

/**
 * Per-source confidence weight. SOLD evidence beats ACTIVE; official + internal
 * sources beat portals. Mirrors the product spec: Internal SOLD 1.00, GovMap
 * SOLD 0.95, Madlan SOLD 0.90, Madlan ACTIVE 0.80, Yad2 ACTIVE 0.70, Internal
 * ACTIVE 0.65.
 */
export function sourceWeight(c: Comparable): number {
  const sold = c.comparableType === "sold";
  switch (c.source) {
    case "zono": return sold ? 1.0 : 0.65;
    case "govmap": return sold ? 0.95 : 0.7;
    case "tax_authority": return sold ? 0.95 : 0.7;
    case "madlan": return sold ? 0.9 : 0.8;
    case "yad2": return sold ? 0.85 : 0.7;
    default: return sold ? 0.85 : 0.6;
  }
}

/** Recent evidence is worth more; graceful decay via the canonical recency model
 *  (steeper than the old floor-0.55 curve so 4-5-year-old deals can't dominate). */
function recencyWeight(c: Comparable): number {
  const d = c.saleDate ?? c.listingDate;
  if (!d) return 0.9;
  const months = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30);
  return recencyDecay(months);
}

/** Drop price-per-sqm outliers (IQR fence), but never the majority of evidence. */
function removeOutliers(comps: Comparable[]): Comparable[] {
  const xs = comps.map((c) => c.pricePerSqm as number).filter((x) => x > 0).sort((a, b) => a - b);
  if (xs.length < 6) return comps; // too few to trim safely
  const q = (p: number) => xs[Math.floor((xs.length - 1) * p)];
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const kept = comps.filter((c) => { const v = c.pricePerSqm as number; return v >= lo && v <= hi; });
  return kept.length >= Math.ceil(comps.length * 0.5) ? kept : comps;
}

/**
 * Weighted base price per sqm from ALL priced comparables. Similarity RANKS the
 * evidence (with a floor) — it never deletes it — so as long as a single priced
 * comparable exists in any source, a real base is produced (never ₪0). The base
 * blends a source/similarity/recency-weighted mean with the median for robustness.
 */
export function computeBasePricePerSqm(
  input: ValuationInput, comparables: Comparable[], market: MarketSnapshot | null,
): { basePpsqm: number | null; avgSimilarity: number; usable: Comparable[]; weightedPpsqm: number | null; medianPpsqm: number | null; outliersRemoved: number } {
  // Keep EVERY priced comparable — only similarity-rank them.
  const scored = comparables
    .map((c) => ({ ...c, similarityScore: computeSimilarity(input, c) }))
    .filter((c) => (c.pricePerSqm ?? 0) > 0);

  if (scored.length === 0) {
    // No priced comparable anywhere → last-resort market baseline (still real, not zero).
    const fallback = market?.medianPricePerSqm ?? market?.avgPricePerSqm ?? null;
    return { basePpsqm: fallback, avgSimilarity: 0, usable: [], weightedPpsqm: null, medianPpsqm: null, outliersRemoved: 0 };
  }

  // Trim ₪/m² outliers WITHIN each transaction mode separately — otherwise a flood
  // of asking listings can evict the minority sold anchor as "outliers" (AVM 3.0 §12).
  const soldScored = scored.filter((c) => c.comparableType === "sold");
  const listScored = scored.filter((c) => c.comparableType !== "sold");
  const trimmed = [...removeOutliers(soldScored), ...removeOutliers(listScored)];
  const outliersRemoved = scored.length - trimmed.length;
  // Evidentiary-hierarchy cap (AVM 3.0 §12): closed transactions must carry
  // stronger weight than asking listings. When BOTH sold and asking evidence
  // exist, the aggregate ASKING weight is capped to at most the aggregate SOLD
  // weight — so a flood of (higher, fresher) asking prices can never dominate the
  // real sold anchor. Asking is never treated as a completed sale.
  const rawW = trimmed.map((c) => {
    const sim = Math.max(0.12, (c.similarityScore ?? 0) / 100); // floor: far comps still count
    return Math.max(0.03, sim * sourceWeight(c) * recencyWeight(c));
  });
  const soldW = trimmed.reduce((s, c, i) => s + (c.comparableType === "sold" ? rawW[i] : 0), 0);
  const askW = trimmed.reduce((s, c, i) => s + (c.comparableType === "listing" ? rawW[i] : 0), 0);
  // Sold must DOMINATE, not merely tie: aggregate asking weight is capped to at
  // most half the sold weight (a 2:1 evidentiary hierarchy). With no sold evidence
  // the cap lifts and asking is used fully (still honestly labelled as asking).
  const askCap = soldW * 0.5;
  const askScale = soldW > 0 && askW > askCap ? askCap / askW : 1;
  let wsum = 0, vsum = 0, simSum = 0;
  trimmed.forEach((c, i) => {
    const w = rawW[i] * (c.comparableType === "listing" ? askScale : 1);
    wsum += w;
    vsum += w * (c.pricePerSqm as number);
    simSum += c.similarityScore ?? 0;
  });
  const weighted = wsum > 0 ? vsum / wsum : null;
  // Median anchor prefers SOLD transactions when enough exist (§12) — a real
  // closed-deal median, not an asking median — else falls back to all evidence.
  const soldPps = trimmed.filter((c) => c.comparableType === "sold").map((c) => c.pricePerSqm as number);
  const med = soldPps.length >= 5 ? median(soldPps) : median(trimmed.map((c) => c.pricePerSqm as number));
  // Blend weighted mean (65%) with median (35%) to resist skew; fall back to either.
  const base = weighted != null && med != null
    ? Math.round(0.65 * weighted + 0.35 * med)
    : (weighted ?? med ?? market?.medianPricePerSqm ?? market?.avgPricePerSqm ?? null);

  const usable = scored.sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0));
  return {
    basePpsqm: base,
    avgSimilarity: Math.round(simSum / trimmed.length),
    usable,
    weightedPpsqm: weighted != null ? Math.round(weighted) : null,
    medianPpsqm: med != null ? Math.round(med) : null,
    outliersRemoved,
  };
}

/**
 * Raw per-comparable weight used by the base-price calculation
 * (similarity × source-reliability × recency, with the same floors as the
 * engine). Exposed so the PDF/report can show the influence each comparable had.
 */
export function comparableWeight(input: ValuationInput, c: Comparable): number {
  const sim = Math.max(0.12, computeSimilarity(input, c) / 100);
  return Math.max(0.03, sim * sourceWeight(c) * recencyWeight(c));
}

/**
 * Normalized per-comparable weights (percent, summing to ~100) over a displayed
 * set — the share of the valuation each comparable contributed.
 */
export function normalizedComparableWeights(input: ValuationInput, comps: Comparable[]): number[] {
  const ws = comps.map((c) => comparableWeight(input, c));
  const sum = ws.reduce((a, b) => a + b, 0) || 1;
  return ws.map((w) => Math.round((w / sum) * 1000) / 10);
}

// ── Adjustments (% impacts on the built-area value) ──────────────────────────
export function buildAdjustments(input: ValuationInput, basePpsqm: number): ValuationAdjustment[] {
  const built = input.builtSqm ?? 0;
  const baseValue = basePpsqm * built;
  const adj: ValuationAdjustment[] = [];
  const pct = (label: string, p: number, reason: string, confidence = 0.7) => {
    if (p === 0) return;
    adj.push({
      label, direction: p > 0 ? "positive" : "negative",
      percentageImpact: Math.round(p * 1000) / 10,
      valueImpact: Math.round(baseValue * p),
      reason, confidence,
    });
  };

  // Condition / renovation
  const cond = (input.propertyCondition ?? "").toLowerCase();
  if (input.renovated || cond === "renovated") pct("שופץ", 0.04, "נכס משופץ — ערך גבוה יותר ממוצע השוק.");
  if (cond === "new") pct("חדש מקבלן", 0.06, "נכס חדש — בלאי נמוך ומפרט עדכני.");
  if (cond === "needs_work") pct("דורש שיפוץ", -0.07, "מצב הדורש שיפוץ מפחית מהערך.", 0.6);

  // Floor + elevator
  if (input.floor != null) {
    const hasElevator = input.elevator === true;
    if (input.floor === 0) pct("קומת קרקע", -0.02, "קומת קרקע — ביקוש משתנה.", 0.55);
    else if (input.floor >= 3 && !hasElevator) pct("קומה גבוהה ללא מעלית", -0.05, "קומה גבוהה ללא מעלית פוגעת בנגישות.", 0.6);
    else if (input.floor >= 3 && hasElevator) pct("קומה גבוהה עם מעלית", 0.02, "קומה גבוהה עם מעלית — נוף ושקט.");
  }
  if (input.elevator === true && (input.floor ?? 0) >= 2) pct("מעלית", 0.02, "קיום מעלית מעלה את הביקוש.");

  // Parking
  if (input.parkingCount && input.parkingCount > 0) {
    const p = Math.min(2, input.parkingCount) * 0.03;
    pct("חניה", p, `${input.parkingCount} חניות — נכס מבוקש יותר.`);
  }
  // Safe room / storage
  if (input.mamad) pct('ממ"ד', 0.025, 'קיום ממ"ד מעלה ערך ובטיחות.');
  if (input.storage) pct("מחסן", 0.01, "מחסן צמוד — יתרון אחסון.");

  // View
  const view = (input.viewQuality ?? "").toLowerCase();
  if (view === "open") pct("נוף פתוח", 0.04, "נוף פתוח — מאפיין מבוקש מאוד.");
  else if (view === "partial") pct("נוף חלקי", 0.015, "נוף חלקי — יתרון מתון.");

  // Noise
  const noise = (input.noiseLevel ?? "").toLowerCase();
  if (noise === "quiet") pct("סביבה שקטה", 0.015, "מיקום שקט — ביקוש משפחתי.");
  else if (noise === "busy") pct("חשיפה לרעש/כביש ראשי", -0.03, "חשיפה לכביש ראשי/רעש מפחיתה מהערך.", 0.6);

  // Building age
  if (input.buildingYear) {
    const age = new Date().getFullYear() - input.buildingYear;
    if (age <= 5) pct("בניין חדש", 0.03, "בניין חדש יחסית — תחזוקה ומפרט.");
    else if (age >= 40 && !input.renovated) pct("בניין ותיק", -0.06, `בניין בן ${age} שנה — בלאי ומערכות.`, 0.6);
    else if (age >= 20 && !input.renovated) pct("גיל בניין", -0.03, `בניין בן ${age} שנה.`, 0.6);
  }

  return adj;
}

// ── Area extras (balcony / garden) → ₪ additions ─────────────────────────────
function areaExtras(input: ValuationInput, ppsqm: number): ValuationAdjustment[] {
  const out: ValuationAdjustment[] = [];
  if (input.balconySqm && input.balconySqm > 0) {
    const v = Math.round(input.balconySqm * ppsqm * 0.4);
    out.push({ label: "מרפסת", direction: "positive", valueImpact: v, percentageImpact: 0, reason: `${input.balconySqm} מ"ר מרפסת (≈40% משווי מ"ר).`, confidence: 0.65 });
  }
  if (input.gardenSqm && input.gardenSqm > 0) {
    const v = Math.round(input.gardenSqm * ppsqm * 0.3);
    out.push({ label: "גינה", direction: "positive", valueImpact: v, percentageImpact: 0, reason: `${input.gardenSqm} מ"ר גינה (≈30% משווי מ"ר).`, confidence: 0.6 });
  }
  return out;
}

// ── Market snapshot from raw evidence ────────────────────────────────────────
export function buildMarketSnapshot(sold: Comparable[], listings: Comparable[]): MarketSnapshot {
  const soldPpsqm = sold.map((c) => c.pricePerSqm ?? 0);
  const listPpsqm = listings.map((c) => c.pricePerSqm ?? 0);
  const avg = (xs: number[]) => { const v = xs.filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const avgSold = avg(soldPpsqm);
  const medSold = median(soldPpsqm);
  const avgList = avg(listPpsqm);

  // Demand from sold velocity; supply from active listing volume — relative bands.
  const txCount = sold.length;
  const listCount = listings.length;
  const demand: DemandLevel = txCount >= 12 ? "high" : txCount >= 5 ? "medium" : "low";
  const supply: DemandLevel = listCount >= 15 ? "high" : listCount >= 6 ? "medium" : "low";

  // Trend: compare recent-6mo sold avg vs older sold avg (real, if dated).
  const now = Date.now();
  const recent = sold.filter((c) => c.saleDate && (now - new Date(c.saleDate).getTime()) < 1000 * 60 * 60 * 24 * 183).map((c) => c.pricePerSqm ?? 0);
  const older = sold.filter((c) => c.saleDate && (now - new Date(c.saleDate).getTime()) >= 1000 * 60 * 60 * 24 * 183).map((c) => c.pricePerSqm ?? 0);
  const ar = avg(recent), ao = avg(older);
  let trendPercent = 0;
  if (ar && ao) trendPercent = Math.round(((ar - ao) / ao) * 1000) / 10;
  const trendDirection: MarketSnapshot["trendDirection"] = trendPercent > 1 ? "up" : trendPercent < -1 ? "down" : "flat";

  // Listing-to-sold gap (asking premium over closed).
  let gap: number | null = null;
  if (avgList && avgSold) gap = Math.round(((avgList - avgSold) / avgSold) * 1000) / 10;

  // Data quality from breadth of dated, priced evidence.
  const dq = clamp(Math.round(txCount * 5 + listCount * 2 + (medSold ? 15 : 0) + (recent.length ? 10 : 0)), 0, 100);

  return {
    avgPricePerSqm: avgSold ? Math.round(avgSold) : null,
    medianPricePerSqm: medSold ? Math.round(medSold) : null,
    transactionCount: txCount,
    activeListingCount: listCount,
    demandLevel: demand,
    supplyLevel: supply,
    trendDirection,
    trendPercent,
    listingToSoldGapPercent: gap,
    dataQualityScore: dq,
  };
}

// ── Pricing strategies ───────────────────────────────────────────────────────
function buildStrategies(estimated: number, demand: DemandLevel): PricingStrategy[] {
  const demandLift = demand === "high" ? 0.06 : demand === "medium" ? 0.04 : 0.025;
  const base = (mult: number) => round(estimated * (1 + mult));
  const prob = (mult: number) => clamp(Math.round(86 - mult * 320 - (demand === "low" ? 8 : 0)), 30, 92);
  const dom = (mult: number) => Math.round(35 + mult * 700 + (demand === "low" ? 20 : 0));
  return [
    { key: "conservative", label: "שמרני", price: base(0.01), saleProbability: prob(0.01), daysOnMarket: dom(0.01), risk: "נמוך" },
    { key: "balanced", label: "מאוזן", price: base(demandLift), saleProbability: prob(demandLift), daysOnMarket: dom(demandLift), risk: "מאוזן", recommended: true },
    { key: "aggressive", label: "אגרסיבי", price: base(demandLift + 0.06), saleProbability: prob(demandLift + 0.06), daysOnMarket: dom(demandLift + 0.06), risk: "גבוה" },
  ];
}

/** What-if: probability/days/risk for any asking price relative to estimated value. */
export function computeWhatIf(price: number, estimated: number, demand: DemandLevel): WhatIfPoint {
  const ratio = estimated > 0 ? price / estimated : 1;
  // logistic around fair value: at ratio 1.0 ~ high probability, decays as you over-ask.
  const k = 9;
  const prob = clamp(Math.round(100 / (1 + Math.exp(k * (ratio - 1.04))) - (demand === "low" ? 6 : 0)), 8, 95);
  const days = clamp(Math.round(30 + (ratio - 1) * 900 + (demand === "low" ? 25 : demand === "high" ? -5 : 0)), 14, 240);
  const band = (n: number): DemandLevel => (n >= 67 ? "high" : n >= 40 ? "medium" : "low");
  return {
    price,
    saleProbability: prob,
    daysOnMarket: days,
    negotiationRisk: band(100 - prob),
    buyerDemand: demand,
    competitionLevel: band(100 - prob), // higher ask vs market → more competition pressure
  };
}

// ── Hebrew explanation ───────────────────────────────────────────────────────
function buildExplanation(
  input: ValuationInput, result: Omit<ValuationResult, "explanation">, brokerSold: BrokerSoldProperty[],
): string {
  const m = result.market;
  const parts: string[] = [];
  const fmt = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
  if (result.evidenceCount > 0) {
    parts.push(`ההערכה מבוססת על ${result.evidenceCount} עסקאות ומודעות פעילות באזור${input.neighborhood ? ` (${input.neighborhood})` : ""}.`);
  } else {
    parts.push("לא נמצאו מספיק עסקאות ומודעות להשוואה ישירה — ההערכה אינדיקטיבית בלבד ורמת הביטחון נמוכה.");
  }
  if (m.medianPricePerSqm) parts.push(`מחיר חציוני למ"ר באזור: ${fmt(m.medianPricePerSqm)}.`);
  // Never state a ₪0 price in prose — only describe a value when one exists.
  if (result.estimatedValue > 0) {
    parts.push(`שווי מוערך לנכס: ${fmt(result.estimatedValue)} (${fmt(result.estimatedPricePerSqm)} למ"ר).`);
  }
  const pos = result.adjustments.filter((a) => a.direction === "positive").slice(0, 3).map((a) => a.label);
  const neg = result.adjustments.filter((a) => a.direction === "negative").slice(0, 3).map((a) => a.label);
  if (pos.length) parts.push(`גורמים מעלי ערך: ${pos.join(", ")}.`);
  if (neg.length) parts.push(`גורמים מורידי ערך: ${neg.join(", ")}.`);
  if (brokerSold.length > 0) parts.push(`נמצאו ${brokerSold.length} עסקאות שלך באזור — חיזוק לאמינות ההערכה.`);
  if (result.estimatedValue > 0) {
    parts.push(`מחיר מומלץ לפרסום: ${fmt(result.recommendedListingPrice)}, יעד סגירה: ${fmt(result.targetClosingPrice)}.`);
  }
  return parts.join(" ");
}

// ── Main entry ───────────────────────────────────────────────────────────────
export interface RunValuationArgs {
  input: ValuationInput;
  comparables: Comparable[];        // sold + listings, already loaded
  brokerSold: BrokerSoldProperty[];
  market?: MarketSnapshot | null;   // optional precomputed; else derived from comparables
}

/**
 * Merge the same property appearing across sources into one comparable, keeping
 * the highest-confidence source (SOLD > ACTIVE, official/internal > portal).
 */
export function dedupeComparables(comparables: Comparable[]): Comparable[] {
  const keep = new Map<string, Comparable>();
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  let anon = 0;
  for (const c of comparables) {
    // IDENTITY (fixed — the old fingerprint over-merged DISTINCT sold deals that
    // merely shared neighborhood/rooms/sqm/floor when street was null). A real
    // transaction is a unique EVENT: its price + date make it distinct. We only
    // collapse rows that share the SAME transaction identity — same physical
    // fingerprint AND same price AND same date — which is what a genuine cross-
    // provider duplicate looks like. Two different sold deals are never merged.
    const fp = `${c.comparableType}:${norm(c.street)}:${norm(c.neighborhood)}:${c.rooms ?? "?"}:${c.sqm ?? "?"}:${c.floor ?? "?"}:${c.price ?? "?"}:${norm(c.saleDate ?? c.listingDate)}`;
    // Prefer a real per-row id when the address fingerprint is too thin to be safe
    // (no street AND no date) — otherwise fall back to the transaction fingerprint.
    const hasFp = !!(norm(c.street) || norm(c.saleDate) || norm(c.listingDate));
    const key = hasFp ? fp : `id:${c.source}:${c.externalId ?? `anon${anon++}`}`;
    const prev = keep.get(key);
    if (!prev) { keep.set(key, c); continue; }
    // Prefer SOLD, then higher source weight; merge missing fields from the loser.
    const better = (c.comparableType === "sold" && prev.comparableType !== "sold")
      || (c.comparableType === prev.comparableType && sourceWeight(c) > sourceWeight(prev));
    const winner = better ? c : prev;
    const loser = better ? prev : c;
    keep.set(key, {
      ...winner,
      sqm: winner.sqm ?? loser.sqm, rooms: winner.rooms ?? loser.rooms,
      floor: winner.floor ?? loser.floor, buildingYear: winner.buildingYear ?? loser.buildingYear,
      neighborhood: winner.neighborhood ?? loser.neighborhood, street: winner.street ?? loser.street,
      pricePerSqm: winner.pricePerSqm ?? loser.pricePerSqm, imageUrl: winner.imageUrl ?? loser.imageUrl,
    });
  }
  return [...keep.values()];
}

// ── Proximity search ladder (Phase 1) ────────────────────────────────────────
// Comparables are collected city-wide, then NARROWED to the closest geography
// that still yields enough evidence: same building → street → neighborhood →
// 300m → 700m → whole city. We stop expanding once `minNeeded` comparables are
// available, so a valuation always prefers the nearest real evidence — but never
// returns nothing: if no tier reaches the threshold, the full city set is used.
export const PROXIMITY_TIERS = ["building", "street", "neighborhood", "r300", "r700", "city"] as const;
export type ProximityTier = (typeof PROXIMITY_TIERS)[number];

const eqText = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Smallest (closest) tier a comparable belongs to relative to the subject.
 *  AVM 3.2 §9 — distance tiers are CAPPED by the coordinate's precision: only a
 *  ROOFTOP coordinate can claim "same building"; a STREET-level coordinate reaches
 *  at most the street/≤300m/≤700m distance tiers; a coarser coordinate (already
 *  nulled to distanceMeters by the providers) reaches only text-based tiers. This
 *  prevents a street-centroid or city-centroid from being read as "same building". */
export function proximityTier(input: ValuationInput, c: Comparable): ProximityTier {
  const d = c.distanceMeters;
  // AVM 3.3 — a distance tier requires BOTH the subject AND the comparable to have a
  // sufficiently precise coordinate. A subject with a city/neighborhood/unknown
  // coordinate can NOT reach ≤300m/≤700m/street/building (its own distance would be
  // meaningless), regardless of the comparable's precision. Text tiers stay open.
  const subjRank = resolutionRank(input.locationResolution as GeoResolution | null);
  const subjPreciseStreet = subjRank >= resolutionRank("STREET");
  const subjRooftop = subjRank >= resolutionRank("ROOFTOP");
  const compRooftop = resolutionRank(c.geocodeResolution as GeoResolution | null) >= resolutionRank("ROOFTOP");
  if (d != null && d <= 30 && compRooftop && subjRooftop) return "building";
  if (eqText(input.street, c.street) || (d != null && d <= 120 && subjPreciseStreet)) return "street";
  const sn = canonicalNeighborhood(input.neighborhood), cn = canonicalNeighborhood(c.neighborhood);
  if (sn && cn && (sn === cn || sn.includes(cn) || cn.includes(sn))) return "neighborhood";
  if (d != null && d <= 300 && subjPreciseStreet) return "r300";
  if (d != null && d <= 700 && subjPreciseStreet) return "r700";
  return "city";
}

/**
 * Return the closest-tier subset of comparables that together reach `minNeeded`,
 * expanding tier-by-tier. Never returns fewer than what exists: if even the full
 * city set is below the threshold, every comparable is returned.
 */
export function selectByProximityLadder(
  input: ValuationInput, comparables: Comparable[], minNeeded = 6,
): { selected: Comparable[]; tier: ProximityTier; counts: Record<ProximityTier, number> } {
  const counts = { building: 0, street: 0, neighborhood: 0, r300: 0, r700: 0, city: 0 } as Record<ProximityTier, number>;
  const byTier = new Map<ProximityTier, Comparable[]>();
  for (const t of PROXIMITY_TIERS) byTier.set(t, []);
  for (const c of comparables) { const t = proximityTier(input, c); counts[t]++; byTier.get(t)!.push(c); }

  const selected: Comparable[] = [];
  let reached: ProximityTier = "city";
  for (const t of PROXIMITY_TIERS) {
    selected.push(...byTier.get(t)!);
    reached = t;
    if (selected.length >= minNeeded) break;
  }
  // If even the whole city set is short, we still return all of it (never empty).
  return { selected: selected.length ? selected : comparables, tier: reached, counts };
}

/** Quality band from data breadth + confidence (insufficient when unavailable). */
export function valuationQuality(available: boolean, confidenceScore: number, usableCount: number): ValuationQualityLevel {
  if (!available) return "insufficient";
  if (usableCount === 0) return "low"; // produced only from a market baseline
  if (confidenceScore >= 75) return "high";
  if (confidenceScore >= 50) return "medium";
  return "low";
}

/** Which inputs/evidence are missing when a valuation cannot be produced. */
export function buildMissingData(input: ValuationInput, hasPricedComparables: boolean): string[] {
  const missing: string[] = [];
  if (!input.city) missing.push("עיר");
  if (!input.builtSqm || input.builtSqm <= 0) missing.push('שטח בנוי במ"ר');
  if (!hasPricedComparables) missing.push("עסקאות/מודעות להשוואה באזור");
  if (!input.rooms) missing.push("מספר חדרים");
  return missing;
}

/** Hebrew next-step recommendation when a valuation cannot be produced. */
export function recommendedActionFor(missingData: string[]): string {
  if (missingData.includes("עסקאות/מודעות להשוואה באזור")) {
    return "להריץ סריקת עסקאות ומודעות לאזור (GovMap / Madlan / יד2) ולאחר מכן לחשב מחדש.";
  }
  if (missingData.some((m) => m.includes("שטח בנוי") || m === "עיר")) {
    return "להשלים את פרטי הנכס החסרים (עיר ושטח בנוי) ולחשב מחדש.";
  }
  return "להשלים נתונים חסרים ולחשב מחדש.";
}

export function runValuation({ input, comparables: rawComparables, brokerSold, market: marketIn }: RunValuationArgs): ValuationResult {
  // Normalize: derive price-per-sqm from price/sqm when a source omitted it, so
  // no priced comparable is wasted. Then unify ALL sources → dedupe.
  const normalized = rawComparables.map((c) => {
    const ppsqm = (c.pricePerSqm ?? 0) > 0
      ? c.pricePerSqm
      : (c.price && c.sqm && c.sqm > 0 ? Math.round(c.price / c.sqm) : c.pricePerSqm);
    return ppsqm === c.pricePerSqm ? c : { ...c, pricePerSqm: ppsqm };
  });
  const comparables = dedupeComparables(normalized.filter((c) => (c.pricePerSqm ?? 0) > 0));
  const sold = comparables.filter((c) => c.comparableType === "sold");
  const listings = comparables.filter((c) => c.comparableType === "listing");
  const market = marketIn ?? buildMarketSnapshot(sold, listings);

  // Narrow to the closest geography that still has enough evidence (building →
  // street → neighborhood → 300m → 700m → city). Pricing then prefers nearby
  // comparables; the full set remains available if no tier reaches the threshold.
  const ladder = selectByProximityLadder(input, comparables, 6);
  const work = ladder.selected;

  const { basePpsqm, avgSimilarity, usable, weightedPpsqm, medianPpsqm, outliersRemoved } = computeBasePricePerSqm(input, work, market);
  const built = input.builtSqm ?? 0;
  const evidenceCount = usable.length || (market.transactionCount + market.activeListingCount);

  // ── Evidence-quality metrics over the comparables that actually set the price ──
  const nowMsQ = Date.now();
  const ageMonths = (c: Comparable): number | null => {
    const d = c.saleDate ?? c.listingDate; if (!d) return null;
    const m = (nowMsQ - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30);
    return Number.isFinite(m) && m >= 0 ? m : null;
  };
  const disp = robustDispersion(usable.map((c) => c.pricePerSqm as number));
  const strongComparableCount = usable.filter((c) => (c.similarityScore ?? 0) >= 70).length;
  const usableAges = usable.map(ageMonths).filter((m): m is number => m != null).sort((a, b) => a - b);
  const medianAgeMonths = usableAges.length ? usableAges[Math.floor((usableAges.length - 1) / 2)] : null;
  const typeMatchShare = usable.length
    ? usable.reduce((s, c) => { const r = typeRelation(input.propertyType, c.propertyType); return s + (r === "same" ? 1 : r === "adjacent" ? 0.5 : 0); }, 0) / usable.length
    : 0;
  const sourceDiversity = new Set(usable.map((c) => c.source)).size;
  const hasGeo = input.latitude != null && input.longitude != null;
  // Map the ladder tier (building/street/neighborhood/r300/r700/city) → evidence tier.
  const evidenceTier: EvidenceTier = usable.length === 0 ? "market"
    : ladder.tier === "r300" || ladder.tier === "r700" ? "radius"
      : (ladder.tier as EvidenceTier);
  const sourceMix = {
    sold: usable.filter((c) => c.comparableType === "sold" && c.source !== "zono").length,
    asking: usable.filter((c) => c.comparableType === "listing" && c.source !== "zono").length,
    internal: usable.filter((c) => c.source === "zono").length,
    brokerSold: 0,
  };

  // QA / debug metadata (returned with every result; also logged).
  const priced = comparables.filter((c) => (c.pricePerSqm ?? 0) > 0);
  const soldCount = priced.filter((c) => c.comparableType === "sold").length;
  const activeCount = priced.length - soldCount;
  const sourcesUsed = [...new Set(priced.map((c) => c.source))];
  const reasonCodes: string[] = [];
  if (!basePpsqm) reasonCodes.push("no_priced_comparables");
  if (built <= 0) reasonCodes.push("missing_built_sqm");
  if (basePpsqm && built > 0) {
    reasonCodes.push("ok");
    if (usable.length === 0) reasonCodes.push("market_baseline_only");
    if (soldCount === 0 && activeCount > 0) reasonCodes.push("only_active_listings");
    if (evidenceTier === "city") reasonCodes.push("city_tier_fallback");
    if (medianAgeMonths != null && medianAgeMonths > 24) reasonCodes.push("stale_evidence");
    if (usable.length > 0 && typeMatchShare < 0.35) reasonCodes.push("low_type_match");
  }
  const debug: ValuationDebug = {
    comparableCount: priced.length,
    soldComparableCount: soldCount,
    activeComparableCount: activeCount,
    sourcesUsed,
    fallbackLevel: ladder.tier,
    avgPricePerSqm: market.avgPricePerSqm,
    medianPricePerSqm: medianPpsqm ?? market.medianPricePerSqm,
    weightedPricePerSqm: weightedPpsqm,
    outliersRemoved,
    confidenceScore: 0, // filled below
    reasonCodes,
    // Fallback-honesty fields (§13) — persisted so UI/intelligence can be honest.
    evidenceTier,
    strongComparableCount,
    medianComparableAgeDays: medianAgeMonths != null ? Math.round(medianAgeMonths * 30) : null,
    dispersionRelIqr: Math.round(disp.relIQR * 1000) / 1000,
    sourceMix,
  };

  // Diagnostics — why a valuation could/couldn't be produced.
  if (typeof console !== "undefined") {
    console.info("[valuation]", {
      ...debug,
      internalComparables: priced.filter((c) => c.source === "zono").length,
      externalComparables: priced.filter((c) => c.source !== "zono").length,
      avgSimilarity, evidenceCount, builtSqm: built, usedComparables: work.length,
      proximityCounts: ladder.counts,
    });
  }

  // No usable price evidence → honest result that NEVER pretends a ₪0 valuation.
  if (!basePpsqm || built <= 0) {
    const missingData = buildMissingData(input, priced.length > 0);
    const empty: ValuationResult = {
      estimatedValue: 0, lowValue: 0, highValue: 0,
      recommendedListingPrice: 0, targetClosingPrice: 0, minimumAcceptablePrice: 0,
      estimatedPricePerSqm: 0, confidenceScore: 15, confidenceLevel: "low",
      demandScore: 0, liquidityScore: 0, overpricingRiskScore: 0, daysOnMarketEstimate: 0,
      explanation: "", adjustments: [], strategies: [], market, basePpsqm: 0, evidenceCount: 0,
      valuationAvailable: false,
      valuationQuality: "insufficient",
      unavailableReason: !basePpsqm
        ? "לא נמצאו עסקאות או מודעות עם מחיר להשוואה — לא ניתן להפיק הערכת שווי אמינה."
        : 'חסר שטח בנוי במ"ר — לא ניתן לחשב שווי.',
      missingData,
      recommendedAction: recommendedActionFor(missingData),
      debug: { ...debug, confidenceScore: 15 },
    };
    empty.explanation = buildExplanation(input, empty, brokerSold);
    return empty;
  }

  // Adjustments → subject ppsqm.
  const pctAdj = buildAdjustments(input, basePpsqm);
  const totalPct = pctAdj.reduce((s, a) => s + (a.direction === "positive" ? a.percentageImpact : -a.percentageImpact), 0) / 100;
  const subjectPpsqm = Math.round(basePpsqm * (1 + totalPct));
  const builtValue = subjectPpsqm * built;

  // Area extras as ₪ additions.
  const extras = areaExtras(input, subjectPpsqm);
  const extrasValue = extras.reduce((s, a) => s + a.valueImpact, 0);
  const adjustments = [...pctAdj, ...extras];

  const estimatedValue = round(builtValue + extrasValue);

  // Confidence — ONE canonical, evidence-calibrated model (§6). Broad (city) +
  // stale + dispersed + type-mismatched evidence pulls it down; near/recent/same-
  // type/tight evidence pushes it up. No hardcoded outcomes.
  let confidenceScore = usable.length === 0
    ? clamp(Math.min(35, Math.round(market.dataQualityScore * 0.3) + 10), 5, 35) // market-baseline-only cap
    : computeConfidence({
        tier: evidenceTier,
        comparableCount: usable.length,
        strongCount: strongComparableCount,
        medianAgeMonths,
        avgSimilarity,
        typeMatchShare,
        sourceDiversity,
        relIQR: disp.relIQR,
        hasGeo,
      });
  // SOLD-ANCHOR SAFETY (AVM 3.2 acceptance — proven defect): when the proximity
  // ladder narrows to a working set with NO closed transactions (e.g. a geocoded
  // subject whose nearest tier holds only active listings), the §12 sold-cap has
  // nothing to anchor to and asking prices drive the whole estimate. Such an
  // asking-only result must never read as high confidence — cap it to medium and
  // widen the range, so nearby asking can never overpower (absent) sold evidence.
  const soldInUsable = usable.filter((c) => c.comparableType === "sold").length;
  if (soldInUsable === 0 && usable.length > 0) {
    confidenceScore = Math.min(confidenceScore, 55);
    if (!reasonCodes.includes("only_active_listings")) reasonCodes.push("only_active_listings");
    reasonCodes.push("asking_only_no_sold_anchor");
  }
  const confidenceLevel: ConfidenceLevel = confidenceBand(confidenceScore);

  // Range from REAL ₪/m² dispersion + confidence (§7) — no cosmetic fixed ±5%.
  const rng = computeRange(estimatedValue, confidenceScore, disp.relIQR);
  const lowValue = rng.low;
  const highValue = rng.high;

  // Demand / liquidity / overpricing / DOM.
  const demandScore = clamp(Math.round(
    (market.demandLevel === "high" ? 75 : market.demandLevel === "medium" ? 55 : 35) +
    (market.trendDirection === "up" ? 10 : market.trendDirection === "down" ? -10 : 0),
  ), 0, 100);
  const liquidityScore = clamp(Math.round(
    market.transactionCount * 4 - (market.supplyLevel === "high" ? 12 : 0) + (market.demandLevel === "high" ? 15 : 0) + 30,
  ), 0, 100);
  const overpricingRiskScore = clamp(Math.round(
    (market.listingToSoldGapPercent ?? 4) * 3 + (market.supplyLevel === "high" ? 20 : market.supplyLevel === "medium" ? 8 : 0) + (market.demandLevel === "low" ? 15 : 0),
  ), 0, 100);
  const daysOnMarketEstimate = clamp(Math.round(45 + (market.demandLevel === "low" ? 30 : market.demandLevel === "high" ? -12 : 0) + (market.supplyLevel === "high" ? 18 : 0)), 18, 180);

  // Prices.
  const strategies = buildStrategies(estimatedValue, market.demandLevel);
  const balanced = strategies.find((s) => s.recommended)!;
  const recommendedListingPrice = balanced.price;
  const targetClosingPrice = round(estimatedValue * (market.demandLevel === "high" ? 1.0 : 0.99));
  const minimumAcceptablePrice = round(estimatedValue * 0.95);

  const result: ValuationResult = {
    estimatedValue, lowValue, highValue,
    recommendedListingPrice, targetClosingPrice, minimumAcceptablePrice,
    estimatedPricePerSqm: subjectPpsqm,
    confidenceScore, confidenceLevel,
    demandScore, liquidityScore, overpricingRiskScore, daysOnMarketEstimate,
    explanation: "", adjustments, strategies, market,
    basePpsqm: Math.round(basePpsqm), evidenceCount,
    valuationAvailable: true,
    valuationQuality: valuationQuality(true, confidenceScore, usable.length),
    unavailableReason: null,
    missingData: [],
    recommendedAction: null,
    debug: { ...debug, confidenceScore },
  };
  result.explanation = buildExplanation(input, result, brokerSold);
  return result;
}
