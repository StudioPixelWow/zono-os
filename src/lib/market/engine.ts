/**
 * Market heatmap & pricing intelligence — pure, deterministic, client-safe.
 * No server imports, no LLM. Demand / supply / opportunity scoring + heat level.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type HeatLevel = "hot" | "warm" | "opportunity" | "cool" | "cold";

export interface DemandInput {
  activeBuyers: number;
  avgBuyerReadiness: number; // 0..100
  avgBuyerEngagement: number; // 0..100
  matchedBuyers: number;
  relationshipSignals: number; // viewed + liked + visited count
}

export interface SupplyInput {
  externalListings: number;
  internalProperties: number;
  newListings: number; // first seen in last 7d
  priceDrops: number;
  duplicates: number;
  privateOwners: number;
}

export interface OpportunityInput {
  demand: number; // 0..100
  supply: number; // 0..100
  belowAverage: number;
  priceDrops: number;
  readyBuyers: number; // buyers with readiness >= 70
  officeExclusiveCount: number;
}

/** 0..100 — how much buyer demand exists in this locality. */
export function calculateDemandScore(i: DemandInput): number {
  let s = 0;
  s += Math.min(35, i.activeBuyers * 9); // active buyers are the core driver
  s += i.avgBuyerReadiness * 0.2;
  s += i.avgBuyerEngagement * 0.15;
  s += Math.min(20, i.matchedBuyers * 7);
  s += Math.min(15, i.relationshipSignals * 3);
  return clamp(s);
}

/** 0..100 — how much inventory/supply pressure exists. */
export function calculateSupplyScore(i: SupplyInput): number {
  let s = 0;
  s += Math.min(40, (i.externalListings + i.internalProperties) * 2.5);
  s += Math.min(20, i.newListings * 5);
  s += Math.min(15, i.priceDrops * 5); // price drops = softening supply
  s += Math.min(15, i.privateOwners * 4);
  s += Math.min(10, i.duplicates * 3);
  return clamp(s);
}

/** 0..100 — agent opportunity: demand high + supply low + cheap/ready signals. */
export function calculateOpportunityScore(i: OpportunityInput): number {
  let s = 15;
  const gap = i.demand - i.supply; // demand outstrips supply → opportunity
  if (gap > 0) s += Math.min(30, gap * 0.4);
  s += Math.min(20, i.belowAverage * 5);
  s += Math.min(15, i.priceDrops * 4);
  s += Math.min(15, i.readyBuyers * 6);
  s += Math.min(10, i.officeExclusiveCount * 4);
  return clamp(s);
}

/** Heat level from the three scores. */
export function calculateHeatLevel(demand: number, supply: number, opportunity: number): HeatLevel {
  if (opportunity >= 70) return "opportunity";
  if (demand >= 70 && supply <= 55) return "hot";
  if (demand >= 50) return "warm";
  if (demand >= 30) return "cool";
  return "cold";
}

/** Map heat level → the dashboard Tone palette (green/gold/red/purple/blue). */
export const HEAT_TONE: Record<HeatLevel, "green" | "gold" | "red" | "purple" | "blue"> = {
  hot: "green",
  warm: "gold",
  opportunity: "purple",
  cool: "blue",
  cold: "red",
};

export const HEAT_LABEL: Record<HeatLevel, string> = {
  hot: "ביקוש גבוה",
  warm: "יציב",
  opportunity: "הזדמנות",
  cool: "ביקוש מתון",
  cold: "ביקוש נמוך",
};

// ============================================================================
// PHASE 25.1 — Locality Intelligence model (pure, traceable). Every score is a
// deterministic function of REAL counted inputs. No randomness, no decoration.
// ============================================================================

/** INVENTORY: balance/scarcity health. High inventory pressure → lower score. */
export interface InventoryInput {
  externalListings: number;
  internalProperties: number;
  newListings: number; // first seen in last 7d (growth)
  priceDrops: number;  // softening = more effective supply
}
export function calculateInventoryScore(i: InventoryInput): number {
  const listings = i.externalListings + i.internalProperties;
  let s = 100;
  s -= Math.min(45, listings * 2);     // more inventory → more supply pressure
  s -= Math.min(20, i.newListings * 4); // listing growth → pressure
  s -= Math.min(12, i.priceDrops * 2);  // price drops → softening
  return clamp(s);
}

/** TRANSACTION: real closed-deal volume + velocity + trend (real tx only). */
export interface TransactionInput {
  tx90: number;       // transactions in last 90 days
  txPrev90: number;   // transactions in the preceding 90 days
  txTotal: number;    // all known transactions in locality
}
export function calculateTransactionScore(i: TransactionInput): number {
  if (i.tx90 === 0 && i.txTotal === 0) return 0; // no real transactions → 0, never invented
  let s = 12;
  s += Math.min(45, i.tx90 * 4);                 // volume
  if (i.tx90 > i.txPrev90) s += Math.min(25, (i.tx90 - i.txPrev90) * 4);       // accelerating
  else if (i.tx90 < i.txPrev90) s -= Math.min(20, (i.txPrev90 - i.tx90) * 3);  // cooling
  s += Math.min(15, i.txTotal * 0.5);            // depth
  return clamp(s);
}

/** MOMENTUM: trend vs the previous snapshot. 50 = stable. */
export type MomentumClass = "declining" | "stable" | "growing" | "accelerating";
export interface MomentumInput {
  hasHistory: boolean;
  demandDelta: number;        // current.demand - prev.demand
  opportunityDelta: number;   // current.opportunity - prev.opportunity
  pricePerSqmDeltaPct: number; // % change vs prev (clamped use)
  listingDelta: number;       // current listings - prev listings
  txDelta: number;            // tx90 - txPrev90
}
export interface MomentumResult { score: number; class: MomentumClass }
export function calculateMomentum(i: MomentumInput): MomentumResult {
  if (!i.hasHistory) return { score: 50, class: "stable" };
  let m = 50;
  m += i.demandDelta * 0.6;
  m += i.opportunityDelta * 0.5;
  m += Math.max(-10, Math.min(10, i.pricePerSqmDeltaPct)) * 1.0;
  m += Math.max(-15, Math.min(15, i.txDelta * 3));
  m -= Math.max(-10, Math.min(10, i.listingDelta * 0.5));
  const score = clamp(m);
  const cls: MomentumClass = score >= 80 ? "accelerating" : score >= 60 ? "growing" : score >= 40 ? "stable" : "declining";
  return { score, class: cls };
}
export const MOMENTUM_LABEL: Record<MomentumClass, string> = {
  declining: "במגמת ירידה", stable: "יציב", growing: "במגמת עלייה", accelerating: "מואץ",
};

/** COMPETITION: market saturation. Higher = more competitive (lowers opportunity). */
export interface CompetitionInput {
  agentListings: number;   // listings marketed by competing agents
  totalListings: number;   // overall listing density
}
export function calculateCompetitionScore(i: CompetitionInput): number {
  let s = 8;
  s += Math.min(60, i.agentListings * 4);  // competing brokers/agents
  s += Math.min(25, i.totalListings * 1.5); // saturation
  return clamp(s);
}

/** OPPORTUNITY v2: weighted blend of the real sub-scores. */
export interface OpportunityV2Input {
  inventory: number; demand: number; transaction: number; momentum: number; competition: number;
}
export function calculateOpportunityScoreV2(i: OpportunityV2Input): number {
  const momentumUpside = Math.max(0, (i.momentum - 50) * 2); // 50→0, 100→100
  const s =
    i.demand * 0.30 +
    i.transaction * 0.20 +
    momentumUpside * 0.20 +
    i.inventory * 0.15 +
    (100 - i.competition) * 0.15;
  return clamp(s);
}

/** HEATMAP CLASSIFICATION — explainable bands (no decorative percentages). */
export type MarketBandKey = "exceptional" | "high_potential" | "growing" | "neutral" | "weak" | "risk";
export interface MarketBand { key: MarketBandKey; label: string; tone: "green" | "gold" | "red" | "purple" | "blue" }
export function classifyMarketScore(score: number): MarketBand {
  if (score >= 90) return { key: "exceptional", label: "יוצא דופן", tone: "purple" };
  if (score >= 75) return { key: "high_potential", label: "פוטנציאל גבוה", tone: "green" };
  if (score >= 60) return { key: "growing", label: "במגמת צמיחה", tone: "gold" };
  if (score >= 40) return { key: "neutral", label: "ניטרלי", tone: "blue" };
  if (score >= 20) return { key: "weak", label: "חלש", tone: "red" };
  return { key: "risk", label: "סיכון", tone: "red" };
}

/** EXPLAINABILITY — human reasons, each tied to a counted input. No black box. */
export interface ReasonInput {
  demand: number; activeBuyers: number; readyBuyers: number;
  inventory: number; listings: number; newListings: number;
  transaction: number; tx90: number; txPrev90: number;
  momentum: MomentumResult; pricePerSqmDeltaPct: number; hasHistory: boolean;
  competition: number; agentListings: number;
  priceDrops: number; belowAverage: number;
}
export function buildScoreReasons(i: ReasonInput): string[] {
  const r: string[] = [];
  r.push(`ביקוש ${i.demand}/100 — ${i.activeBuyers} קונים פעילים${i.readyBuyers ? `, ${i.readyBuyers} בשלים` : ""}`);
  r.push(`מלאי ${i.inventory}/100 — ${i.listings} מודעות פעילות${i.newListings ? `, ${i.newListings} חדשות (7 ימים)` : ""}`);
  if (i.tx90 || i.txPrev90) {
    const d = i.tx90 - i.txPrev90;
    r.push(`עסקאות ${i.transaction}/100 — ${i.tx90} ב-90 הימים האחרונים${d !== 0 ? ` (${d > 0 ? "+" : ""}${d} מול התקופה הקודמת)` : ""}`);
  } else {
    r.push("עסקאות — אין נתוני עסקאות אמיתיים לאזור זה");
  }
  r.push(i.hasHistory
    ? `מומנטום ${MOMENTUM_LABEL[i.momentum.class]} (${i.momentum.score}/100)${i.pricePerSqmDeltaPct ? ` · מחיר/מ"ר ${i.pricePerSqmDeltaPct > 0 ? "+" : ""}${i.pricePerSqmDeltaPct}%` : ""}`
    : "מומנטום — אין היסטוריה להשוואה עדיין");
  r.push(`תחרות ${i.competition}/100 — ${i.agentListings} מודעות מתוּוכות`);
  if (i.priceDrops) r.push(`${i.priceDrops} ירידות מחיר זוהו`);
  if (i.belowAverage) r.push(`${i.belowAverage} מודעות מתחת לממוצע האזור`);
  return r;
}
