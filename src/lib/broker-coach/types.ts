// ============================================================================
// Evidence-Based Broker Coach™ — MAI-11 types (PURE, client-safe).
//
// The coach turns the Market Acceptance Intelligence™ pipeline (MAI-6..10) into
// STRUCTURED, evidence-backed coaching. It is not a chatbot and uses no LLM:
// every recommendation is generated deterministically and references the exact
// observed evidence that produced it. Insufficient evidence ⇒ "Not enough
// evidence", never invented advice.
// ============================================================================

/** Coach model + schema versions. */
export const COACH_MODEL_VERSION = "mai-11.0";
export const COACH_VERSION = "v1";

/** A profile must reach this confidence to generate coaching from it. */
export const COACH_MIN_PROFILE_CONFIDENCE = 30;

/** Coaching categories (closed set). */
export type CoachCategory =
  | "PERFORMANCE" | "MARKET_POSITION" | "GAP_CLOSING" | "COVERAGE" | "PRICING"
  | "ACTIVITY" | "MOMENTUM" | "MARKET_OPPORTUNITIES" | "RISK" | "STRENGTH_REINFORCEMENT";

export type ImpactLevel = "LOW" | "MEDIUM" | "HIGH";
export type PriorityBand = "LOW" | "MEDIUM" | "HIGH" | "NONE";

/** A measurable gap carried from MAI-10 into the coach. */
export interface CoachGap {
  type: "EXIT_SPEED" | "SUCCESS_RATE" | "MARKET_SHARE" | "ACTIVITY" | "PERFORMANCE" | "MOMENTUM" | "COVERAGE" | "PRICE_REDUCTION";
  label: string;
  brokerValue: number | null;
  benchmarkValue: number | null;
  gapValue: number | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;                 // 0..1
}

/** A measurable strength carried from MAI-10 into the coach. */
export interface CoachStrength {
  type: string;
  label: string;
  brokerValue: number | null;
  benchmarkValue: number | null;
  advantage: number | null;
}

/** One broker × segment × window gap profile (mapped from broker_gap_analysis). */
export interface CoachGapProfile {
  segmentLabel: string;
  windowDays: number;
  zoneDominanceScore: number | null;
  zoneDominanceLevel: string;
  leaderGap: number | null;
  winningDnaMatchScore: number | null;
  confidence: number;                 // 0..100
  momentum: number;                   // broker momentum (recent vs long-run)
  gaps: CoachGap[];
  strengths: CoachStrength[];
}

/** Optional org-level broker context (mapped from broker_market_intelligence). */
export interface CoachMarketContext {
  marketActivityScore: number | null;
  marketSuccessRate: number | null;
  dominantNeighborhood: string | null;
  dominantPropertyType: string | null;
}

/** Per-broker engine input. */
export interface BrokerCoachInput {
  brokerId: string;
  gapProfiles: CoachGapProfile[];
  context?: CoachMarketContext;
}

/** One traceable evidence row behind a recommendation. */
export interface CoachEvidence {
  label: string;                      // Hebrew, the literal observed fact + numbers
  source: string;                     // e.g. "broker_gap_analysis.exit_speed_gap_days"
  brokerValue?: number | null;
  benchmarkValue?: number | null;
  gapValue?: number | null;
  segment?: string;
}

/** One structured coaching recommendation (no free text). */
export interface CoachRecommendation {
  id: string;
  priority: number;                   // 0..100 (ranked)
  priorityBand: PriorityBand;
  category: CoachCategory;
  title: string;
  summary: string;
  confidence: number;                 // 0..100
  estimatedImpact: ImpactLevel;
  supportingEvidence: string[];       // Hebrew literal facts
  blockedBy: string[];                // dependencies missing (e.g. "insufficient_sample")
  generatedFrom: string[];            // source table.field identifiers
}

/** A structured factual insight (observation, never advice). */
export interface CoachInsight { id: string; category: CoachCategory; title: string; detail: string; confidence: number; generatedFrom: string[] }

/** The daily coach summary. */
export interface DailyCoach {
  topPriorities: string[];            // rec ids
  opportunities: string[];            // opportunity rec ids
  risks: string[];                    // warning ids
  wins: string[];                     // strength ids
  weeklyTrend: "UP" | "FLAT" | "DOWN";
  zoneDominanceTrend: "UP" | "FLAT" | "DOWN";
  trendBasis: string;                 // honest note on what the trend is derived from
}

/** A computed coaching result for one broker (camelCase; service maps to DB). */
export interface BrokerCoachResult {
  brokerId: string;
  overallPriority: PriorityBand;
  overallConfidence: number;
  recommendations: CoachRecommendation[];
  insights: CoachInsight[];
  warnings: CoachRecommendation[];
  opportunities: CoachRecommendation[];
  strengths: CoachRecommendation[];
  evidence: CoachEvidence[];
  dailyCoach: DailyCoach;
  metadata: Record<string, unknown>;
}

/** Persisted row of `broker_ai_coaching`. */
export interface BrokerAiCoachingRow {
  id: string;
  organization_id: string;
  broker_id: string;
  generated_at: string;
  model_version: string;
  coach_version: string;
  overall_priority: string | null;
  overall_confidence: number;
  recommendations: CoachRecommendation[];
  insights: CoachInsight[];
  warnings: CoachRecommendation[];
  opportunities: CoachRecommendation[];
  strengths: CoachRecommendation[];
  evidence: CoachEvidence[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Summary returned by an org-wide coach pass (for logging). */
export interface CoachRecomputeSummary {
  brokers: number;
  coached: number;            // brokers with ≥1 recommendation
  notEnoughEvidence: number;  // brokers returning "Not enough evidence"
  written: number;
}
