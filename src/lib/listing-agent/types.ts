// ============================================================================
// 🏠 ZONO Listing Intelligence Agent™ — types (pure). 29.3.
// ----------------------------------------------------------------------------
// The first real autonomous BUSINESS agent — one per property. It reuses the
// Agent Framework and every intelligence engine (Property / Valuation /
// Territory / Competition / Decision / Truth / Customer Journey / Relationship /
// Mission history) READ-ONLY. Everything is recommendation-only; nothing
// auto-executes. Evidence-only — sparse data → conservative + low confidence.
// ============================================================================
import type { ValuationView } from "./valuation";

export const LISTING_AGENT_VERSION = "29.3.1";

export type Impact = "high" | "medium" | "low";

// Normalized signals per property (assembled upstream from the reused engines).
export interface ListingSignals {
  id: string; title: string; city: string | null; type: string | null;
  status: string; listingKind: string;
  price: number | null; rooms: number | null; sizeSqm: number | null;
  listedAt: string | null; createdAt: string | null; updatedAt: string | null;
  timeOnMarketDays: number | null;
  zonoScore: number | null; estimatedDaysToSell: number | null; hasExclusivity: boolean; exclusivityEndsAt: string | null;
  matchCount: number; avgMatchScore: number;         // demand from buyer↔property matches
  perfectMatchCount: number;                          // matches with score ≥ 80
  medianDomCity: number | null;                       // median days-on-market (same city/band)
  recentBuyerActivity: number;                        // interactions in last 30d
  market: { inventoryTrendPct: number | null; concentrationLevel: string | null; topSharePct: number | null } | null;
  sellerLinked: boolean; valuationEstimate: number | null;
  seller: { linked: boolean; readiness: number | null; trust: number | null; priceFlexibility: number | null; mainObjection: string | null; hasSignedAgreement: boolean } | null; // 29.3.3
  valuation: ValuationView;                            // read-only valuation link (29.3.1)
  campaignActive: boolean | null;                     // marketing signal (null = unknown)
  lastActivityAt: string | null;
  openMissions: number;
  truthScore: number | null;
}

// Part 2 — property health.
export interface PropertyHealth {
  listingHealth: number; marketingHealth: number; pricingHealth: number;
  demand: number; urgency: number; momentum: number; freshness: number; competitionPressure: number;
  confidence: number;                                 // 0..100 data-completeness behind the health
  label: "בריא" | "יציב" | "בסיכון" | "קריטי" | "חדש";
  basis: string[];
}

// Part 6 — risk.
export type RiskType = "stale" | "overpriced" | "underpriced" | "weak_exposure" | "seller_frustration" | "competition_pressure" | "missing_marketing" | "no_activity" | "missing_valuation";
export interface PropertyRisk { type: RiskType; severity: Impact; title: string; evidence: string[] }

// Part 7 — opportunity.
export type OppType = "high_demand" | "new_buyers" | "price_opportunity" | "market_shift" | "competitive_weakness" | "territory_opportunity";
export interface PropertyOpportunity { type: OppType; title: string; evidence: string[]; impact: Impact }

// Part 4 — recommendation.
export interface ListingRecommendation {
  action: string; missionType: string; priority: number; roi: string;
  confidence: number; impact: Impact; deadlineDays: number | null; evidence: string[]; reason: string;
}

// Part 5 — timeline.
export interface PropertyTimelineEntry { at: string; kind: string; label: string }

// Part 1 — market performance (29.3.2).
export type DomBand = "fast" | "normal" | "slow" | "very_slow" | "unknown";
export const DOM_HE: Record<DomBand, string> = { fast: "מהיר", normal: "בקצב השוק", slow: "איטי", very_slow: "איטי מאוד", unknown: "לא ידוע" };
export type MarketPosition = "above" | "at" | "below" | "unknown";
export type PerformanceTrend = "improving" | "stable" | "declining";
export interface PerformanceInsight { text: string; evidence: string[] }
export interface MarketPerformance {
  score: number;                                      // 0..100
  domVsMarket: { days: number | null; median: number | null; ratio: number | null; band: DomBand };
  buyerDemand: { activeMatches: number; perfectMatches: number; avgMatchScore: number; recentActivity: number; demandScore: number };
  competition: { inventoryTrendPct: number | null; concentrationLevel: string | null; topSharePct: number | null; pressure: number };
  pricePosition: { rangePosition: string; gapPct: number | null };
  marketPosition: MarketPosition; momentum: number; trend: PerformanceTrend;
  insights: PerformanceInsight[];
}

// Part 1-2 — listing strategy (29.3.3).
export type StrategyType =
  | "hold" | "reduce_price" | "increase_price" | "refresh_marketing" | "launch_campaign"
  | "luxury_campaign" | "photography_refresh" | "open_house" | "buyer_reactivation"
  | "seller_meeting" | "valuation_update" | "premium_exposure" | "aggressive_selling" | "slow_burn";
export const STRATEGY_HE: Record<StrategyType, string> = {
  hold: "החזק פוזיציה", reduce_price: "הורדת מחיר", increase_price: "העלאת מחיר", refresh_marketing: "רענון שיווק",
  launch_campaign: "השקת קמפיין", luxury_campaign: "קמפיין יוקרה", photography_refresh: "רענון צילום", open_house: "בית פתוח",
  buyer_reactivation: "החייאת קונים", seller_meeting: "פגישת מוכר", valuation_update: "עדכון הערכת שווי",
  premium_exposure: "חשיפה פרימיום", aggressive_selling: "מכירה אגרסיבית", slow_burn: "בעירה איטית",
};
export type StrategyChange = "working" | "switch" | "succeeded" | "failed" | "review";
export interface SellerAlignment { readiness: number | null; trust: number | null; priceFlexibility: number | null; aggressiveOk: boolean; notes: string[] }
export interface PlaybookAction { order: number; action: string; missionType: string; durationDays: number | null; why: string }
export interface ListingStrategy {
  currentStrategy: StrategyType; recommendedStrategy: StrategyType;
  confidence: number; businessImpact: Impact;
  why: string[]; expectedOutcome: string; estimatedRoi: string;
  playbook: PlaybookAction[]; expectedDurationDays: number | null;
  requiredApprovals: string[]; risks: string[]; alternatives: StrategyType[];
  change: { signal: StrategyChange; reason: string };
  sellerAlignment: SellerAlignment;
}

// Part 10 — property scorecard.
export interface PropertyScorecard {
  id: string; title: string; city: string | null; price: number | null; status: string;
  health: PropertyHealth; risks: PropertyRisk[]; opportunities: PropertyOpportunity[];
  recommendations: ListingRecommendation[]; timeline: PropertyTimelineEntry[];
  classification: string[]; aiConfidence: number; truthScore: number | null; activeMissions: number;
  valuation: ValuationView;                            // shown as a badge (29.3.1)
  marketPerformance: MarketPerformance;                // 29.3.2
  strategy: ListingStrategy;                           // 29.3.3
}
