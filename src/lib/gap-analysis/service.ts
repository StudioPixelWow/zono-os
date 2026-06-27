// ============================================================================
// Broker Gap Analysis™ — MAI-10 service (server-only).
//
// Orchestrates the gap-analysis recompute for one organization: gather broker-
// attributed listing evidence → compute Zone Dominance + measurable gaps per
// broker × segment × window (pure engine) → upsert. Runs after MAI-9 in the
// sync pipeline. Best-effort, idempotent. EVIDENCE ONLY — no recommendations,
// no AI, no official-sale claims. No UI.
// ============================================================================
import "server-only";
import { computeBrokerGapAnalysis } from "./engine";
import { buildGapExplanation } from "./explain";
import { gatherGapRecords, upsertGapRows } from "./repository";
import { GAP_MODEL_VERSION, type GapRecomputeSummary } from "./types";

/**
 * Compute + persist gap analysis for every broker × segment × window of an org.
 *
 * Pipeline position: MAI-1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → **10**.
 */
export async function calculateBrokerGapAnalysisForOrganization(
  organizationId: string,
): Promise<GapRecomputeSummary> {
  const summary: GapRecomputeSummary = {
    profiles: 0, brokers: 0, scored: 0, insufficient: 0, withGaps: 0, written: 0,
  };

  const records = await gatherGapRecords(organizationId);
  if (!records.length) return summary; // no broker-attributed listings → nothing to analyze

  const results = computeBrokerGapAnalysis(records, Date.now());
  if (!results.length) return summary;
  summary.profiles = results.length;

  const now = new Date().toISOString();
  const distinct = new Set<string>();
  const rows: Record<string, unknown>[] = results.map((r) => {
    distinct.add(r.brokerId);
    if (r.zoneDominanceScore != null) summary.scored++;
    if (r.zoneDominanceLevel === "INSUFFICIENT_DATA") summary.insufficient++;
    if (r.gaps.length) summary.withGaps++;
    const explanation = buildGapExplanation(r);
    return {
      organization_id: organizationId, broker_id: r.brokerId,
      city: r.city, neighborhood: r.neighborhood, property_type: r.propertyType,
      rooms: r.rooms, price_bucket: r.priceBucket, window_days: r.windowDays,
      calculated_at: now, model_version: GAP_MODEL_VERSION,
      zone_dominance_score: r.zoneDominanceScore, zone_dominance_level: r.zoneDominanceLevel,
      leader_gap: r.leaderGap, winning_dna_match_score: r.winningDnaMatchScore,
      success_rate_gap: r.successRateGap, exit_speed_gap_days: r.exitSpeedGapDays,
      market_share_gap: r.marketShareGap, activity_gap: r.activityGap,
      performance_gap: r.performanceGap, momentum_gap: r.momentumGap,
      coverage_gap: r.coverageGap, price_reduction_gap: r.priceReductionGap,
      strengths: r.strengths as never, gaps: r.gaps as never, evidence: r.evidence as never,
      metadata: { ...r.metadata, explanation } as never,
      confidence: r.confidence,
      updated_at: now,
    } as Record<string, unknown>;
  });
  summary.brokers = distinct.size;

  await upsertGapRows(rows);
  summary.written = rows.length;
  return summary;
}
