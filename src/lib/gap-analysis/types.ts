// ============================================================================
// Broker Gap Analysis & Zone Dominance Score™ — MAI-10 types (PURE, client-safe).
//
// Compares each broker against the segment's Winning DNA (MAI-9) + area leader
// (MAI-7) and produces measurable, explainable gaps + a cautious Zone Dominance
// Score. EVIDENCE ONLY — no recommendations, no advice, no AI, no fake values.
// ============================================================================
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

/** Gap Analysis model version. Bump when the scoring/gap logic changes. */
export const GAP_MODEL_VERSION = "mai-10.0";

/** Windows gap analysis is computed for. */
export const GAP_WINDOWS = [7, 14, 30, 60, 90] as const;

/** Below this segment sample size a profile is INSUFFICIENT_DATA. */
export const GAP_SMALL_SAMPLE = 5;

/** Below this confidence a Zone Dominance Score is suppressed (INSUFFICIENT_DATA). */
export const GAP_MIN_CONFIDENCE = 30;

/** Cautious Zone Dominance band. */
export type ZoneDominanceLevel = "LOW" | "EMERGING" | "COMPETITIVE" | "STRONG" | "LEADER_LIKE" | "INSUFFICIENT_DATA";

/** A measurable gap dimension. */
export type GapType = "EXIT_SPEED" | "SUCCESS_RATE" | "MARKET_SHARE" | "ACTIVITY" | "PERFORMANCE" | "MOMENTUM" | "COVERAGE" | "PRICE_REDUCTION";
export type GapSeverity = "LOW" | "MEDIUM" | "HIGH";

/** One broker-attributed listing record fed into the engine. */
export interface GapRecord {
  brokerId: string;
  provider: string;
  externalId: string;
  classification: MarketAcceptanceClassification | null;
  currentState: ListingLifecycleState | null;
  scoreConfidence: number;            // 0..1
  daysOnMarket: number | null;
  lastKnownPrice: number | null;
  reductionPct: number | null;        // fraction 0..1
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  lastScanAt: string | null;          // ISO — window inclusion anchor
}

/** One measurable gap (broker behind the benchmark). */
export interface GapItem {
  type: GapType;
  label: string;                      // Hebrew
  brokerValue: number | null;
  benchmarkValue: number | null;
  gapValue: number | null;
  severity: GapSeverity;
  confidence: number;                 // 0..1
}

/** One measurable strength (broker ahead of the benchmark). */
export interface StrengthItem {
  type: GapType;
  label: string;                      // Hebrew
  brokerValue: number | null;
  benchmarkValue: number | null;
  advantage: number | null;
}

/** One explainable evidence row (Hebrew). */
export interface GapEvidence {
  label: string;
  metric: string;
  brokerValue?: number | null;
  benchmarkValue?: number | null;
  gapValue?: number | null;
}

/** A computed gap-analysis result (camelCase; service maps to DB). */
export interface GapResult {
  brokerId: string;
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  priceBucket: string | null;
  windowDays: number;

  zoneDominanceScore: number | null;
  zoneDominanceLevel: ZoneDominanceLevel;

  leaderGap: number | null;
  winningDnaMatchScore: number | null;
  successRateGap: number | null;
  exitSpeedGapDays: number | null;
  marketShareGap: number | null;
  activityGap: number | null;
  performanceGap: number | null;
  momentumGap: number | null;
  coverageGap: number | null;
  priceReductionGap: number | null;

  strengths: StrengthItem[];
  gaps: GapItem[];
  evidence: GapEvidence[];
  metadata: Record<string, unknown>;
  confidence: number;
}

/** Persisted row of `broker_gap_analysis`. */
export interface BrokerGapAnalysisRow {
  id: string;
  organization_id: string;
  broker_id: string;
  city: string | null;
  neighborhood: string | null;
  property_type: string | null;
  rooms: number | null;
  price_bucket: string | null;
  window_days: number;
  calculated_at: string;
  model_version: string;
  zone_dominance_score: number | null;
  zone_dominance_level: string | null;
  leader_gap: number | null;
  winning_dna_match_score: number | null;
  success_rate_gap: number | null;
  exit_speed_gap_days: number | null;
  market_share_gap: number | null;
  activity_gap: number | null;
  performance_gap: number | null;
  momentum_gap: number | null;
  coverage_gap: number | null;
  price_reduction_gap: number | null;
  strengths: StrengthItem[];
  gaps: GapItem[];
  evidence: GapEvidence[];
  metadata: Record<string, unknown>;
  confidence: number;
  created_at: string;
  updated_at: string;
}

/** Summary returned by an org-wide gap-analysis recompute pass (for logging). */
export interface GapRecomputeSummary {
  profiles: number;          // (broker × segment × window) rows produced
  brokers: number;
  scored: number;            // rows with a numeric Zone Dominance Score
  insufficient: number;      // INSUFFICIENT_DATA rows
  withGaps: number;
  written: number;
}
