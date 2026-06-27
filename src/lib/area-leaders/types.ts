// ============================================================================
// Area Leader & Market Dominance Engine™ — MAI-7 types (PURE, client-safe).
//
// Determines who DOMINATES each market segment from observed market behaviour.
// EVIDENCE ONLY: never "broker sold the most" — only Observed Market
// Leadership / Dominance / Momentum / Presence. No official-sale count, no
// commission, no revenue, no manual ranking.
// ============================================================================
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

/** Area Leader model version. Bump when the dominance/momentum formula changes. */
export const AREA_LEADER_MODEL_VERSION = "mai-7.0";

/** Time windows (days) leaders are computed for. */
export const AREA_LEADER_WINDOWS = [7, 14, 30, 60, 90] as const;

/** Below this sample size a segment never crowns a leader. */
export const AREA_SMALL_SAMPLE = 5;

/** Dominance separation below this (points) is treated as a tie (no stable leader). */
export const AREA_TIE_EPSILON = 2.0;

/** Dominance composite weights (sum 1). */
export const DOMINANCE_WEIGHTS = {
  activeListingShare: 0.35,
  marketSuccessShare: 0.30,
  marketActivityShare: 0.20,
  performance: 0.15,
} as const;

/** One broker-attributed listing record fed into the engine. */
export interface AreaLeaderRecord {
  brokerId: string;
  provider: string;
  externalId: string;
  classification: MarketAcceptanceClassification | null;
  currentState: ListingLifecycleState | null;
  scoreConfidence: number;            // 0..1
  daysOnMarket: number | null;
  lastKnownPrice: number | null;
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  lastScanAt: string | null;          // ISO — recency anchor for window inclusion
}

/** One explainable evidence item behind an area-leader row. */
export interface AreaLeaderEvidence {
  label: string;                      // Hebrew, human-readable
  metric: string;
  value: number | string | null;
  sampleSize?: number;
}

/** A computed area-leader result (camelCase; service maps to DB). */
export interface AreaLeaderResult {
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  priceBucket: string | null;
  windowDays: number;

  leaderBrokerId: string | null;      // null when small sample or tie
  leaderConfidence: number | null;

  activeListingShare: number | null;
  marketSuccessShare: number | null;
  marketActivityShare: number | null;
  marketExitSpeed: number | null;
  marketPresenceScore: number | null;
  marketPerformanceIndex: number | null;
  marketDominanceIndex: number | null;
  marketMomentumIndex: number | null;

  sampleSize: number;
  confidence: number;

  runnerUpBrokerId: string | null;
  runnerUpGap: number | null;

  evidence: AreaLeaderEvidence[];
  metadata: Record<string, unknown>;
}

/** Persisted row of `market_area_leaders`. */
export interface MarketAreaLeaderRow {
  id: string;
  organization_id: string;
  city: string | null;
  neighborhood: string | null;
  property_type: string | null;
  rooms: number | null;
  price_bucket: string | null;
  window_days: number;
  calculated_at: string;
  model_version: string;
  leader_broker_id: string | null;
  leader_confidence: number | null;
  active_listing_share: number | null;
  market_success_share: number | null;
  market_activity_share: number | null;
  market_exit_speed: number | null;
  market_presence_score: number | null;
  market_performance_index: number | null;
  market_dominance_index: number | null;
  market_momentum_index: number | null;
  sample_size: number;
  confidence: number;
  runner_up_broker_id: string | null;
  runner_up_gap: number | null;
  evidence: AreaLeaderEvidence[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Summary returned by an org-wide area-leader recompute pass (for logging). */
export interface AreaLeaderRecomputeSummary {
  segments: number;          // (segment × window) rows produced
  leadersFound: number;      // rows with a crowned leader
  ties: number;              // rows where the top two were within the tie epsilon
  smallSamples: number;      // rows with sample < AREA_SMALL_SAMPLE
  written: number;           // rows upserted
}
