// ============================================================================
// Broker Competitive Intelligence™ — MAI-8 types (PURE, client-safe).
//
// Explains WHY brokers perform differently by comparing each broker's observed
// market behaviour against the area leader, area average, and runner-up inside
// every market segment. EVIDENCE ONLY — never "this broker is better", never a
// ranking, never advice. Strengths / weaknesses / opportunities / risks are
// observed facts, not recommendations.
// ============================================================================
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

/** Competitive Intelligence model version. Bump when the comparison logic changes. */
export const COMPETITIVE_MODEL_VERSION = "mai-8.0";

/** Windows competitive profiles are computed for. */
export const COMPETITIVE_WINDOWS = [7, 14, 30, 60, 90] as const;

/** Below this segment sample size a profile is "insufficient" (low confidence). */
export const COMPETITIVE_SMALL_SAMPLE = 5;

/** Observed competitive position within a segment (NOT a ranking claim). */
export type MarketPosition = "LEADER" | "RUNNER_UP" | "CONTENDER" | "TRAILING" | "SOLE" | "INSUFFICIENT";

/** One broker-attributed listing record fed into the engine. */
export interface CompetitiveRecord {
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

/** One explainable competitive item (strength / weakness / opportunity / risk). */
export interface CompetitiveItem {
  type: "strength" | "weakness" | "opportunity" | "risk";
  label: string;                      // Hebrew, human-readable (observed fact, not advice)
  metric: string;
  value: number | string | null;
  comparedTo?: "leader" | "area_average" | "runner_up" | "previous_window";
}

/** One explainable evidence row. */
export interface CompetitiveEvidence { label: string; metric: string; value: number | string | null }

/** A computed competitive profile (camelCase; service maps to DB). */
export interface CompetitiveProfile {
  brokerId: string;
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  priceBucket: string | null;
  windowDays: number;

  marketPosition: MarketPosition;
  leaderGap: number | null;
  marketShare: number | null;
  marketGrowth: number;
  marketDecline: number;

  activityDelta: number | null;
  performanceDelta: number | null;
  successDelta: number | null;
  exitSpeedDelta: number | null;
  listingShareDelta: number | null;

  competitiveStrengths: CompetitiveItem[];
  competitiveWeaknesses: CompetitiveItem[];
  competitiveOpportunities: CompetitiveItem[];
  competitiveRisks: CompetitiveItem[];

  strongestSegment: string | null;
  weakestSegment: string | null;
  bestPropertyType: string | null;
  bestPriceBucket: string | null;
  bestNeighborhood: string | null;

  sampleSize: number;
  confidence: number;
  evidence: CompetitiveEvidence[];
  metadata: Record<string, unknown>;
}

/** Persisted row of `broker_competitive_intelligence`. */
export interface BrokerCompetitiveRow {
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
  market_position: string | null;
  leader_gap: number | null;
  market_share: number | null;
  market_growth: number | null;
  market_decline: number | null;
  activity_delta: number | null;
  performance_delta: number | null;
  success_delta: number | null;
  exit_speed_delta: number | null;
  listing_share_delta: number | null;
  competitive_strengths: CompetitiveItem[];
  competitive_weaknesses: CompetitiveItem[];
  competitive_opportunities: CompetitiveItem[];
  competitive_risks: CompetitiveItem[];
  strongest_segment: string | null;
  weakest_segment: string | null;
  best_property_type: string | null;
  best_price_bucket: string | null;
  best_neighborhood: string | null;
  sample_size: number;
  confidence: number;
  evidence: CompetitiveEvidence[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Summary returned by an org-wide competitive recompute pass (for logging). */
export interface CompetitiveRecomputeSummary {
  profiles: number;          // (broker × segment × window) rows produced
  brokers: number;           // distinct brokers profiled
  withStrengths: number;
  withRisks: number;
  insufficient: number;      // small-sample / insufficient profiles
  written: number;
}
