// ============================================================================
// Valuation Weight Engine™ — types (PURE, client-safe).
//
// Combines multiple valuation evidence sources into a transparent, weighted
// CONFIDENCE + range. The estimated VALUE always comes from the existing AVM
// engine (official-transaction driven) and is NEVER changed here. Market
// Acceptance Intelligence is one additional weighted signal only.
// ============================================================================

export const VALUATION_WEIGHT_VERSION = "mai-5.0";

/** Configurable weight profiles — weights are NOT hardcoded into the engine. */
export type WeightProfileName = "STANDARD" | "CONSERVATIVE" | "AGGRESSIVE" | "ENTERPRISE";

/** The seven evidence sources. Profile weights sum to 100. */
export interface WeightProfile {
  officialTransactions: number;
  currentMarket: number;        // active listings
  marketAcceptance: number;     // MAI aggregates/scores
  marketTrend: number;
  listingSimilarity: number;
  location: number;
  propertyFeatures: number;
}

/** Facts carried from the existing AVM result (never modified here). */
export interface BaseValuationFacts {
  estimatedValue: number;
  lowValue: number;
  highValue: number;
  confidenceScore: number;      // 0..100 from the AVM
  officialTxCount: number;      // sold comparables / official transactions used
  activeListingCount: number;
  trendPercent: number;
  dataQualityScore: number;     // 0..100
  avgSimilarity: number;        // 0..100 (0 if unknown)
  hasLocation: boolean;
  hasFeatures: boolean;
}

/** Market Acceptance facts for the property's segment (from MAI-4 aggregate). */
export interface MarketAcceptanceFacts {
  present: boolean;
  sampleSize: number;
  aggregateConfidence: number;  // 0..100
  acceptanceRate: number | null;
  exitRate: number | null;
  rejectionRate: number | null;
  medianDom: number | null;
  absorptionSpeed: number | null; // 0..100
}

export interface ValuationWeightInput {
  base: BaseValuationFacts;
  acceptance: MarketAcceptanceFacts | null;
  profile: WeightProfileName;
}

/** One explainable evidence row behind the final confidence. */
export interface WeightEvidence {
  label: string;            // Hebrew
  source: keyof WeightProfile;
  weight: number;           // effective normalized weight (%)
  sourceConfidence: number; // 0..100 for this source
  contribution: number;     // weight% × sourceConfidence / 100
}

export interface ValuationWeightResult {
  profile: WeightProfileName;
  weights: WeightProfile;        // EFFECTIVE normalized weights actually used (%)
  sourceConfidence: WeightProfile; // per-source confidence 0..100 (reuses the shape)
  finalConfidence: number;       // 0..100 blended
  estimatedValue: number;        // = base.estimatedValue (UNCHANGED)
  estimatedLow: number;          // range possibly narrowed/widened by acceptance
  estimatedHigh: number;
  rangeAdjustment: "narrowed" | "widened" | "unchanged";
  evidence: WeightEvidence[];
  explanation: string;
  notes: string[];               // e.g. "market acceptance ignored — tiny sample"
}
