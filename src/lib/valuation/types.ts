// ============================================================================
// ZONO Price Intelligence — shared types (client-safe, no server imports).
// ============================================================================

export type ValuationStatus = "draft" | "computing" | "completed" | "failed";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ComparableSource = "govmap" | "tax_authority" | "madlan" | "yad2" | "zono";
export type ComparableType = "sold" | "listing";
export type AdjustmentDirection = "positive" | "negative";
export type DemandLevel = "low" | "medium" | "high";
export type StrategyKey = "conservative" | "balanced" | "aggressive";
/** Overall quality band of a valuation, driven by data breadth + confidence. */
export type ValuationQualityLevel = "high" | "medium" | "low" | "insufficient";

/** Internal QA / debug metadata returned with every valuation (not for display). */
export interface ValuationDebug {
  comparableCount: number;
  soldComparableCount: number;
  activeComparableCount: number;
  sourcesUsed: string[];
  fallbackLevel: string;          // proximity tier actually used (building→…→city)
  avgPricePerSqm: number | null;
  medianPricePerSqm: number | null;
  weightedPricePerSqm: number | null;
  outliersRemoved: number;
  confidenceScore: number;        // 0..100
  reasonCodes: string[];          // e.g. ok | no_priced_comparables | missing_built_sqm | only_active_listings
}

/** Raw human input collected by the wizard. All optional until computed. */
export interface ValuationInput {
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  apartmentNumber?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  propertyType?: string | null;
  rooms?: number | null;
  builtSqm?: number | null;
  balconySqm?: number | null;
  gardenSqm?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  elevator?: boolean | null;
  parkingCount?: number | null;
  storage?: boolean | null;
  mamad?: boolean | null;
  renovated?: boolean | null;
  propertyCondition?: string | null; // new | renovated | good | needs_work
  viewQuality?: string | null;        // open | partial | none
  noiseLevel?: string | null;         // quiet | medium | busy
  buildingYear?: number | null;
  notes?: string | null;
}

/** A single comparable (sold transaction or active listing). */
export interface Comparable {
  source: ComparableSource;
  comparableType: ComparableType;
  externalId?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  distanceMeters?: number | null;
  propertyType?: string | null;
  rooms?: number | null;
  sqm?: number | null;
  floor?: number | null;
  buildingYear?: number | null;
  price?: number | null;
  pricePerSqm?: number | null;
  saleDate?: string | null;   // ISO date
  listingDate?: string | null;
  similarityScore?: number;   // 0..100, computed
  adjustmentScore?: number;
  adjustmentReason?: string | null;
  imageUrl?: string | null;
  isDemo?: boolean;
  rawPayload?: Record<string, unknown> | null;
}

/** Broker's own sold property nearby (trust evidence). */
export interface BrokerSoldProperty {
  propertyId?: string | null;
  dealId?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  salePrice?: number | null;
  pricePerSqm?: number | null;
  saleDate?: string | null;
  rooms?: number | null;
  sqm?: number | null;
  distanceMeters?: number | null;
  agentId?: string | null;
  buyerType?: string | null;
  imageUrl?: string | null;
  performanceVsMarketPercent?: number | null;
}

export interface ValuationAdjustment {
  label: string;
  direction: AdjustmentDirection;
  valueImpact: number;        // ₪ impact
  percentageImpact: number;   // % impact on base
  reason: string;
  confidence: number;         // 0..1
}

export interface MarketSnapshot {
  avgPricePerSqm: number | null;
  medianPricePerSqm: number | null;
  transactionCount: number;
  activeListingCount: number;
  demandLevel: DemandLevel;
  supplyLevel: DemandLevel;
  trendDirection: "up" | "down" | "flat";
  trendPercent: number;
  listingToSoldGapPercent: number | null;
  dataQualityScore: number; // 0..100
}

export interface PricingStrategy {
  key: StrategyKey;
  label: string;
  price: number;
  saleProbability: number;   // 0..100
  daysOnMarket: number;
  risk: string;              // Hebrew label
  recommended?: boolean;
}

export interface WhatIfPoint {
  price: number;
  saleProbability: number;   // 0..100
  daysOnMarket: number;
  negotiationRisk: DemandLevel;
  buyerDemand: DemandLevel;
  competitionLevel: DemandLevel;
}

/** The full computed valuation result (persisted across several tables). */
export interface ValuationResult {
  estimatedValue: number;
  lowValue: number;
  highValue: number;
  recommendedListingPrice: number;
  targetClosingPrice: number;
  minimumAcceptablePrice: number;
  estimatedPricePerSqm: number;
  confidenceScore: number;   // 0..100
  confidenceLevel: ConfidenceLevel;
  demandScore: number;       // 0..100
  liquidityScore: number;    // 0..100
  overpricingRiskScore: number; // 0..100
  daysOnMarketEstimate: number;
  explanation: string;       // Hebrew
  adjustments: ValuationAdjustment[];
  strategies: PricingStrategy[];
  market: MarketSnapshot;
  basePpsqm: number;
  evidenceCount: number;
  // ── Phase 2 (AVM) — additive, optional so existing consumers/UI keep working ──
  /** True when a real, evidence-backed valuation was produced. */
  valuationAvailable?: boolean;
  /** Overall quality band (insufficient when valuationAvailable is false). */
  valuationQuality?: ValuationQualityLevel;
  /** Hebrew reason a valuation could not be produced (when unavailable). */
  unavailableReason?: string | null;
  /** Inputs / evidence that are missing (when unavailable). */
  missingData?: string[];
  /** Hebrew next step the agent should take (when unavailable). */
  recommendedAction?: string | null;
  /** QA metadata — comparable counts, sources, ppsqm, outliers, reason codes. */
  debug?: ValuationDebug;
}

/** A fully-loaded valuation as read from the DB for the result/report screens. */
export interface ValuationRecord {
  id: string;
  organizationId: string;
  propertyId: string | null;
  status: ValuationStatus;
  input: ValuationInput;
  result: Partial<ValuationResult> | null;
  comparables: Comparable[];
  brokerSold: BrokerSoldProperty[];
  adjustments: ValuationAdjustment[];
  market: MarketSnapshot | null;
  createdAt: string;
}

// ── Hebrew labels ────────────────────────────────────────────────────────────
export const SOURCE_LABEL: Record<ComparableSource, string> = {
  govmap: "GovMap",
  tax_authority: "רשות המסים",
  madlan: "Madlan",
  yad2: "יד2",
  zono: "ZONO",
};

export const DEMAND_LABEL: Record<DemandLevel, string> = {
  low: "נמוך",
  medium: "בינוני",
  high: "גבוה",
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
};

export const STRATEGY_LABEL: Record<StrategyKey, string> = {
  conservative: "שמרני",
  balanced: "מאוזן",
  aggressive: "אגרסיבי",
};

export const VALUATION_DISCLAIMER =
  "הדוח מהווה אינדיקציה מקצועית בלבד ואינו מהווה שמאות מקרקעין או התחייבות למחיר מכירה בפועל.";
