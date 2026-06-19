/**
 * Matching Intelligence — deterministic deal scoring (no AI, no server imports).
 * A match fuses buyer + property + seller signals into a closing probability.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── Compatibility (buyer preferences vs property attributes) ─────────────────
export interface CompatInput {
  // buyer
  budgetMin: number | null;
  budgetMax: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  preferredAreas: string[];
  preferredTypes: string[];
  mustParking: boolean;
  mustElevator: boolean;
  mustSafeRoom: boolean;
  // property
  price: number | null;
  rooms: number | null;
  city: string | null;
  neighborhood: string | null;
  type: string;
  hasParking: boolean;
  hasElevator: boolean;
  hasSafeRoom: boolean;
}

export interface CompatResult {
  score: number;
  budgetFit: boolean;
  areaFit: boolean;
  typeFit: boolean;
  blocker: string | null;
  advantage: string | null;
}

export function calculateCompatibility(c: CompatInput): CompatResult {
  let s = 0;
  let blocker: string | null = null;
  let advantage: string | null = null;

  // Budget (30) — within range is best; near-range partial.
  let budgetFit = false;
  if (c.price != null && (c.budgetMin != null || c.budgetMax != null)) {
    const lo = c.budgetMin ?? 0;
    const hi = c.budgetMax ?? Number.MAX_SAFE_INTEGER;
    if (c.price >= lo && c.price <= hi) { s += 30; budgetFit = true; advantage = "מחיר בתוך התקציב"; }
    else if (hi !== Number.MAX_SAFE_INTEGER && c.price <= hi * 1.1) { s += 15; blocker = "מעט מעל התקציב"; }
    else { blocker = "מחוץ לתקציב"; }
  } else if (c.price != null) { s += 12; }

  // Area (25)
  let areaFit = false;
  if (c.preferredAreas.length === 0) { s += 12; }
  else if (c.city && c.preferredAreas.some((a) => c.city!.includes(a) || a.includes(c.city!))) { s += 25; areaFit = true; advantage = advantage ?? "באזור מועדף"; }
  else if (c.neighborhood && c.preferredAreas.some((a) => c.neighborhood!.includes(a))) { s += 18; areaFit = true; }
  else { blocker = blocker ?? "מחוץ לאזורים המועדפים"; }

  // Type (15)
  let typeFit = false;
  if (c.preferredTypes.length === 0) { s += 8; }
  else if (c.preferredTypes.includes(c.type)) { s += 15; typeFit = true; }
  else { blocker = blocker ?? "סוג נכס לא מועדף"; }

  // Rooms (15)
  if (c.rooms != null && (c.roomsMin != null || c.roomsMax != null)) {
    const lo = c.roomsMin ?? 0;
    const hi = c.roomsMax ?? 99;
    if (c.rooms >= lo && c.rooms <= hi) s += 15;
    else if (c.rooms >= lo - 0.5 && c.rooms <= hi + 0.5) s += 8;
  } else if (c.rooms != null) s += 6;

  // Must-haves (15 total, 5 each)
  if (c.mustParking) s += c.hasParking ? 5 : -3;
  else s += 2;
  if (c.mustElevator) s += c.hasElevator ? 5 : -3;
  else s += 2;
  if (c.mustSafeRoom) s += c.hasSafeRoom ? 5 : -3;
  else s += 1;

  return { score: clamp(s), budgetFit, areaFit, typeFit, blocker, advantage };
}

// ── Sub-scores from the three brains ─────────────────────────────────────────
export interface MatchInput {
  // buyer intel
  buyerReadiness: number;
  buyerEngagement: number;
  buyerTrust: number;
  buyerFinancing: number;
  buyerConversion: number;
  buyerDaysSinceActivity: number | null;
  // seller intel
  sellerTrust: number | null;
  sellerChurn: number | null;
  sellerConfidence: number | null;
  // property intel
  propertySuccess: number;
  propertyMarketPosition: number;
  propertyMomentum: number;
  // match activity
  visits: number;
  feedbackPositive: boolean;
  openObjections: number;
  matchStageIndex: number;
}

export function calculateReadinessScore(m: MatchInput): number {
  const seller = m.sellerConfidence ?? 50;
  return clamp(m.buyerReadiness * 0.5 + seller * 0.25 + m.propertySuccess * 0.25);
}
export function calculateEngagementScore(m: MatchInput): number {
  return clamp(m.buyerEngagement * 0.7 + Math.min(30, m.visits * 15));
}
export function calculateTrustScore(m: MatchInput): number {
  const seller = m.sellerTrust ?? 50;
  return clamp(m.buyerTrust * 0.5 + seller * 0.5);
}
export function calculateTimingScore(m: MatchInput): number {
  // Buyer-ready AND seller-ready (low churn) = high timing.
  const buyerReady = m.buyerReadiness;
  const sellerReady = m.sellerChurn != null ? 100 - m.sellerChurn : 60;
  return clamp(buyerReady * 0.5 + sellerReady * 0.5);
}
export function calculateMomentumScore(m: MatchInput): number {
  let s = m.propertyMomentum * 0.4;
  s += Math.min(30, m.visits * 12);
  if (m.feedbackPositive) s += 15;
  s += Math.min(15, m.matchStageIndex * 2);
  const penalty = m.buyerDaysSinceActivity != null ? Math.min(30, m.buyerDaysSinceActivity * 2) : 15;
  return clamp(s + 25 - penalty);
}
export function calculateRiskScore(m: MatchInput): number {
  let s = 0;
  if (m.sellerChurn != null && m.sellerChurn >= 60) s += 25;
  if (m.buyerFinancing < 45) s += 20;
  if (m.openObjections > 0) s += Math.min(25, m.openObjections * 10);
  if (m.visits === 0 && m.matchStageIndex >= 2) s += 15;
  if (m.buyerDaysSinceActivity != null && m.buyerDaysSinceActivity >= 14) s += 15;
  return clamp(s);
}

export function calculateClosingProbability(m: MatchInput, compatibility: number): number {
  const readiness = calculateReadinessScore(m);
  const engagement = calculateEngagementScore(m);
  const trust = calculateTrustScore(m);
  const timing = calculateTimingScore(m);
  const momentum = calculateMomentumScore(m);
  const risk = calculateRiskScore(m);
  let s =
    compatibility * 0.18 +
    readiness * 0.16 +
    engagement * 0.14 +
    trust * 0.12 +
    timing * 0.12 +
    momentum * 0.12 +
    m.buyerConversion * 0.16;
  s += Math.min(10, m.matchStageIndex * 1.5);
  return clamp(s - risk * 0.25);
}

export interface MatchScoreSet {
  compatibility: number;
  readiness: number;
  engagement: number;
  trust: number;
  timing: number;
  momentum: number;
  risk: number;
  closing: number;
}

export function computeMatchScores(m: MatchInput, compatibility: number): MatchScoreSet {
  return {
    compatibility,
    readiness: calculateReadinessScore(m),
    engagement: calculateEngagementScore(m),
    trust: calculateTrustScore(m),
    timing: calculateTimingScore(m),
    momentum: calculateMomentumScore(m),
    risk: calculateRiskScore(m),
    closing: calculateClosingProbability(m, compatibility),
  };
}

export type Tone = "good" | "medium" | "risk";
export function scoreTone(n: number): Tone {
  if (n >= 70) return "good";
  if (n >= 45) return "medium";
  return "risk";
}
export function riskTone(n: number): Tone {
  if (n < 30) return "good";
  if (n < 60) return "medium";
  return "risk";
}
