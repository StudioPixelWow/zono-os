// ============================================================================
// ZONO Property Radar™ — match scoring (pure, deterministic, client-safe).
// Produces a 0–100 score from weighted per-dimension fits. No I/O, no randomness.
// Each dimension returns a fraction (0..1) of its weight; "no buyer preference"
// in a dimension is treated as a full fit (the buyer is open on it).
// ============================================================================
import type {
  MatchableBuyer,
  MatchableProperty,
  MatchLevel,
  MatchScoreBreakdown,
  MatchWeights,
} from "./types";

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  budget: 30,
  location: 25,
  rooms: 15,
  propertyType: 10,
  size: 5,
  parking: 5,
  balcony: 3,
  floor: 2,
  timeline: 5,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
const pts = (weight: number, fraction: number): number => Math.round(weight * clamp(fraction, 0, 1));

// ── Per-dimension fits (0..1) ────────────────────────────────────────────────
function budgetFit(buyer: MatchableBuyer, price: number | null): number {
  if (buyer.budgetMin == null && buyer.budgetMax == null) return 1; // open
  if (price == null) return 0.5; // unknown price → neutral
  const lo = buyer.budgetMin ?? 0;
  const hi = buyer.budgetMax ?? Number.POSITIVE_INFINITY;
  if (price >= lo && price <= hi) {
    // Reward being comfortably under the ceiling.
    if (hi !== Number.POSITIVE_INFINITY && hi > 0) {
      const headroom = (hi - price) / hi; // 0..1
      return clamp(0.85 + headroom * 0.15, 0.85, 1);
    }
    return 1;
  }
  if (price < lo && lo > 0) return clamp(1 - (lo - price) / lo, 0.4, 0.9); // cheaper than wanted
  if (hi !== Number.POSITIVE_INFINITY && hi > 0 && price > hi) {
    return clamp(1 - (price - hi) / hi, 0, 0.7); // over budget (within filter tolerance)
  }
  return 0.5;
}

function locationFit(buyer: MatchableBuyer, property: MatchableProperty): number {
  const hasCityPref = buyer.preferredCities.length > 0;
  const hasNbhdPref = buyer.preferredNeighborhoods.length > 0;
  if (!hasCityPref && !hasNbhdPref) return 1; // open on location

  const city = (property.city ?? "").trim();
  const nbhd = (property.neighborhood ?? "").trim();
  const cityMatch = !!city && buyer.preferredCities.some((c) => c.trim() === city);
  const nbhdMatch = !!nbhd && buyer.preferredNeighborhoods.some((n) => n.trim() === nbhd);

  if (hasNbhdPref && nbhdMatch) return 1; // exact neighborhood is the best fit
  if (cityMatch) return hasNbhdPref ? 0.8 : 1; // right city, wrong/unknown neighborhood
  if (hasNbhdPref && !hasCityPref && nbhdMatch) return 1;
  return 0; // has a preference but nothing matched (filter usually catches city)
}

function roomsFit(buyer: MatchableBuyer, rooms: number | null): number {
  if (buyer.roomsMin == null && buyer.roomsMax == null) return 1;
  if (rooms == null) return 0.5;
  const lo = buyer.roomsMin ?? 0;
  const hi = buyer.roomsMax ?? Number.POSITIVE_INFINITY;
  if (rooms >= lo && rooms <= hi) return 1;
  // half-room off → strong partial; otherwise decay.
  const dist = rooms < lo ? lo - rooms : rooms - hi;
  if (dist <= 0.5) return 0.7;
  if (dist <= 1) return 0.45;
  return clamp(0.45 - (dist - 1) * 0.2, 0, 0.45);
}

function propertyTypeFit(buyer: MatchableBuyer, propertyType: string | null): number {
  if (buyer.preferredTypes.length === 0) return 1; // open
  if (!propertyType) return 0.5;
  return buyer.preferredTypes.some((t) => t.trim() === propertyType.trim()) ? 1 : 0;
}

function sizeFit(buyer: MatchableBuyer, sizeSqm: number | null): number {
  if (buyer.sizeMin == null && buyer.sizeMax == null) return 1;
  if (sizeSqm == null) return 0.5;
  const lo = buyer.sizeMin ?? 0;
  const hi = buyer.sizeMax ?? Number.POSITIVE_INFINITY;
  if (sizeSqm >= lo && sizeSqm <= hi) return 1;
  const ref = hi !== Number.POSITIVE_INFINITY ? hi : lo || 1;
  const dist = sizeSqm < lo ? lo - sizeSqm : sizeSqm - hi;
  return clamp(1 - dist / Math.max(ref, 1), 0, 0.8);
}

/** must-have requirement: met=1, unknown=0.5, violated=0; no requirement=1. */
function requirementFit(required: boolean, present: boolean | null): number {
  if (!required) return 1;
  if (present == null) return 0.5;
  return present ? 1 : 0;
}

function floorFit(buyer: MatchableBuyer, floorNumber: number | null): number {
  if (buyer.floorMin == null && buyer.floorMax == null) return 1;
  if (floorNumber == null) return 0.5;
  const lo = buyer.floorMin ?? Number.NEGATIVE_INFINITY;
  const hi = buyer.floorMax ?? Number.POSITIVE_INFINITY;
  if (floorNumber >= lo && floorNumber <= hi) return 1;
  const dist = floorNumber < lo ? lo - floorNumber : floorNumber - hi;
  return clamp(1 - dist * 0.3, 0, 0.7);
}

/** Readiness/urgency → a ready buyer is a better match to act on now. */
function timelineFit(buyer: MatchableBuyer): number {
  if (buyer.timeline === "immediate") return 1;
  if (buyer.timeline === "soon") return 0.7;
  if (buyer.timeline === "flexible") return 0.4;
  // fall back to temperature when no explicit timeline.
  if (buyer.temperature === "hot") return 0.9;
  if (buyer.temperature === "warm") return 0.6;
  if (buyer.temperature === "cold") return 0.3;
  return 0.5;
}

// ── Public scoring API ───────────────────────────────────────────────────────
export interface ScoredMatch {
  breakdown: MatchScoreBreakdown;
  /** Sum of sub-scores + manual bonus − manual penalty, clamped 0..100. */
  total: number;
}

export function scoreBuyerProperty(
  buyer: MatchableBuyer,
  property: MatchableProperty,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): ScoredMatch {
  const breakdown: MatchScoreBreakdown = {
    priceScore: pts(weights.budget, budgetFit(buyer, property.price)),
    locationScore: pts(weights.location, locationFit(buyer, property)),
    roomsScore: pts(weights.rooms, roomsFit(buyer, property.rooms)),
    propertyTypeScore: pts(weights.propertyType, propertyTypeFit(buyer, property.propertyType)),
    sizeScore: pts(weights.size, sizeFit(buyer, property.sizeSqm)),
    parkingScore: pts(weights.parking, requirementFit(buyer.mustHaveParking, property.hasParking)),
    balconyScore: pts(weights.balcony, requirementFit(buyer.mustHaveBalcony, property.hasBalcony)),
    floorScore: pts(weights.floor, floorFit(buyer, property.floorNumber)),
    timelineScore: pts(weights.timeline, timelineFit(buyer)),
  };

  const subtotal = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const total = clamp(
    Math.round(subtotal + (buyer.manualBonus || 0) - (buyer.manualPenalty || 0)),
    0,
    100,
  );
  return { breakdown, total };
}

export function matchLevelForScore(score: number): MatchLevel {
  if (score >= 95) return "perfect";
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 50) return "possible";
  return "rejected";
}
