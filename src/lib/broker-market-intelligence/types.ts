// ============================================================================
// Broker Market Intelligence™ — MAI-6 types (PURE, client-safe).
//
// A broker's market-PERFORMANCE profile, built ONLY from observed market
// behaviour. EVIDENCE ONLY — it never claims an official sale. There is no
// "sold" / "closed deal" / "transaction" / "commission" anywhere here. The
// vocabulary is deliberately cautious: Likely Market Success (= LIKELY_ACCEPTED
// observation), Likely Market Exit, observed market behaviour.
// ============================================================================
import type { ListingLifecycleState, MarketAcceptanceClassification } from "@/lib/market-acceptance/types";

/** Broker Market Intelligence model version. Bump when the formula changes. */
export const BROKER_MARKET_MODEL_VERSION = "mai-6.0";

/** One joined per-listing record attributed to a broker (the engine input). */
export interface BrokerListingRecord {
  provider: string;
  externalId: string;
  classification: MarketAcceptanceClassification | null;
  currentState: ListingLifecycleState | null;
  /** 0..1 — max of the three MAI-3 confidences (evidence quality of this listing). */
  scoreConfidence: number;
  daysOnMarket: number | null;
  lastKnownPrice: number | null;
  /** Fraction 0..1 off the original price (null if unknown). */
  reductionPct: number | null;
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
}

/** One explainable evidence item behind a broker profile. */
export interface BrokerMarketEvidence {
  label: string;                 // Hebrew, human-readable
  metric: string;                // canonical metric key
  value: number | string | null;
  sampleSize?: number;
}

/** The computed broker market-intelligence profile (camelCase; service maps to DB). */
export interface BrokerMarketProfile {
  brokerId: string;

  activeListings: number;
  likelyMarketExitCount: number;
  likelyMarketSuccessCount: number;     // LIKELY_ACCEPTED observation — NOT a confirmed sale
  likelyMarketRejectedCount: number;
  returnedListingCount: number;
  uncertainListingCount: number;
  totalObservedListings: number;
  eligibleListings: number;             // success + exit + rejected (rate denominator)

  marketSuccessRate: number | null;     // fraction 0..1
  marketRejectionRate: number | null;
  marketExitRate: number | null;

  medianDaysOnMarket: number | null;
  averageDaysOnMarket: number | null;
  medianPriceReductionPct: number | null; // fraction 0..1
  averagePriceReductionPct: number | null;
  averageLastKnownPrice: number | null;

  dominantCity: string | null;
  dominantNeighborhood: string | null;
  dominantPropertyType: string | null;
  dominantRoomCount: number | null;
  dominantPriceBucket: string | null;

  marketActivityScore: number | null;     // 0..100
  marketPerformanceIndex: number | null;  // 0..100, null when no resolved listings
  confidence: number;                      // 0..100

  evidence: BrokerMarketEvidence[];
}

/** Persisted row of `broker_market_intelligence`. */
export interface BrokerMarketIntelligenceRow {
  id: string;
  organization_id: string;
  broker_id: string;
  calculated_at: string;
  model_version: string;
  active_listings: number;
  likely_market_exit_count: number;
  likely_market_success_count: number;
  likely_market_rejected_count: number;
  returned_listing_count: number;
  uncertain_listing_count: number;
  total_observed_listings: number;
  eligible_listings: number;
  market_success_rate: number | null;
  market_rejection_rate: number | null;
  market_exit_rate: number | null;
  median_days_on_market: number | null;
  average_days_on_market: number | null;
  median_price_reduction_pct: number | null;
  average_price_reduction_pct: number | null;
  average_last_known_price: number | null;
  dominant_city: string | null;
  dominant_neighborhood: string | null;
  dominant_property_type: string | null;
  dominant_room_count: number | null;
  dominant_price_bucket: string | null;
  market_activity_score: number | null;
  market_performance_index: number | null;
  confidence: number;
  evidence: BrokerMarketEvidence[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Summary returned by an org-wide broker-intelligence recompute pass (for logging). */
export interface BrokerMarketRecomputeSummary {
  brokers: number;            // broker profiles considered
  written: number;            // intelligence rows upserted
  withListings: number;       // brokers that had at least one observed listing
  emptyProfiles: number;      // brokers with no observed listings (still profiled)
  lowConfidence: number;      // brokers whose confidence < 40
}
