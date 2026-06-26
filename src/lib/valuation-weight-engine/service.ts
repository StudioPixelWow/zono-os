// ============================================================================
// Valuation Weight Engine™ — service (server-only orchestration).
// Computes + persists a weight result for a completed valuation. Best-effort:
// it never throws into the valuation flow and never alters the AVM value.
// ============================================================================
import "server-only";
import { runValuationWeightEngine } from "./calculator";
import { buildValuationWeightExplanation } from "./explain";
import { getAcceptanceFactsForSegment, upsertValuationWeightResult } from "./repository";
import { VALUATION_WEIGHT_VERSION, type BaseValuationFacts, type ValuationWeightResult, type WeightProfileName } from "./types";

export interface RecordValuationWeightArgs {
  organizationId: string;
  valuationId: string | null;
  propertyId?: string | null;
  provider?: string | null;
  externalId?: string | null;
  profile?: WeightProfileName;
  base: BaseValuationFacts;
  segment: { city: string | null; neighborhood: string | null; propertyType: string | null; rooms: number | null };
}

/**
 * Compute + persist the valuation weight result. Returns the result (also when
 * persistence is best-effort). Skips entirely when the AVM produced no value.
 */
export async function recordValuationWeight(args: RecordValuationWeightArgs): Promise<ValuationWeightResult | null> {
  if (!args.base.estimatedValue || args.base.estimatedValue <= 0) return null; // no value → nothing to weight
  const profile: WeightProfileName = args.profile ?? "STANDARD";

  const acceptance = await getAcceptanceFactsForSegment(args.organizationId, {
    city: args.segment.city, neighborhood: args.segment.neighborhood,
    propertyType: args.segment.propertyType, rooms: args.segment.rooms,
    priceForBucket: args.base.estimatedValue,
  }).catch(() => null);

  const result = runValuationWeightEngine({ base: args.base, acceptance, profile });
  result.explanation = buildValuationWeightExplanation(result);

  const now = new Date().toISOString();
  await upsertValuationWeightResult({
    organization_id: args.organizationId,
    valuation_id: args.valuationId,
    property_id: args.propertyId ?? null,
    provider: args.provider ?? null,
    external_id: args.externalId ?? null,
    valuation_version: VALUATION_WEIGHT_VERSION,
    weight_profile: profile,
    calculated_at: now,
    official_transactions_weight: result.weights.officialTransactions,
    current_market_weight: result.weights.currentMarket,
    market_acceptance_weight: result.weights.marketAcceptance,
    market_trend_weight: result.weights.marketTrend,
    listing_similarity_weight: result.weights.listingSimilarity,
    location_weight: result.weights.location,
    property_features_weight: result.weights.propertyFeatures,
    final_confidence: result.finalConfidence,
    estimated_value: result.estimatedValue,
    estimated_low: result.estimatedLow,
    estimated_high: result.estimatedHigh,
    evidence: result.evidence as never,
    metadata: {
      sourceConfidence: result.sourceConfidence,
      rangeAdjustment: result.rangeAdjustment,
      acceptanceUsed: !!acceptance?.present,
      explanation: result.explanation,
      notes: result.notes,
    } as never,
    updated_at: now,
  });

  return result;
}
