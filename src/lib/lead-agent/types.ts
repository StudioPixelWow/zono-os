// ============================================================================
// 🎯 ZONO Lead Intelligence Agent™ — types (pure). 29.6.
// ----------------------------------------------------------------------------
// Leads are the entrance point into ZONO. This agent CONSUMES the Lead Digital
// Twin (profile/health/memory/relationships/classification/learnings), the
// Unified Customer Journey and the Relationship Graph — and adds a lead health
// model, intent engine, strategy, risks, opportunities, routing and a playbook.
// Recommendation-only; routing/conversion are approval-gated mission proposals;
// nothing auto-executes. Evidence-only. No engine modified.
// ============================================================================
export const LEAD_AGENT_VERSION = "29.6";
export type Impact = "high" | "medium" | "low";
export type LeadIntent = "buyer" | "seller" | "both" | "investor" | "renter" | "unknown";

// Normalized signals per lead (assembled from the Lead Twin + journey + graph).
export interface LeadSignals {
  id: string; name: string;
  source: string | null; sourceQuality: number; leadQuality: number;
  intent: LeadIntent; intentConfidence: number; buyerSellerFit: string;
  urgency: number; conversionProbability: number; duplicateRisk: number; contactRisk: number;
  communicationHealth: number; completeness: number; stage: string; nextBestAction: string;
  message: string | null;
  relationshipPath: string[];
  behavior: { calls: number; messages: number; emails: number; meetings: number; visits: number; statusChanges: number; followUps: number };
  healthScore: number; healthLabel: string; recencyScore: number; engagementScore: number; totalActivities: number; lastActivityAt: string | null;
  relationshipDegree: number; brokerConnections: string[];
  classification: string[]; learnings: string[];
  lifecycleRoles: string[]; existingCustomer: boolean; repeatClient: boolean; formerBuyer: boolean; formerSeller: boolean; investor: boolean; multiRole: boolean; lifecycleStage: string | null;
  hasConvertedBuyer: boolean; hasConvertedSeller: boolean; hasProperty: boolean;
  truthScore: number | null;
}

// Part 1 — lead health.
export interface LeadHealth {
  leadHealth: number; leadQuality: number; intentConfidence: number; conversionProbability: number;
  urgency: number; contactability: number; duplicateRisk: number; communicationHealth: number;
  relationshipStrength: number; dataCompleteness: number; decisionConfidence: number;
  label: "בריא" | "יציב" | "בסיכון" | "רדום" | "חדש";
  basis: string[];
}

// Part 2 — intent.
export interface IntentResult { intent: LeadIntent; confidence: number; fit: string; evidence: string[] }

// Part 7 — routing.
export type RoutingTarget = "buyer" | "seller" | "both" | "nurture" | "duplicate_review" | "human_review";
export const ROUTING_HE: Record<RoutingTarget, string> = { buyer: "קונה", seller: "מוכר", both: "שניהם", nurture: "טיפוח", duplicate_review: "בדיקת כפילות", human_review: "בדיקה אנושית" };
export interface Routing { target: RoutingTarget; confidence: number; why: string[]; note: string }

// Part 3 — strategy.
export type LeadStrategyType =
  | "QUALIFY" | "CONTACT_NOW" | "COLLECT_INFORMATION" | "DEDUPLICATE" | "CONVERT_TO_BUYER" | "CONVERT_TO_SELLER"
  | "CONVERT_TO_BOTH" | "SEND_PROPERTIES" | "SEND_VALUATION" | "SCHEDULE_CALL" | "LONG_TERM_NURTURE" | "WAIT";
export const LEAD_STRATEGY_HE: Record<LeadStrategyType, string> = {
  QUALIFY: "הסמכה", CONTACT_NOW: "צור קשר עכשיו", COLLECT_INFORMATION: "אסוף מידע", DEDUPLICATE: "טיפול בכפילות",
  CONVERT_TO_BUYER: "המרה לקונה", CONVERT_TO_SELLER: "המרה למוכר", CONVERT_TO_BOTH: "המרה לשניהם", SEND_PROPERTIES: "שלח נכסים",
  SEND_VALUATION: "שלח הערכת שווי", SCHEDULE_CALL: "קבע שיחה", LONG_TERM_NURTURE: "טיפוח ארוך-טווח", WAIT: "המתן",
};
export type StrategyChange = "working" | "switch" | "succeeded" | "failed" | "review";
export interface PlaybookAction { order: number; action: string; missionType: string; durationDays: number | null; why: string }
export interface LeadStrategy {
  currentStrategy: LeadStrategyType; recommendedStrategy: LeadStrategyType;
  confidence: number; businessImpact: Impact;
  why: string[]; expectedOutcome: string; estimatedRoi: string;
  playbook: PlaybookAction[]; expectedDurationDays: number | null;
  requiredApprovals: string[]; alternatives: LeadStrategyType[]; change: { signal: StrategyChange; reason: string };
}

// Part 4 — risks.
export type LeadRiskType = "duplicate_lead" | "low_contactability" | "cold_lead" | "unclear_intent" | "missing_data" | "bad_source" | "no_response" | "wrong_routing" | "high_competition" | "stale_lead";
export interface LeadRisk { type: LeadRiskType; severity: Impact; title: string; evidence: string[] }

// Part 5 — opportunities.
export type LeadOppType = "hot_lead" | "high_value_lead" | "buyer_opportunity" | "seller_opportunity" | "both_sides_opportunity" | "investor_opportunity" | "property_specific" | "fast_conversion";
export interface LeadOpportunity { type: LeadOppType; title: string; evidence: string[]; impact: Impact }

// Part 10 — lead scorecard.
export interface LeadScorecard {
  id: string; name: string; classification: string[];
  health: LeadHealth; intent: IntentResult; routing: Routing; strategy: LeadStrategy;
  risks: LeadRisk[]; opportunities: LeadOpportunity[];
  lifecycleRoles: string[]; lifecycleStage: string | null; relationshipPath: string[];
  truthScore: number | null; aiConfidence: number; aiRecommendation: string;
}
