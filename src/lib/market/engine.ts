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
