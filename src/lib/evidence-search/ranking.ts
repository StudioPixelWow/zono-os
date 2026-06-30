// ============================================================================
// Evidence Search Engine™ — ranking (PURE). Ranks evidence; never discards it.
// Produces a 0..100 confidence the engine attaches to each row. This is a
// retrieval/relevance score — NOT a valuation number and NOT a valuation weight.
// ============================================================================
import type { MatchLevel, EvidenceSourceId } from "./types";

const LEVEL_BASE: Record<MatchLevel, number> = {
  building: 100, street: 88, neighborhood: 76,
  r300: 72, r700: 64, r1000: 56, r2000: 46,
  city: 40, nearby_city: 22,
};
export function matchLevelBase(level: MatchLevel): number { return LEVEL_BASE[level]; }

/** Source reliability (0..1) — official/internal beat portals; mirrors the spec. */
export function sourceReliability(source: EvidenceSourceId, comparableType: "sold" | "listing"): number {
  switch (source) {
    case "property_transactions": return 0.95;             // official sold
    case "broker_sold": return comparableType === "sold" ? 1.0 : 0.7;
    case "properties": return comparableType === "sold" ? 0.9 : 0.65;
    case "external_listings": return 0.8;
    case "market_property_sources": return 0.6;
    default: return 0.6;
  }
}

export interface RankArgs {
  level: MatchLevel;
  distanceMeters: number | null;
  sameType: boolean;
  roomsDiff: number | null;       // abs difference
  sqmDiffPct: number | null;      // 0..1
  ageMonths: number | null;       // recency of sale/listing
  source: EvidenceSourceId;
  comparableType: "sold" | "listing";
  hasPrice: boolean;
  hasSqm: boolean;
}

/** 0..100 retrieval confidence. */
export function scoreEvidence(a: RankArgs): number {
  let s = matchLevelBase(a.level);
  if (a.distanceMeters != null) s -= Math.min(18, a.distanceMeters / 200);
  if (a.sameType) s += 4; else if (a.sameType === false) s -= 6;
  if (a.roomsDiff != null) s -= Math.min(14, a.roomsDiff * 7);
  if (a.sqmDiffPct != null) s -= Math.min(16, a.sqmDiffPct * 40);
  if (a.ageMonths != null) s -= Math.min(14, Math.max(0, a.ageMonths - 6) * 1.1);
  s *= 0.7 + 0.3 * sourceReliability(a.source, a.comparableType);
  if (!a.hasPrice) s -= 25;
  if (!a.hasSqm) s -= 15;
  return Math.max(0, Math.min(100, Math.round(s)));
}
