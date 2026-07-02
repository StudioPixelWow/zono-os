// ============================================================================
// 🏠 ZONO Listing Intelligence Agent™ — types (pure). 29.3.
// ----------------------------------------------------------------------------
// The first real autonomous BUSINESS agent — one per property. It reuses the
// Agent Framework and every intelligence engine (Property / Valuation /
// Territory / Competition / Decision / Truth / Customer Journey / Relationship /
// Mission history) READ-ONLY. Everything is recommendation-only; nothing
// auto-executes. Evidence-only — sparse data → conservative + low confidence.
// ============================================================================
export const LISTING_AGENT_VERSION = "29.3";

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
  recentBuyerActivity: number;                        // interactions in last 30d
  market: { inventoryTrendPct: number | null; concentrationLevel: string | null; topSharePct: number | null } | null;
  sellerLinked: boolean; valuationEstimate: number | null;
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

// Part 10 — property scorecard.
export interface PropertyScorecard {
  id: string; title: string; city: string | null; price: number | null; status: string;
  health: PropertyHealth; risks: PropertyRisk[]; opportunities: PropertyOpportunity[];
  recommendations: ListingRecommendation[]; timeline: PropertyTimelineEntry[];
  classification: string[]; aiConfidence: number; truthScore: number | null; activeMissions: number;
}
