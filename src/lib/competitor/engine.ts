/**
 * Competitor Intelligence — deterministic scoring. Pure, client-safe, no LLM.
 * Turns per-competitor market evidence into market-structure scores + signals.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface CompetitorAggregate {
  competitorType: string; // broker | agency | office | unknown
  totalListings: number;
  localities: number; // distinct localities present in
  weightedMarketShare: number; // avg market-share % across localities (0..100)
  maxLocalityShare: number; // strongest single-locality share %
  exclusives: number;
  added30: number; // listings first seen in last 30d
  removed30: number; // listings removed in last 30d
  added7: number;
  avgPriceVsMarket: number; // listing avg ₪/m² ÷ market avg (1 = at market)
}

// ── Sub-scores ───────────────────────────────────────────────────────────────
export function calculateMarketShareScore(a: CompetitorAggregate): number {
  // Weighted presence + strongest stronghold.
  return clamp(a.weightedMarketShare * 1.4 + a.maxLocalityShare * 0.6);
}

export function calculateInventoryStrengthScore(a: CompetitorAggregate): number {
  return clamp(Math.min(70, a.totalListings * 4) + Math.min(30, a.localities * 6));
}

export function calculateGrowthScore(a: CompetitorAggregate): number {
  const net = a.added30 - a.removed30;
  // Net inventory change, normalized around the competitor's size.
  const base = 50 + net * 6;
  return clamp(base);
}

export function calculateExclusivityScore(a: CompetitorAggregate): number {
  if (a.totalListings === 0) return 0;
  return clamp((a.exclusives / a.totalListings) * 100);
}

export function calculatePricingPowerScore(a: CompetitorAggregate): number {
  // Higher ₪/m² than market = stronger pricing power.
  if (!a.avgPriceVsMarket) return 50;
  return clamp(50 + (a.avgPriceVsMarket - 1) * 120);
}

export function calculateActivityScore(a: CompetitorAggregate): number {
  return clamp(Math.min(60, a.added7 * 15) + Math.min(40, a.totalListings * 2));
}

/** How vulnerable the competitor is (declining/weak) — higher = more vulnerable. */
export function calculateAcquisitionRiskScore(a: CompetitorAggregate): number {
  let s = 30;
  const net = a.added30 - a.removed30;
  if (net < 0) s += Math.min(40, Math.abs(net) * 10); // losing inventory
  if (a.added7 === 0) s += 10; // gone quiet
  if (a.weightedMarketShare < 10) s += 10; // weak presence
  return clamp(s);
}

/** Acquisition opportunity for OUR office around this competitor. */
export function calculateCompetitorOpportunityScore(a: CompetitorAggregate, vulnerability: number): number {
  let s = vulnerability * 0.5;
  const net = a.added30 - a.removed30;
  if (net < 0) s += 20;
  if (a.competitorType === "unknown") s += 10;
  s += Math.max(0, 20 - a.weightedMarketShare); // fragmented/weak = more room
  return clamp(s);
}

export interface CompetitorScores {
  market_share_score: number;
  inventory_strength_score: number;
  growth_score: number;
  exclusivity_score: number;
  pricing_power_score: number;
  activity_score: number;
  acquisition_risk_score: number;
  opportunity_score: number;
}

export function scoreCompetitor(a: CompetitorAggregate): CompetitorScores {
  const market_share = calculateMarketShareScore(a);
  const inventory = calculateInventoryStrengthScore(a);
  const growth = calculateGrowthScore(a);
  const exclusivity = calculateExclusivityScore(a);
  const pricing = calculatePricingPowerScore(a);
  const activity = calculateActivityScore(a);
  const risk = calculateAcquisitionRiskScore(a);
  const opportunity = calculateCompetitorOpportunityScore(a, risk);
  return {
    market_share_score: market_share, inventory_strength_score: inventory, growth_score: growth,
    exclusivity_score: exclusivity, pricing_power_score: pricing, activity_score: activity,
    acquisition_risk_score: risk, opportunity_score: opportunity,
  };
}

// ── Dominance thresholds ─────────────────────────────────────────────────────
export function isDominant(competitorType: string, localityShare: number): boolean {
  return competitorType === "agency" || competitorType === "office" ? localityShare >= 30 : localityShare >= 20;
}

// ── AI-ready deterministic text ──────────────────────────────────────────────
export interface CompetitorAiInput { name: string; scores: CompetitorScores; agg: CompetitorAggregate; topLocality: string | null }

export function buildCompetitorAi(i: CompetitorAiInput): { ai_summary: string; ai_risk_summary: string; ai_opportunity_summary: string } {
  const net = i.agg.added30 - i.agg.removed30;
  const trend = net > 0 ? `מתחזק (+${net} ב-30 יום)` : net < 0 ? `נחלש (${net} ב-30 יום)` : "יציב";
  const ai_summary = `${i.name}: ${i.agg.totalListings} מודעות ב-${i.agg.localities} אזורים, נתח שוק ${i.scores.market_share_score}. ${trend}.${i.topLocality ? ` חזק במיוחד ב${i.topLocality}.` : ""}`;
  const ai_risk_summary = i.scores.growth_score >= 60
    ? `מתחרה מתחזק — מומלץ מעקב והגנה על נתח השוק.`
    : i.scores.acquisition_risk_score >= 60 ? `מתחרה פגיע — מאבד מלאי, הזדמנות גיוס.` : "מתחרה יציב.";
  const ai_opportunity_summary = i.scores.opportunity_score >= 60
    ? `הזדמנות גיוס: ${net < 0 ? "מאבד מלאי" : "נתח שוק נמוך"}${i.topLocality ? ` ב${i.topLocality}` : ""} — מקד מאמצי גיוס.`
    : "אין הזדמנות גיוס בולטת כרגע.";
  return { ai_summary, ai_risk_summary, ai_opportunity_summary };
}
