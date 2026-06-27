// ============================================================================
// Area Leader & Market Dominance Engine™ — MAI-7 service (server-only).
//
// Orchestrates the area-leadership recompute for one organization: gather
// broker-attributed listing evidence → compute leaders per segment × window
// (pure engine) → upsert. Runs after MAI-6 in the sync pipeline. Best-effort,
// idempotent. EVIDENCE ONLY — never claims an official sale; small samples and
// ties never crown an unstable leader. No rankings export, no AI, no UI.
// ============================================================================
import "server-only";
import { computeAreaLeaders } from "./engine";
import { buildAreaLeaderExplanation } from "./explain";
import { gatherAreaLeaderRecords, upsertAreaLeaderRows } from "./repository";
import { AREA_LEADER_MODEL_VERSION, AREA_SMALL_SAMPLE, type AreaLeaderRecomputeSummary } from "./types";

/**
 * Compute + persist observed area leaders for every market segment of an org.
 *
 * Pipeline position: MAI-1 → MAI-2 → MAI-3 → MAI-4 → MAI-5 → MAI-6 → **MAI-7**.
 */
export async function calculateAreaLeaderEngineForOrganization(
  organizationId: string,
): Promise<AreaLeaderRecomputeSummary> {
  const summary: AreaLeaderRecomputeSummary = {
    segments: 0, leadersFound: 0, ties: 0, smallSamples: 0, written: 0,
  };

  const records = await gatherAreaLeaderRecords(organizationId);
  if (!records.length) return summary; // no broker-attributed listings → nothing to lead

  const results = computeAreaLeaders(records, Date.now());
  if (!results.length) return summary;
  summary.segments = results.length;

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = results.map((r) => {
    if (r.leaderBrokerId) summary.leadersFound++;
    if (r.metadata.tie) summary.ties++;
    if (r.sampleSize < AREA_SMALL_SAMPLE) summary.smallSamples++;
    const explanation = buildAreaLeaderExplanation(r);
    return {
      organization_id: organizationId,
      city: r.city, neighborhood: r.neighborhood, property_type: r.propertyType,
      rooms: r.rooms, price_bucket: r.priceBucket, window_days: r.windowDays,
      calculated_at: now, model_version: AREA_LEADER_MODEL_VERSION,
      leader_broker_id: r.leaderBrokerId, leader_confidence: r.leaderConfidence,
      active_listing_share: r.activeListingShare, market_success_share: r.marketSuccessShare,
      market_activity_share: r.marketActivityShare, market_exit_speed: r.marketExitSpeed,
      market_presence_score: r.marketPresenceScore, market_performance_index: r.marketPerformanceIndex,
      market_dominance_index: r.marketDominanceIndex, market_momentum_index: r.marketMomentumIndex,
      sample_size: r.sampleSize, confidence: r.confidence,
      runner_up_broker_id: r.runnerUpBrokerId, runner_up_gap: r.runnerUpGap,
      evidence: r.evidence as never,
      metadata: { ...r.metadata, explanation } as never,
      updated_at: now,
    } as Record<string, unknown>;
  });

  await upsertAreaLeaderRows(rows);
  summary.written = rows.length;
  return summary;
}
