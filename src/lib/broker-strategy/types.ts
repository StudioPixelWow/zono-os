// ============================================================================
// Autonomous Growth Strategy™ — MAI-12 types (PURE, client-safe).
//
// Turns the MAI-11 coaching + MAI-10 gaps into a STRUCTURED execution strategy.
// It never invents strategy: every action originates from a measurable gap /
// opportunity already produced upstream and carries its supporting evidence,
// expected outcome, confidence, and estimated Zone Dominance impact. The Zone
// Dominance projection is a clearly-marked SIMULATION — an estimate, never a
// guarantee. No LLM, no free text, no fake values.
// ============================================================================

export const STRATEGY_MODEL_VERSION = "mai-12.0";
export const STRATEGY_VERSION = "v1";

/** Below this confidence an action is blocked rather than recommended. */
export const STRATEGY_MIN_ACTION_CONFIDENCE = 40;
/** Max simulated Zone Dominance gain a single action can contribute. */
export const MAX_GAIN_PER_ACTION = 5;
/** Cap on total simulated Zone Dominance improvement. */
export const MAX_TOTAL_IMPROVEMENT = 15;

/** The measurable gap types carried from MAI-10. */
export type StrategyGapType = "EXIT_SPEED" | "SUCCESS_RATE" | "MARKET_SHARE" | "ACTIVITY" | "PERFORMANCE" | "MOMENTUM" | "COVERAGE" | "PRICE_REDUCTION" | "LEADER" | "NEAR_LEADERSHIP" | "SCALE_WINNING" | "OTHER";
export type GapSeverity = "LOW" | "MEDIUM" | "HIGH";

/** Execution action categories (closed set). */
export type ActionCategory =
  | "Listing Acquisition" | "Pricing" | "Coverage" | "Neighborhood Focus" | "Property Type Focus"
  | "Market Presence" | "Activity" | "Exit Speed" | "Competitive Position" | "Market Opportunity";

export type TimeToImpact = "DAILY" | "WEEKLY" | "MONTHLY";
export type ImpactLevel = "LOW" | "MEDIUM" | "HIGH";
export type PriorityBand = "LOW" | "MEDIUM" | "HIGH" | "NONE";

/** One coach item (recommendation / opportunity / warning) fed into the engine. */
export interface CoachItemLite {
  id: string;
  kind: "recommendation" | "opportunity" | "warning";
  title: string;
  confidence: number;                 // 0..100
  estimatedImpact: ImpactLevel;
  supportingEvidence: string[];
  generatedFrom: string[];
  blockedBy: string[];
}

/** Per-broker engine input (assembled from broker_ai_coaching + broker_gap_analysis). */
export interface StrategyInput {
  brokerId: string;
  currentZoneScore: number | null;
  currentLeaderGap: number | null;
  momentum: number;
  currentMarketShare: number | null;  // fraction 0..1
  currentSuccessRate: number | null;  // fraction 0..1
  gapSeverityByType: Partial<Record<StrategyGapType, GapSeverity>>;
  strengthTypes: string[];            // gap types the broker is already strong in (conflict detection)
  coachItems: CoachItemLite[];
}

/** One structured strategy action (no free text). */
export interface StrategyAction {
  id: string;
  title: string;
  category: ActionCategory;
  priority: number;                   // 0..100
  priorityBand: PriorityBand;
  confidence: number;                 // 0..100
  estimatedImpact: ImpactLevel;
  estimatedZoneScoreGain: number;     // SIMULATION
  estimatedTimeToImpact: TimeToImpact;
  requiredEvidence: string[];         // literal observed facts
  relatedGap: StrategyGapType;
  generatedFrom: string[];            // source table.field identifiers
  blockedBy: string[];                // non-empty ⇒ blocked
}

/** A simulated metric transition (clearly marked, never a guarantee). */
export interface SimMetric { current: number | null; expected: number | null; delta: number | null }

/** The marked Zone Dominance + metric simulation. */
export interface StrategySimulation {
  simulation: true;
  disclaimer: string;
  zoneDominance: SimMetric;
  marketShare: SimMetric | null;
  successRate: SimMetric | null;
}

/** One traceable evidence row. */
export interface StrategyEvidence { label: string; source: string; relatedGap?: StrategyGapType }

/** A computed growth strategy for one broker (camelCase; service maps to DB). */
export interface BrokerStrategyResult {
  brokerId: string;
  overallPriority: PriorityBand;
  overallConfidence: number;
  expectedZoneScore: number | null;
  expectedImprovement: number | null;
  dailyActions: StrategyAction[];
  weeklyActions: StrategyAction[];
  monthlyActions: StrategyAction[];
  quickWins: StrategyAction[];
  longTermActions: StrategyAction[];
  blockedActions: StrategyAction[];
  estimatedImpact: StrategySimulation;
  evidence: StrategyEvidence[];
  metadata: Record<string, unknown>;
}

/** Persisted row of `broker_growth_strategy`. */
export interface BrokerGrowthStrategyRow {
  id: string;
  organization_id: string;
  broker_id: string;
  generated_at: string;
  model_version: string;
  strategy_version: string;
  overall_priority: string | null;
  overall_confidence: number;
  expected_zone_score: number | null;
  expected_improvement: number | null;
  daily_actions: StrategyAction[];
  weekly_actions: StrategyAction[];
  monthly_actions: StrategyAction[];
  quick_wins: StrategyAction[];
  long_term_actions: StrategyAction[];
  blocked_actions: StrategyAction[];
  estimated_impact: StrategySimulation;
  evidence: StrategyEvidence[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Summary returned by an org-wide strategy pass (for logging). */
export interface StrategyRecomputeSummary {
  brokers: number;
  withStrategy: number;
  notEnoughEvidence: number;
  blockedActions: number;
  written: number;
}
