// ============================================================================
// 🏷️ ZONO Seller Intelligence Agent™ — types (pure). 29.5.
// ----------------------------------------------------------------------------
// The full Seller agent. It CONSUMES the Seller Digital Twin (profile/health/
// memory/relationships/classification/learnings), the Listing Intelligence
// Agent's property + valuation + market performance, buyer↔property matches, the
// Unified Customer Journey, Relationship Graph and Truth — and adds a seller
// health model, selling strategy, risks, opportunities, buyer connection and a
// playbook. Recommendation-only; nothing auto-executes; evidence-only. No engine
// modified.
// ============================================================================
export const SELLER_AGENT_VERSION = "29.5";
export type Impact = "high" | "medium" | "low";

// Property + valuation intelligence for the seller's listing (from the Listing Agent).
export interface PropertyIntel {
  hasProperty: boolean; propertyId: string | null; status: string | null;
  askingPrice: number | null;
  valuationPosition: "above" | "within" | "below" | "unknown"; valuationConfidence: string; priceGapPct: number | null;
  marketScore: number | null; domBand: string | null; pricingHealth: number | null;
  competitionPressure: number | null; buyerDemandScore: number | null; timeOnMarketDays: number | null; campaignActive: boolean | null;
}
export interface BuyerMatchInput { buyerId: string; name: string; score: number }

// Normalized signals per seller (assembled from the Seller Twin + listing + matches + journey).
export interface SellerSignals {
  id: string; name: string;
  motivation: number; trust: number; priceExpectation: number | null; priceGapPct: number | null;
  urgency: number; readinessToSign: number; churnRisk: number; sellerConfidence: number;
  communicationHealth: number; completeness: number; decisionStyle: string;
  priceFlexibility: number | null; hasSignedAgreement: boolean; objections: string[];
  behavior: { calls: number; meetings: number; messages: number; valuationsSent: number; priceDiscussions: number; objections: number; documents: number; visits: number; agreements: number; statusChanges: number; followUps: number };
  healthScore: number; healthLabel: string; recencyScore: number; engagementScore: number; totalActivities: number; lastActivityAt: string | null;
  relationshipDegree: number; brokerConnections: string[];
  classification: string[]; learnings: string[];
  lifecycleRoles: string[]; repeatSeller: boolean; formerBuyer: boolean; investor: boolean; lifecycleStage: string | null;
  property: PropertyIntel;
  matchingBuyers: BuyerMatchInput[];
  truthScore: number | null;
}

// Part 1 — seller health.
export interface SellerHealth {
  sellerHealth: number; trust: number; motivation: number; readinessToSign: number; readinessToSell: number;
  communicationHealth: number; relationshipHealth: number; priceFlexibility: number; priceExpectation: number | null;
  churnRisk: number; decisionConfidence: number;
  label: "בריא" | "יציב" | "בסיכון" | "רדום" | "חדש";
  basis: string[];
}

// Part 2 — seller strategy.
export type SellerStrategyType =
  | "WAIT" | "SELLER_MEETING" | "PRICE_ALIGNMENT" | "PRICE_REDUCTION" | "VALUATION_UPDATE" | "LIST_PROPERTY"
  | "MARKETING_PREPARATION" | "LAUNCH_MARKETING" | "OPEN_HOUSE" | "NEGOTIATE" | "AGREEMENT" | "LONG_TERM_NURTURE";
export const SELLER_STRATEGY_HE: Record<SellerStrategyType, string> = {
  WAIT: "המתן", SELLER_MEETING: "פגישת מוכר", PRICE_ALIGNMENT: "יישור מחיר", PRICE_REDUCTION: "הורדת מחיר", VALUATION_UPDATE: "עדכון הערכת שווי",
  LIST_PROPERTY: "העלאת הנכס לשיווק", MARKETING_PREPARATION: "הכנת שיווק", LAUNCH_MARKETING: "השקת שיווק", OPEN_HOUSE: "בית פתוח",
  NEGOTIATE: "משא ומתן", AGREEMENT: "החתמת הסכם", LONG_TERM_NURTURE: "טיפוח ארוך-טווח",
};
export type StrategyChange = "working" | "switch" | "succeeded" | "failed" | "review";
export interface PlaybookAction { order: number; action: string; missionType: string; durationDays: number | null; why: string }
export interface SellerStrategy {
  currentStrategy: SellerStrategyType; recommendedStrategy: SellerStrategyType;
  confidence: number; businessImpact: Impact;
  why: string[]; expectedOutcome: string; estimatedRoi: string;
  playbook: PlaybookAction[]; expectedDurationDays: number | null;
  requiredApprovals: string[]; alternatives: SellerStrategyType[]; change: { signal: StrategyChange; reason: string };
}

// Part 4 — risks.
export type SellerRiskType = "high_churn" | "trust_loss" | "price_resistance" | "inactive_seller" | "competitor_risk" | "listing_delay" | "communication_problems" | "weak_valuation" | "relationship_decline";
export interface SellerRisk { type: SellerRiskType; severity: Impact; title: string; evidence: string[] }

// Part 5 — opportunities.
export type SellerOppType = "ready_to_sign" | "price_alignment" | "strong_market" | "buyer_waiting" | "high_demand" | "luxury_opportunity" | "investment_opportunity" | "fast_sale";
export interface SellerOpportunity { type: SellerOppType; title: string; evidence: string[]; impact: Impact }

// Part 8 — buyer connection.
export interface BuyerConnection { waitingBuyers: BuyerMatchInput[]; matchingBuyers: BuyerMatchInput[]; priorityBuyers: BuyerMatchInput[]; matchingBrokers: string[]; notes: string[] }

// Part 9 — seller scorecard.
export interface SellerScorecard {
  id: string; name: string; classification: string[];
  health: SellerHealth; strategy: SellerStrategy; property: PropertyIntel;
  risks: SellerRisk[]; opportunities: SellerOpportunity[]; buyerConnection: BuyerConnection;
  lifecycleRoles: string[]; lifecycleStage: string | null;
  truthScore: number | null; aiConfidence: number; aiRecommendation: string;
}
