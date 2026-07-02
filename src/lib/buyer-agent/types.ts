// ============================================================================
// 🛒 ZONO Buyer Intelligence Agent™ — types (pure). 29.4.
// ----------------------------------------------------------------------------
// The first full Buyer agent. It CONSUMES the existing Buyer Digital Twin
// (profile/health/memory/relationships/classification/learnings), buyer↔property
// matches, the Unified Customer Journey, Relationship Graph and Truth — and adds
// a buyer health model, buying strategy, match intelligence, risks, opportunities
// and a playbook. Recommendation-only; nothing auto-executes; evidence-only. No
// engine/framework modified.
// ============================================================================
export const BUYER_AGENT_VERSION = "29.4";
export type Impact = "high" | "medium" | "low";

// Normalized signals per buyer (assembled from the Buyer Twin + matches + journey).
export interface BuyerMatchInput { listingId: string; title: string; score: number; ageDays: number | null; reasons: string[] }
export interface BuyerSignals {
  id: string; name: string;
  // from twin.profile
  readiness: number; urgency: number; trust: number; probabilityToBuy: number;
  communicationHealth: number; budgetConfidence: number; completeness: number;
  decisionStyle: string; motivation: string; timeline: string;
  behavior: { views: number; saves: number; rejects: number; visits: number; offers: number; calls: number; meetings: number; messages: number; searches: number };
  // from twin.health/memory
  healthScore: number; healthLabel: string; recencyScore: number; engagementScore: number; totalActivities: number; lastActivityAt: string | null;
  // from twin.relationships
  relationshipDegree: number;
  classification: string[];                 // hot/cold/luxury/investor/family/dormant/high-value
  learnings: string[];                      // twin learning types (e.g. urgency_up, dormant, preference_drift, intent_up)
  // journey (Unified Customer Journey)
  lifecycleRoles: string[]; repeatClient: boolean; investor: boolean; formerClient: boolean; lifecycleStage: string | null;
  // matches (buyer↔property)
  matches: BuyerMatchInput[];
  // seller/broker connections (Relationship Graph)
  brokerConnections: string[];
  truthScore: number | null;
  budgetChanged: boolean; timelineChanged: boolean;
}

// Part 1 — buyer health.
export interface BuyerHealth {
  buyerHealth: number; buyingReadiness: number; buyingMomentum: number; buyingConfidence: number;
  trust: number; urgency: number; activity: number; relationshipHealth: number; communicationHealth: number; decisionConfidence: number;
  label: "בריא" | "יציב" | "בסיכון" | "רדום" | "חדש";
  basis: string[];
}

// Part 2 — buyer strategy.
export type BuyerStrategyType =
  | "WAIT" | "CONTACT" | "SEND_PROPERTIES" | "BOOK_VISIT" | "BOOK_SECOND_VISIT" | "NEGOTIATE"
  | "COLLECT_INFORMATION" | "FINANCING" | "LAWYER_STAGE" | "CLOSE_DEAL" | "LONG_TERM_NURTURE";
export const BUYER_STRATEGY_HE: Record<BuyerStrategyType, string> = {
  WAIT: "המתן", CONTACT: "צור קשר", SEND_PROPERTIES: "שלח נכסים", BOOK_VISIT: "קבע ביקור", BOOK_SECOND_VISIT: "קבע ביקור שני",
  NEGOTIATE: "נהל משא ומתן", COLLECT_INFORMATION: "אסוף מידע", FINANCING: "מימון", LAWYER_STAGE: "שלב עורך דין",
  CLOSE_DEAL: "סגור עסקה", LONG_TERM_NURTURE: "טיפוח ארוך-טווח",
};
export type StrategyChange = "working" | "switch" | "succeeded" | "failed" | "review";
export interface PlaybookAction { order: number; action: string; missionType: string; durationDays: number | null; why: string }
export interface BuyerStrategy {
  currentStrategy: BuyerStrategyType; recommendedStrategy: BuyerStrategyType;
  confidence: number; businessImpact: Impact;
  why: string[]; expectedOutcome: string; estimatedRoi: string;
  playbook: PlaybookAction[]; expectedDurationDays: number | null;
  requiredApprovals: string[]; alternatives: BuyerStrategyType[]; change: { signal: StrategyChange; reason: string };
}

// Part 3 — match intelligence.
export type MatchTier = "perfect" | "emerging" | "hidden" | "future" | "expired";
export interface MatchItem { listingId: string; title: string; score: number; why: string[]; tier: MatchTier }
export interface MatchIntel { perfect: MatchItem[]; emerging: MatchItem[]; hidden: MatchItem[]; future: MatchItem[]; expired: MatchItem[]; notes: string[] }

// Part 4 — risks.
export type BuyerRiskType = "cold_buyer" | "ghosting" | "lost_interest" | "budget_problem" | "timeline_delay" | "competition" | "poor_matching" | "no_activity" | "decision_fatigue";
export interface BuyerRisk { type: BuyerRiskType; severity: Impact; title: string; evidence: string[] }

// Part 5 — opportunities.
export type BuyerOppType = "high_motivation" | "market_opportunity" | "new_inventory" | "price_reduction" | "hidden_match" | "luxury_opportunity" | "investment_opportunity";
export interface BuyerOpportunity { type: BuyerOppType; title: string; evidence: string[]; impact: Impact }

// Part 8 — seller/listing connection.
export interface SellerConnection { priorityListings: { listingId: string; title: string; score: number }[]; priorityBrokers: string[]; notes: string[] }

// Part 9 — buyer scorecard.
export interface BuyerScorecard {
  id: string; name: string; classification: string[];
  health: BuyerHealth; strategy: BuyerStrategy; matchIntel: MatchIntel;
  risks: BuyerRisk[]; opportunities: BuyerOpportunity[]; sellerConnection: SellerConnection;
  lifecycleRoles: string[]; lifecycleStage: string | null;
  truthScore: number | null; aiConfidence: number; aiRecommendation: string;
}
