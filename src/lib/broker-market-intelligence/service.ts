// ============================================================================
// Broker Market Intelligence™ — MAI-6 service (server-only).
//
// Orchestrates the broker market-performance recompute for one organization:
// gather broker-attributed listing evidence → compute a profile per broker
// (pure engine) → upsert. Runs after MAI-5 in the sync pipeline. Best-effort,
// idempotent. EVIDENCE ONLY — never claims an official sale; every broker gets
// a profile (empty when no listings are observed). No rankings, no AI, no UI.
// ============================================================================
import "server-only";
import { computeBrokerMarketProfile } from "./engine";
import { buildBrokerMarketExplanation } from "./explain";
import { getBrokerProfiles, gatherBrokerListingRecords, upsertBrokerIntelligenceRows } from "./repository";
import { BROKER_MARKET_MODEL_VERSION, type BrokerMarketRecomputeSummary } from "./types";

/**
 * Compute + persist a market-performance profile for every broker of an org.
 *
 * Pipeline position: MAI-1 → MAI-2 → MAI-3 → MAI-4 → MAI-5 → **MAI-6**.
 */
export async function calculateBrokerMarketIntelligenceForOrganization(
  organizationId: string,
): Promise<BrokerMarketRecomputeSummary> {
  const summary: BrokerMarketRecomputeSummary = {
    brokers: 0, written: 0, withListings: 0, emptyProfiles: 0, lowConfidence: 0,
  };

  const brokers = await getBrokerProfiles(organizationId);
  if (!brokers.length) return summary; // org has no brokers → nothing to profile
  summary.brokers = brokers.length;

  const byBroker = await gatherBrokerListingRecords(organizationId);
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const broker of brokers) {
    const records = byBroker.get(broker.id) ?? [];
    const profile = computeBrokerMarketProfile(broker.id, records);
    const explanation = buildBrokerMarketExplanation(profile);

    if (profile.totalObservedListings > 0) summary.withListings++;
    else summary.emptyProfiles++;
    if (profile.confidence < 40) summary.lowConfidence++;

    rows.push({
      organization_id: organizationId,
      broker_id: broker.id,
      calculated_at: now,
      model_version: BROKER_MARKET_MODEL_VERSION,
      active_listings: profile.activeListings,
      likely_market_exit_count: profile.likelyMarketExitCount,
      likely_market_success_count: profile.likelyMarketSuccessCount,
      likely_market_rejected_count: profile.likelyMarketRejectedCount,
      returned_listing_count: profile.returnedListingCount,
      uncertain_listing_count: profile.uncertainListingCount,
      total_observed_listings: profile.totalObservedListings,
      eligible_listings: profile.eligibleListings,
      market_success_rate: profile.marketSuccessRate,
      market_rejection_rate: profile.marketRejectionRate,
      market_exit_rate: profile.marketExitRate,
      median_days_on_market: profile.medianDaysOnMarket,
      average_days_on_market: profile.averageDaysOnMarket,
      median_price_reduction_pct: profile.medianPriceReductionPct,
      average_price_reduction_pct: profile.averagePriceReductionPct,
      average_last_known_price: profile.averageLastKnownPrice,
      dominant_city: profile.dominantCity,
      dominant_neighborhood: profile.dominantNeighborhood,
      dominant_property_type: profile.dominantPropertyType,
      dominant_room_count: profile.dominantRoomCount,
      dominant_price_bucket: profile.dominantPriceBucket,
      market_activity_score: profile.marketActivityScore,
      market_performance_index: profile.marketPerformanceIndex,
      confidence: profile.confidence,
      evidence: profile.evidence as never,
      metadata: { explanation } as never,
      updated_at: now,
    } as Record<string, unknown>);
  }

  await upsertBrokerIntelligenceRows(rows);
  summary.written = rows.length;
  return summary;
}
