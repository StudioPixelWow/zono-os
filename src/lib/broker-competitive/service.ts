// ============================================================================
// Broker Competitive Intelligence™ — MAI-8 service (server-only).
//
// Orchestrates the competitive recompute for one organization: gather broker-
// attributed listing evidence → compute competitive profiles per broker ×
// segment × window (pure engine) → upsert. Runs after MAI-7 in the sync
// pipeline. Best-effort, idempotent. EVIDENCE ONLY — never ranks brokers, never
// gives advice, never claims an official sale. No UI.
// ============================================================================
import "server-only";
import { computeBrokerCompetitive } from "./engine";
import { buildCompetitiveExplanation } from "./explain";
import { gatherCompetitiveRecords, upsertCompetitiveRows } from "./repository";
import { COMPETITIVE_MODEL_VERSION, COMPETITIVE_SMALL_SAMPLE, type CompetitiveRecomputeSummary } from "./types";

/**
 * Compute + persist competitive intelligence for every broker × segment ×
 * window of an org.
 *
 * Pipeline position: MAI-1 → MAI-2 → MAI-3 → MAI-4 → MAI-5 → MAI-6 → MAI-7 → **MAI-8**.
 */
export async function calculateBrokerCompetitiveIntelligenceForOrganization(
  organizationId: string,
): Promise<CompetitiveRecomputeSummary> {
  const summary: CompetitiveRecomputeSummary = {
    profiles: 0, brokers: 0, withStrengths: 0, withRisks: 0, insufficient: 0, written: 0,
  };

  const records = await gatherCompetitiveRecords(organizationId);
  if (!records.length) return summary; // no broker-attributed listings → nothing to compare

  const profiles = computeBrokerCompetitive(records, Date.now());
  if (!profiles.length) return summary;
  summary.profiles = profiles.length;

  const now = new Date().toISOString();
  const distinct = new Set<string>();
  const rows: Record<string, unknown>[] = profiles.map((p) => {
    distinct.add(p.brokerId);
    if (p.competitiveStrengths.length) summary.withStrengths++;
    if (p.competitiveRisks.length) summary.withRisks++;
    if (p.sampleSize < COMPETITIVE_SMALL_SAMPLE) summary.insufficient++;
    const explanation = buildCompetitiveExplanation(p);
    return {
      organization_id: organizationId, broker_id: p.brokerId,
      city: p.city, neighborhood: p.neighborhood, property_type: p.propertyType,
      rooms: p.rooms, price_bucket: p.priceBucket, window_days: p.windowDays,
      calculated_at: now, model_version: COMPETITIVE_MODEL_VERSION,
      market_position: p.marketPosition, leader_gap: p.leaderGap, market_share: p.marketShare,
      market_growth: p.marketGrowth, market_decline: p.marketDecline,
      activity_delta: p.activityDelta, performance_delta: p.performanceDelta, success_delta: p.successDelta,
      exit_speed_delta: p.exitSpeedDelta, listing_share_delta: p.listingShareDelta,
      competitive_strengths: p.competitiveStrengths as never,
      competitive_weaknesses: p.competitiveWeaknesses as never,
      competitive_opportunities: p.competitiveOpportunities as never,
      competitive_risks: p.competitiveRisks as never,
      strongest_segment: p.strongestSegment, weakest_segment: p.weakestSegment,
      best_property_type: p.bestPropertyType, best_price_bucket: p.bestPriceBucket, best_neighborhood: p.bestNeighborhood,
      sample_size: p.sampleSize, confidence: p.confidence,
      evidence: p.evidence as never,
      metadata: { ...p.metadata, explanation } as never,
      updated_at: now,
    } as Record<string, unknown>;
  });
  summary.brokers = distinct.size;

  await upsertCompetitiveRows(rows);
  summary.written = rows.length;
  return summary;
}
