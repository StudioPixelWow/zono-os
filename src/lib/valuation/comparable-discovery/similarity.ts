// ============================================================================
// 🎯 Similarity scoring (pure). VAL-QA-10.
// ----------------------------------------------------------------------------
// A 0..100 relevance score for RANKING/selection only — NOT a valuation number
// and NOT a valuation weight. Factors: distance, city/neighborhood/street match,
// property type, rooms/sqm/floor deltas, recency, source reliability,
// traceability, price/sqm completeness. Nothing is discarded here; the engine
// attaches a rejection reason separately.
// ============================================================================
import type { DiscoverySourceId, MatchLevel } from "./types";

export interface SimilarityArgs {
  matchLevel: MatchLevel;
  distanceMeters: number | null;
  sameNeighborhood: boolean;
  sameStreet: boolean;
  sameType: boolean;
  hasType: boolean;
  roomsDiff: number | null;      // abs
  sqmDiffPct: number | null;     // 0..1
  floorDiff: number | null;      // abs
  ageMonths: number | null;
  source: DiscoverySourceId;
  hasPrice: boolean;
  hasSqm: boolean;
  isTraceable: boolean;
}

function reliability(source: DiscoverySourceId): number {
  switch (source) {
    case "property_transactions": return 9;   // official closed deals
    case "broker_sold": return 9;             // the broker's own closed deals
    case "properties": return 5;              // internal inventory
    case "external_listings": return 3;       // real portal listings (weaker)
    case "market_property_sources": return 1; // aggregated market rows
    default: return 1;
  }
}

/** 0..100 relevance score. Higher = more comparable to the subject. */
export function computeSimilarity(a: SimilarityArgs): number {
  let s = 50;
  // Location.
  if (a.matchLevel === "same_city") s += 8;
  else if (a.matchLevel === "normalized_city") s += 5;
  else if (a.matchLevel === "out") s -= 25;
  if (a.distanceMeters != null) s += Math.max(-20, Math.min(30, 30 - a.distanceMeters / 150));
  if (a.sameNeighborhood) s += 6;
  if (a.sameStreet) s += 6;
  // Property shape.
  if (a.sameType) s += 6; else if (a.hasType) s -= 8;
  if (a.roomsDiff != null) s -= Math.min(14, a.roomsDiff * 7);
  if (a.sqmDiffPct != null) s -= Math.min(16, a.sqmDiffPct * 40);
  if (a.floorDiff != null) s -= Math.min(6, a.floorDiff * 2);
  // Recency (sold/listing age).
  if (a.ageMonths != null) s -= Math.min(12, Math.max(0, a.ageMonths - 6) * 1.0);
  // Source + completeness + traceability.
  s += reliability(a.source);
  if (!a.hasPrice) s -= 25;
  if (!a.hasSqm) s -= 15;
  if (!a.isTraceable) s -= 30;
  return Math.max(0, Math.min(100, Math.round(s)));
}
