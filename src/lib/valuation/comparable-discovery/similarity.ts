// ============================================================================
// 🎯 Professional similarity scoring (pure). Phase 27.4.
// ----------------------------------------------------------------------------
// A 0..100 relevance score for RANKING/selection only — NOT a valuation number
// and NOT a valuation weight (the AVM recomputes its own similarity, unchanged).
// Scores like an appraiser: distance, location/neighborhood/street/BUILDING,
// property-type match, and the full attribute set (rooms, sqm, floor, total
// floors, parking, storage, balcony, elevator, condition, year, luxury), plus
// source reliability, recency, completeness and traceability. Crossing into a
// different neighborhood REDUCES the score — never rejects (Part 3).
// ============================================================================
import type { DiscoverySourceId, MatchLevel } from "./types";

export interface SimilarityArgs {
  matchLevel: MatchLevel;
  distanceMeters: number | null;
  sameNeighborhood: boolean;
  differentKnownNeighborhood: boolean;   // both have a neighborhood and they differ (Part 3 penalty)
  sameStreet: boolean;
  sameBuilding: boolean;                 // same street + house, or < ~40m
  sameConstructionPeriod: boolean;       // |year diff| ≤ 3
  sameType: boolean;
  hasType: boolean;
  roomsDiff: number | null;              // abs
  sqmDiffPct: number | null;             // 0..1
  floorDiff: number | null;              // abs
  totalFloorsDiff: number | null;        // abs (building height)
  parkingMatch: boolean | null;
  storageMatch: boolean | null;
  balconyMatch: boolean | null;
  elevatorMatch: boolean | null;
  conditionMatch: boolean | null;
  luxuryMatch: boolean | null;
  yearDiff: number | null;               // abs years
  ageMonths: number | null;              // recency of the sale/listing
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
  // ── Location ──────────────────────────────────────────────────────────────
  if (a.matchLevel === "same_city") s += 6;
  else if (a.matchLevel === "normalized_city") s += 4;
  else if (a.matchLevel === "out") s -= 25;
  if (a.distanceMeters != null) s += Math.max(-20, Math.min(30, 30 - a.distanceMeters / 120));
  if (a.sameNeighborhood) s += 8;
  else if (a.differentKnownNeighborhood) s -= 6;   // Part 3 — reduce, never reject
  if (a.sameStreet) s += 6;
  // ── Building (Part 5) ─────────────────────────────────────────────────────
  if (a.sameBuilding) s += 12;
  if (a.sameConstructionPeriod) s += 4;
  // ── Property type (Part 4) ────────────────────────────────────────────────
  if (a.sameType) s += 8; else if (a.hasType) s -= 12;
  // ── Attribute match (Part 6) ──────────────────────────────────────────────
  if (a.roomsDiff != null) s -= Math.min(16, a.roomsDiff * 8);
  if (a.sqmDiffPct != null) s -= Math.min(16, a.sqmDiffPct * 40);
  if (a.floorDiff != null) s -= Math.min(6, a.floorDiff * 1.5);
  if (a.totalFloorsDiff != null) s -= Math.min(4, a.totalFloorsDiff * 0.8);
  if (a.parkingMatch === true) s += 2; else if (a.parkingMatch === false) s -= 2;
  if (a.storageMatch === true) s += 1; else if (a.storageMatch === false) s -= 1;
  if (a.balconyMatch === true) s += 2; else if (a.balconyMatch === false) s -= 2;
  if (a.elevatorMatch === true) s += 1; else if (a.elevatorMatch === false) s -= 1;
  if (a.conditionMatch === true) s += 3; else if (a.conditionMatch === false) s -= 3;
  if (a.luxuryMatch === true) s += 3; else if (a.luxuryMatch === false) s -= 3;
  if (a.yearDiff != null) s -= Math.min(6, a.yearDiff * 0.3);
  // ── Recency ───────────────────────────────────────────────────────────────
  if (a.ageMonths != null) s -= Math.min(12, Math.max(0, a.ageMonths - 6) * 1.0);
  // ── Source + completeness + traceability ──────────────────────────────────
  s += reliability(a.source);
  if (!a.hasPrice) s -= 25;
  if (!a.hasSqm) s -= 15;
  if (!a.isTraceable) s -= 30;
  return Math.max(0, Math.min(100, Math.round(s)));
}
