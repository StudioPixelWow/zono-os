// ============================================================================
// Broker Winning DNA™ — MAI-9 types (PURE, client-safe).
//
// Discovers repeatable behavioural patterns shared by the OBSERVED LEADERS in
// each market segment. EVIDENCE ONLY — it never recommends, never compares to a
// specific broker, never tells anyone what to do. It only describes Observed
// Winning Behaviour / Patterns / Market DNA.
// ============================================================================
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

/** Winning DNA model version. Bump when the pattern-extraction logic changes. */
export const WINNING_DNA_MODEL_VERSION = "mai-9.0";

/** Windows winning DNA is extracted for. */
export const WINNING_DNA_WINDOWS = [7, 14, 30, 60, 90] as const;

/** Below this segment sample size DNA is low-confidence. */
export const WINNING_DNA_SMALL_SAMPLE = 5;

/** A broker must reach this dominance to be counted an "observed leader". */
export const LEADER_FLOOR = 40;

/** Below LEADER_FLOOR but at/above this, the segment yields a WEAK DNA (top broker). */
export const WEAK_DNA_FLOOR = 25;

/** Max leaders aggregated into one winning DNA. */
export const MAX_LEADERS = 3;

/** One broker-attributed listing record fed into the engine. */
export interface WinningDNARecord {
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

/** One observed behaviour pattern (a fact about the winning cohort, never advice). */
export interface DNAPattern { label: string; metric: string; value: number | string | boolean | null }
export interface DNAEvidence { label: string; metric: string; value: number | string | null }

export type ActivityLevel = "HIGH" | "MEDIUM" | "LOW";
export type MomentumTrend = "POSITIVE" | "STABLE" | "NEGATIVE";
export type PriceDiscipline = "HIGH" | "MEDIUM" | "LOW";

/** Normalized winning profile (the headline DNA summary). */
export interface WinningProfile {
  leaderCount: number;
  medianDaysOnMarket: number | null;
  medianPriceReductionPct: number | null;
  marketSuccessRate: number | null;
  rejectionRate: number | null;
  acceptanceRate: number | null;
  exitRate: number | null;
  marketDominance: number | null;
  marketShare: number | null;
  activityLevel: ActivityLevel;
  momentum: MomentumTrend;
  weak: boolean;
}

export interface PricingPatterns { medianReductionPct: number | null; avgReductionPct: number | null; priceDiscipline: PriceDiscipline; dominantPriceBucket: string | null }
export interface ActivityPatterns { activityLevel: ActivityLevel; momentum: MomentumTrend; avgMomentum: number; medianListingsPerLeader: number | null }
export interface ListingPatterns { dominantPropertyType: string | null; dominantRoomCount: number | null; medianListingsPerLeader: number | null; coverageShare: number | null }
export interface MarketPatterns { acceptanceRate: number | null; rejectionRate: number | null; exitRate: number | null; dominantNeighborhood: string | null; leaderShare: number | null }

/** A computed winning-DNA result (camelCase; service maps to DB). */
export interface WinningDNAResult {
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  priceBucket: string | null;
  windowDays: number;

  sampleSize: number;
  confidence: number;

  winningProfile: WinningProfile;
  behaviourPatterns: DNAPattern[];
  pricingPatterns: PricingPatterns;
  activityPatterns: ActivityPatterns;
  listingPatterns: ListingPatterns;
  marketPatterns: MarketPatterns;

  medianDaysOnMarket: number | null;
  medianPriceReductionPct: number | null;
  marketSuccessRate: number | null;
  marketDominance: number | null;
  marketShare: number | null;

  evidence: DNAEvidence[];
  metadata: Record<string, unknown>;
}

/** Persisted row of `broker_winning_dna`. */
export interface BrokerWinningDNARow {
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
  sample_size: number;
  confidence: number;
  winning_profile: WinningProfile;
  behaviour_patterns: DNAPattern[];
  pricing_patterns: PricingPatterns;
  activity_patterns: ActivityPatterns;
  listing_patterns: ListingPatterns;
  market_patterns: MarketPatterns;
  median_days_on_market: number | null;
  median_price_reduction_pct: number | null;
  market_success_rate: number | null;
  market_dominance: number | null;
  market_share: number | null;
  evidence: DNAEvidence[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Summary returned by an org-wide winning-DNA recompute pass (for logging). */
export interface WinningDNARecomputeSummary {
  segments: number;          // (segment × window) DNA rows produced
  strongDna: number;         // rows with at least one observed leader (dominance ≥ floor)
  weakDna: number;           // fragmented rows (top broker below the leader floor)
  lowConfidence: number;     // rows with confidence < 40
  written: number;
}
