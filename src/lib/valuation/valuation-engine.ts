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
  ConfidenceLevel, DemandLevel,
} from "./types";

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
  // rooms difference
  if (input.rooms != null && c.rooms != null) score -= Math.min(28, Math.abs(input.rooms - c.rooms) * 12);
  // size difference (%)
  if (input.builtSqm && c.sqm) {
    const diff = Math.abs(input.builtSqm - c.sqm) / input.builtSqm;
    score -= Math.min(25, diff * 60);
  }
  // floor difference
  if (input.floor != null && c.floor != null) score -= Math.min(10, Math.abs(input.floor - c.floor) * 2);
  // neighborhood match
  if (input.neighborhood && c.neighborhood) {
    if (input.neighborhood.trim() !== c.neighborhood.trim()) score -= 12;
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

/** Weighted base price per sqm from comparables (sold weighted higher than listings). */
export function computeBasePricePerSqm(
  input: ValuationInput, comparables: Comparable[], market: MarketSnapshot | null,
): { basePpsqm: number | null; avgSimilarity: number; usable: Comparable[] } {
  const usable = comparables
    .map((c) => ({ ...c, similarityScore: computeSimilarity(input, c) }))
    .filter((c) => (c.pricePerSqm ?? 0) > 0 && (c.similarityScore ?? 0) >= 25);

  if (usable.length === 0) {
    const fallback = market?.medianPricePerSqm ?? market?.avgPricePerSqm ?? null;
    return { basePpsqm: fallback, avgSimilarity: 0, usable: [] };
  }

  let wsum = 0, vsum = 0, simSum = 0;
  for (const c of usable) {
    const sim = (c.similarityScore ?? 0) / 100;
    const typeW = c.comparableType === "sold" ? 1 : 0.7;
    const w = Math.max(0.05, sim * sim * typeW); // emphasize close matches
    wsum += w;
    vsum += w * (c.pricePerSqm as number);
    simSum += c.similarityScore ?? 0;
  }
  const weighted = wsum > 0 ? vsum / wsum : null;
  return { basePpsqm: weighted, avgSimilarity: Math.round(simSum / usable.length), usable };
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
  parts.push(`שווי מוערך לנכס: ${fmt(result.estimatedValue)} (${fmt(result.estimatedPricePerSqm)} למ"ר).`);
  const pos = result.adjustments.filter((a) => a.direction === "positive").slice(0, 3).map((a) => a.label);
  const neg = result.adjustments.filter((a) => a.direction === "negative").slice(0, 3).map((a) => a.label);
  if (pos.length) parts.push(`גורמים מעלי ערך: ${pos.join(", ")}.`);
  if (neg.length) parts.push(`גורמים מורידי ערך: ${neg.join(", ")}.`);
  if (brokerSold.length > 0) parts.push(`נמצאו ${brokerSold.length} עסקאות שלך באזור — חיזוק לאמינות ההערכה.`);
  parts.push(`מחיר מומלץ לפרסום: ${fmt(result.recommendedListingPrice)}, יעד סגירה: ${fmt(result.targetClosingPrice)}.`);
  return parts.join(" ");
}

// ── Main entry ───────────────────────────────────────────────────────────────
export interface RunValuationArgs {
  input: ValuationInput;
  comparables: Comparable[];        // sold + listings, already loaded
  brokerSold: BrokerSoldProperty[];
  market?: MarketSnapshot | null;   // optional precomputed; else derived from comparables
}

export function runValuation({ input, comparables, brokerSold, market: marketIn }: RunValuationArgs): ValuationResult {
  const sold = comparables.filter((c) => c.comparableType === "sold");
  const listings = comparables.filter((c) => c.comparableType === "listing");
  const market = marketIn ?? buildMarketSnapshot(sold, listings);

  const { basePpsqm, avgSimilarity, usable } = computeBasePricePerSqm(input, comparables, market);
  const built = input.builtSqm ?? 0;
  const evidenceCount = usable.length || (market.transactionCount + market.activeListingCount);

  // No usable price evidence → honest low-confidence empty result.
  if (!basePpsqm || built <= 0) {
    const empty: ValuationResult = {
      estimatedValue: 0, lowValue: 0, highValue: 0,
      recommendedListingPrice: 0, targetClosingPrice: 0, minimumAcceptablePrice: 0,
      estimatedPricePerSqm: 0, confidenceScore: 15, confidenceLevel: "low",
      demandScore: 0, liquidityScore: 0, overpricingRiskScore: 0, daysOnMarketEstimate: 0,
      explanation: "", adjustments: [], strategies: [], market, basePpsqm: 0, evidenceCount: 0,
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

  // Confidence.
  let conf = 40;
  conf += Math.min(35, sold.length * 7);
  conf += Math.min(10, listings.length * 2);
  conf += market.dataQualityScore >= 60 ? 10 : market.dataQualityScore >= 30 ? 5 : 0;
  if (input.latitude != null && input.longitude != null) conf += 5;
  if (input.rooms != null && input.builtSqm != null) conf += 5;
  if (usable.length > 0 && avgSimilarity < 50) conf -= 10;
  if (usable.length === 0) conf = Math.min(conf, 35);
  const confidenceScore = clamp(Math.round(conf), 10, 97);
  const confidenceLevel: ConfidenceLevel = confidenceScore >= 75 ? "high" : confidenceScore >= 50 ? "medium" : "low";

  // Range widens as confidence falls.
  const spread = confidenceLevel === "high" ? 0.05 : confidenceLevel === "medium" ? 0.08 : 0.13;
  const lowValue = round(estimatedValue * (1 - spread));
  const highValue = round(estimatedValue * (1 + spread));

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
  };
  result.explanation = buildExplanation(input, result, brokerSold);
  return result;
}
