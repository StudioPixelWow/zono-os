// ============================================================================
// 🏢 ZONO Office Growth Agent™ — types (pure). 29.7.
// ----------------------------------------------------------------------------
// Unlike the CRM agents (which manage a person via a Digital Twin), this agent
// manages the BROKERAGE BUSINESS itself. It CONSUMES the Chief of Staff (org
// score + market/competitive/mission signals), the four CRM Agent scorecards
// (listing/buyer/seller/lead pipelines), the Offices Index (offices/brokers),
// Broker Intelligence (broker rankings), Competitive Intelligence and Territory
// Intelligence — and adds an office health model, inventory + broker + pipeline
// intelligence, an office strategy, playbooks, decisions, risks and opportunities.
// Recommendation-only; strategy/decisions are approval-gated mission proposals;
// nothing auto-executes. Evidence-only. No engine modified.
// ============================================================================
export const OFFICE_AGENT_VERSION = "29.7";
export type Impact = "high" | "medium" | "low";

// ── Normalized signals for the brokerage (assembled from every reused engine) ──
export interface BrokerCard { name: string; status: string; activeListings: number; recentListings: number; office: string | null }
export interface CityInventory { city: string; listings: number }
export interface CompetitorMove { name: string; city: string; growthPct: number }
export interface AreaOpportunity { title: string; area: string | null; evidence: string }

export interface OfficeSignals {
  id: string; name: string;
  // Organization totals (Offices Index).
  offices: number; brokers: number; activeListings: number; activeCities: number; brands: number;
  agentsWithOffice: number; dataQualityScore: number;
  // Chief of Staff org/market scores.
  businessScore: number; executionScore: number; aiConfidence: number;
  avgBusinessScore: number; avgConfidence: number; citiesAnalyzed: number; decliningCities: number;
  // Mission pipeline (Action Center).
  missions: { active: number; completed: number; cancelled: number; blocked: number; waiting: number; inProgress: number; executionScore: number; completionRatePct: number };
  // CRM pipelines (per-agent scorecard overviews).
  buyerPipeline: { total: number; hot: number; cold: number; closing: number; withMatches: number };
  sellerPipeline: { total: number; hot: number; atRisk: number; readyToSign: number; priceIssues: number; withBuyers: number };
  leadPipeline: { total: number; hot: number; duplicates: number; convertReady: number; nurture: number; humanReview: number };
  listingPipeline: { total: number; healthy: number; critical: number; luxury: number; stale: number; highOpportunity: number };
  // Inventory intelligence inputs.
  cityInventory: CityInventory[]; commercialListings: number;
  // Broker Intelligence.
  brokerCards: BrokerCard[];
  // Competitive Intelligence (aggregated across analyzed cities).
  competitive: { growingCompetitors: CompetitorMove[]; decliningCompetitors: CompetitorMove[]; inventoryTrendPct: number; emergingAreas: AreaOpportunity[]; topOfficeSharePct: number; marketConcentration: number };
  // Territory Intelligence.
  strongAreas: string[]; weakAreas: string[];
  truthScore: number | null;
}

// Part 1 — office health (10 metrics).
export interface OfficeHealth {
  businessHealth: number; growthHealth: number; inventoryHealth: number;
  buyerPipelineHealth: number; sellerPipelineHealth: number; leadPipelineHealth: number;
  brokerProductivity: number; marketPosition: number; expansionReadiness: number; businessConfidence: number;
  label: "מצוינת" | "בריאה" | "יציבה" | "בסיכון" | "חדשה";
  basis: string[];
}

// Part 2 — inventory intelligence.
export type InventoryFindingType =
  | "inventory_shortage" | "inventory_surplus" | "weak_neighborhood" | "strong_neighborhood"
  | "property_type_imbalance" | "missing_luxury" | "missing_commercial";
export interface InventoryFinding { type: InventoryFindingType; title: string; why: string; evidence: string[]; impact: Impact }

// Part 3 — broker performance.
export type BrokerFindingType =
  | "top_performer" | "declining_broker" | "inactive_broker" | "overloaded_broker"
  | "unused_capacity" | "recruitment_need" | "training_opportunity";
export interface BrokerFinding { type: BrokerFindingType; title: string; why: string; evidence: string[]; impact: Impact }

// Part 4 — office strategy.
export type OfficeStrategyType =
  | "GROW_TERRITORY" | "RECRUIT_BROKERS" | "ACQUIRE_INVENTORY" | "IMPROVE_CONVERSION" | "STRENGTHEN_MARKETING"
  | "LUXURY_EXPANSION" | "COMMERCIAL_EXPANSION" | "DEFEND_TERRITORY" | "COST_OPTIMIZATION";
export const OFFICE_STRATEGY_HE: Record<OfficeStrategyType, string> = {
  GROW_TERRITORY: "הרחבת טריטוריה", RECRUIT_BROKERS: "גיוס מתווכים", ACQUIRE_INVENTORY: "השגת מלאי", IMPROVE_CONVERSION: "שיפור המרה",
  STRENGTHEN_MARKETING: "חיזוק שיווק", LUXURY_EXPANSION: "הרחבת יוקרה", COMMERCIAL_EXPANSION: "הרחבה מסחרית", DEFEND_TERRITORY: "הגנת טריטוריה", COST_OPTIMIZATION: "ייעול עלויות",
};
export type StrategyChange = "working" | "switch" | "succeeded" | "failed" | "review";
export interface PlaybookStep { order: number; action: string; missionType: string; durationDays: number | null; why: string }
export interface OfficeStrategy {
  currentStrategy: OfficeStrategyType; recommendedStrategy: OfficeStrategyType;
  confidence: number; businessImpact: Impact;
  why: string[]; expectedResult: string; estimatedRoi: string;
  playbook: PlaybookStep[]; expectedDurationDays: number | null;
  requiredApprovals: string[]; alternatives: OfficeStrategyType[]; change: { signal: StrategyChange; reason: string };
}

// Part 5 — competitive intelligence findings.
export type CompetitiveFindingType =
  | "lost_market_share" | "growing_competitor" | "weak_competitor" | "expansion_opportunity"
  | "territory_opportunity" | "competitive_threat";
export interface CompetitiveFinding { type: CompetitiveFindingType; title: string; why: string; evidence: string[]; impact: Impact }

// Part 6 — pipeline intelligence.
export interface PipelineStage { name: string; health: number; volume: number; bottleneck: string | null; note: string }
export interface PipelineIntelligence { stages: PipelineStage[]; bottlenecks: string[]; overallHealth: number }

// Part 8 — decisions.
export type OfficeDecisionType =
  | "RECRUIT" | "EXPAND" | "REDUCE" | "PAUSE" | "INVEST" | "REALLOCATE" | "CAMPAIGN" | "TRAINING" | "FOLLOW_UP";
export const OFFICE_DECISION_HE: Record<OfficeDecisionType, string> = {
  RECRUIT: "גיוס", EXPAND: "הרחבה", REDUCE: "צמצום", PAUSE: "השהיה", INVEST: "השקעה",
  REALLOCATE: "הקצאה מחדש", CAMPAIGN: "קמפיין", TRAINING: "הדרכה", FOLLOW_UP: "מעקב",
};
export interface OfficeDecision { type: OfficeDecisionType; title: string; why: string; evidence: string[]; impact: Impact; requiresApproval: boolean }

// Risks / opportunities.
export interface OfficeRisk { title: string; severity: Impact; evidence: string[] }
export interface OfficeOpportunity { title: string; impact: Impact; evidence: string[] }

// Part 9 — office growth scorecard.
export interface OfficeScorecard {
  id: string; name: string;
  health: OfficeHealth;
  growthScore: number; inventoryScore: number; brokerScore: number; marketPosition: number;
  inventory: InventoryFinding[]; brokerFindings: BrokerFinding[]; competitive: CompetitiveFinding[];
  pipeline: PipelineIntelligence; strategy: OfficeStrategy; decisions: OfficeDecision[];
  risks: OfficeRisk[]; opportunities: OfficeOpportunity[];
  truthScore: number | null; aiConfidence: number; aiRecommendation: string;
}
