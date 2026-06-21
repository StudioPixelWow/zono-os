/**
 * Territory Intelligence OS — pure deterministic engine.
 *
 * No LLM, no I/O, no `server-only` — safe on client or server. Turns raw
 * territory metrics (already aggregated from transactions, properties, buyers,
 * sellers, deals, competitors, acquisition, recommendations, revenue, forecast)
 * into explainable 0-100 scores, a territory level, and actionable signals.
 * Every function is a pure transform → fully testable and reproducible.
 */

export const clamp = (n: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** Weighted blend of {value 0-100, weight} pairs, normalised by total weight. */
export function weightedScore(parts: { value: number; weight: number }[]): number {
  const active = parts.filter((p) => p.weight > 0);
  const total = active.reduce((a, p) => a + p.weight, 0);
  if (total <= 0) return 0;
  return clamp(active.reduce((a, p) => a + clamp(p.value) * p.weight, 0) / total);
}

/** Normalise a raw count against a reference into 0-100 (diminishing returns). */
export function normalizeCount(value: number, reference: number): number {
  if (reference <= 0) return value > 0 ? 60 : 0;
  return clamp(100 * (1 - Math.exp(-value / reference)));
}

export type TerritoryLevel = "critical" | "weak" | "watch" | "strong" | "dominant";

/** Raw metrics for one territory (counts + market context). */
export interface TerritoryMetrics {
  activeBuyers: number;
  activeSellers: number;
  activeProperties: number;
  activeDeals: number;
  activeMatches: number;
  internalInventory: number;
  externalInventory: number;
  transactionVolume90d: number;
  transactionVolume365d: number;
  transactionVolumePrev90d?: number;   // for growth
  competitorCount: number;
  competitorListings?: number;          // competitor-held inventory in the area
  assignedAgents: number;
  recommendationCount: number;
  acquisitionSignalCount?: number;      // private-seller / acquisition opportunities
  privateSellerCount?: number;
  expectedRevenue?: number;
  expectedCommission?: number;
  avgPriceSqm?: number | null;
}

// ── Score functions ──────────────────────────────────────────────────────────
/** Demand: buyers + matches + recent transaction velocity. */
export function calculateDemandScore(m: TerritoryMetrics): number {
  return weightedScore([
    { value: normalizeCount(m.activeBuyers, 8), weight: 3 },
    { value: normalizeCount(m.activeMatches, 6), weight: 2 },
    { value: normalizeCount(m.transactionVolume90d, 10), weight: 2 },
  ]);
}

/** Supply: internal + external inventory + sellers. */
export function calculateSupplyScore(m: TerritoryMetrics): number {
  return weightedScore([
    { value: normalizeCount(m.internalInventory, 6), weight: 3 },
    { value: normalizeCount(m.externalInventory, 12), weight: 1 },
    { value: normalizeCount(m.activeSellers, 6), weight: 2 },
  ]);
}

/** Penetration: how much of the territory's activity WE control vs the market. */
export function calculatePenetrationScore(m: TerritoryMetrics): number {
  const ourInventory = m.internalInventory;
  const marketInventory = m.internalInventory + m.externalInventory + (m.competitorListings ?? 0);
  const invShare = marketInventory > 0 ? (ourInventory / marketInventory) * 100 : (ourInventory > 0 ? 60 : 0);
  return weightedScore([
    { value: invShare, weight: 3 },
    { value: normalizeCount(m.activeDeals, 4), weight: 2 },
    { value: normalizeCount(m.assignedAgents, 2), weight: 1 },
  ]);
}

/** Competition: how crowded the territory is with competitors. */
export function calculateCompetitionScore(m: TerritoryMetrics): number {
  return weightedScore([
    { value: normalizeCount(m.competitorCount, 4), weight: 2 },
    { value: normalizeCount(m.competitorListings ?? 0, 10), weight: 2 },
  ]);
}

/** Dominance: our presence relative to competition (higher = we dominate). */
export function calculateDominanceScore(m: TerritoryMetrics): number {
  const penetration = calculatePenetrationScore(m);
  const competition = calculateCompetitionScore(m);
  // Dominance rises with our penetration and falls with competitor strength.
  return clamp(penetration - competition * 0.6 + (m.activeDeals >= 2 ? 10 : 0));
}

/** Growth: change in transaction velocity (and our pipeline momentum). */
export function calculateGrowthScore(m: TerritoryMetrics): number {
  const prev = m.transactionVolumePrev90d ?? 0;
  const cur = m.transactionVolume90d;
  let trend = 50;
  if (prev > 0) trend = clamp(50 + ((cur - prev) / prev) * 50);
  else if (cur > 0) trend = 70;
  return weightedScore([
    { value: trend, weight: 3 },
    { value: normalizeCount(m.activeMatches, 6), weight: 1 },
    { value: normalizeCount(m.recommendationCount, 8), weight: 1 },
  ]);
}

/** Acquisition: density of seller/private-seller/acquisition opportunities. */
export function calculateAcquisitionScore(m: TerritoryMetrics): number {
  return weightedScore([
    { value: normalizeCount(m.privateSellerCount ?? 0, 5), weight: 2 },
    { value: normalizeCount(m.acquisitionSignalCount ?? 0, 4), weight: 2 },
    { value: normalizeCount(m.activeSellers, 6), weight: 1 },
    { value: normalizeCount(m.transactionVolume365d, 30), weight: 1 },
  ]);
}

/** Revenue potential 0-100 from expected revenue + transaction value context. */
export function calculateRevenueScore(m: TerritoryMetrics, refRevenue = 500_000): number {
  const rev = m.expectedRevenue ?? 0;
  return weightedScore([
    { value: clamp(100 * (1 - Math.exp(-rev / refRevenue))), weight: 3 },
    { value: normalizeCount(m.activeDeals, 4), weight: 1 },
    { value: normalizeCount(m.transactionVolume90d, 10), weight: 1 },
  ]);
}

/** Concrete expected revenue (currency) blending pipeline + market velocity. */
export function calculateRevenuePotential(m: TerritoryMetrics, avgCommission = 30_000): number {
  const pipeline = m.expectedRevenue ?? m.activeDeals * avgCommission;
  const velocityValue = (m.transactionVolume90d * 0.15) * avgCommission; // 15% capture assumption
  return Math.round(pipeline + velocityValue);
}

/** Forecast score from expected future closings (deals + matches momentum). */
export function calculateForecastScore(m: TerritoryMetrics): number {
  return weightedScore([
    { value: normalizeCount(m.activeDeals, 4), weight: 3 },
    { value: normalizeCount(m.activeMatches, 6), weight: 2 },
    { value: calculateGrowthScore(m), weight: 1 },
  ]);
}

/**
 * Opportunity: where to push. High when demand & growth & acquisition are high
 * but OUR penetration is low (room to win). Competition lowers it slightly.
 */
export function calculateOpportunityScore(m: TerritoryMetrics): number {
  const demand = calculateDemandScore(m);
  const growth = calculateGrowthScore(m);
  const acquisition = calculateAcquisitionScore(m);
  const penetration = calculatePenetrationScore(m);
  const revenue = calculateRevenueScore(m);
  const headroom = 100 - penetration; // unpenetrated room
  return weightedScore([
    { value: demand, weight: 2 },
    { value: growth, weight: 2 },
    { value: acquisition, weight: 1.5 },
    { value: revenue, weight: 1.5 },
    { value: headroom, weight: 2 },
  ]);
}

/**
 * White space: high market activity / demand where WE are weak. The flagship
 * "where are we NOT working enough?" score.
 */
export function calculateWhiteSpaceScore(m: TerritoryMetrics): number {
  const demand = calculateDemandScore(m);
  const marketActivity = normalizeCount(m.transactionVolume365d, 30);
  const competition = calculateCompetitionScore(m);
  const penetration = calculatePenetrationScore(m);
  // High when demand/activity/competition are high but our penetration is low.
  const marketStrength = weightedScore([
    { value: demand, weight: 2 }, { value: marketActivity, weight: 2 }, { value: competition, weight: 1 },
  ]);
  return clamp(marketStrength * (1 - clamp01(penetration / 100)));
}

/** Territory health: balanced internal indicator (penetration + dominance + revenue). */
export function calculateTerritoryHealth(m: TerritoryMetrics): number {
  return weightedScore([
    { value: calculatePenetrationScore(m), weight: 2 },
    { value: calculateDominanceScore(m), weight: 2 },
    { value: calculateRevenueScore(m), weight: 1.5 },
    { value: calculateGrowthScore(m), weight: 1.5 },
  ]);
}

/** Confidence in the territory read, from data volume. */
export function calculateConfidence(m: TerritoryMetrics): number {
  const dataPoints = m.transactionVolume365d + m.activeBuyers + m.activeSellers + m.internalInventory + m.activeDeals;
  return clamp(normalizeCount(dataPoints, 20));
}

/** Map the health/dominance into a discrete level. */
export function deriveTerritoryLevel(health: number, dominance: number): TerritoryLevel {
  const blended = weightedScore([{ value: health, weight: 2 }, { value: dominance, weight: 1 }]);
  if (blended >= 80) return "dominant";
  if (blended >= 60) return "strong";
  if (blended >= 40) return "watch";
  if (blended >= 20) return "weak";
  return "critical";
}

// ── Composite scorer ─────────────────────────────────────────────────────────
export interface TerritoryScores {
  demand_score: number; supply_score: number; acquisition_score: number; revenue_score: number;
  forecast_score: number; competition_score: number; dominance_score: number; penetration_score: number;
  opportunity_score: number; growth_score: number; white_space_score: number; territory_health_score: number;
  confidence_score: number; territory_level: TerritoryLevel; expected_revenue: number;
}

export function scoreTerritory(m: TerritoryMetrics): TerritoryScores {
  const dominance = calculateDominanceScore(m);
  const health = calculateTerritoryHealth(m);
  return {
    demand_score: calculateDemandScore(m),
    supply_score: calculateSupplyScore(m),
    acquisition_score: calculateAcquisitionScore(m),
    revenue_score: calculateRevenueScore(m),
    forecast_score: calculateForecastScore(m),
    competition_score: calculateCompetitionScore(m),
    dominance_score: dominance,
    penetration_score: calculatePenetrationScore(m),
    opportunity_score: calculateOpportunityScore(m),
    growth_score: calculateGrowthScore(m),
    white_space_score: calculateWhiteSpaceScore(m),
    territory_health_score: health,
    confidence_score: calculateConfidence(m),
    territory_level: deriveTerritoryLevel(health, dominance),
    expected_revenue: calculateRevenuePotential(m),
  };
}

// ── Ranking ──────────────────────────────────────────────────────────────────
export interface RankableTerritory {
  opportunity_score: number; revenue_score: number; growth_score: number; white_space_score: number;
}
export function rankTerritories<T extends RankableTerritory>(territories: T[]): T[] {
  const value = (t: T) => weightedScore([
    { value: t.opportunity_score, weight: 3 },
    { value: t.revenue_score, weight: 2 },
    { value: t.growth_score, weight: 1.5 },
    { value: t.white_space_score, weight: 1.5 },
  ]);
  return [...territories].sort((a, b) => value(b) - value(a));
}

// ── Signal generation ────────────────────────────────────────────────────────
export type TerritorySignalType =
  | "white_space" | "competitor_dominance" | "growth_area" | "acquisition_hotspot" | "inventory_gap"
  | "buyer_cluster" | "seller_cluster" | "transaction_spike" | "revenue_opportunity" | "territory_decline"
  | "agent_gap" | "office_gap" | "recommendation_density" | "market_shift";

export interface TerritorySignal {
  signal_type: TerritorySignalType;
  score: number;
  confidence_score: number;
  title: string;
  reason: string;
  recommended_action: string;
}

/**
 * Derive explainable signals for a territory from its scores + metrics. Only
 * meaningful signals are emitted (thresholded) so the Decision Brain isn't
 * flooded. Deterministic.
 */
export function generateTerritorySignals(name: string, s: TerritoryScores, m: TerritoryMetrics): TerritorySignal[] {
  const out: TerritorySignal[] = [];
  const push = (signal_type: TerritorySignalType, score: number, title: string, reason: string, action: string) =>
    out.push({ signal_type, score: clamp(score), confidence_score: s.confidence_score, title, reason, recommended_action: action });

  if (s.white_space_score >= 60)
    push("white_space", s.white_space_score, `שטח לבן: ${name}`, "ביקוש/פעילות שוק גבוהים אך הנוכחות שלנו נמוכה", "מקד פעילות וגיוס נכסים באזור");
  if (s.opportunity_score >= 70)
    push("revenue_opportunity", s.opportunity_score, `הזדמנות ב${name}`, "שילוב ביקוש, צמיחה ופוטנציאל הכנסה גבוה", "השקע משאבים ושיווק באזור");
  if (s.acquisition_score >= 65)
    push("acquisition_hotspot", s.acquisition_score, `מוקד גיוס: ${name}`, "צפיפות מוכרים/הזדמנויות רכש גבוהה", "הרץ גיוס נכסים יזום באזור");
  if (s.growth_score >= 70)
    push("growth_area", s.growth_score, `אזור צומח: ${name}`, "מגמת עסקאות עולה", "הגבר נוכחות לפני שהמתחרים תופסים");
  if (s.growth_score <= 30 && m.transactionVolume365d > 0)
    push("territory_decline", 100 - s.growth_score, `דעיכה ב${name}`, "מגמת עסקאות יורדת", "בחן הקצאת משאבים מחדש");
  if (s.competition_score >= 65 && s.dominance_score < 40)
    push("competitor_dominance", s.competition_score, `שליטת מתחרים ב${name}`, "מתחרים חזקים והנוכחות שלנו חלשה", "בנה אסטרטגיית כניסה ממוקדת");
  if (s.demand_score >= 60 && s.supply_score <= 35)
    push("inventory_gap", s.demand_score, `מחסור מלאי ב${name}`, "ביקוש גבוה מול היצע נמוך", "גייס נכסים — יש קונים ללא מלאי");
  if (m.assignedAgents === 0 && s.opportunity_score >= 50)
    push("agent_gap", s.opportunity_score, `אין סוכן ב${name}`, "אזור הזדמנות ללא סוכן משויך", "שייך סוכן לאזור");
  if (m.recommendationCount >= 5)
    push("recommendation_density", normalizeCount(m.recommendationCount, 8), `צפיפות המלצות ב${name}`, "ריכוז המלצות פתוחות גבוה", "טפל בהמלצות באזור");

  return out;
}
