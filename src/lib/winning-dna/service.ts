// ============================================================================
// Broker Winning DNA™ — MAI-9 service (server-only).
//
// Orchestrates the winning-DNA recompute for one organization: gather broker-
// attributed listing evidence → extract winning DNA per segment × window from
// the observed leaders (pure engine) → upsert. Runs after MAI-8 in the sync
// pipeline. Best-effort, idempotent. EVIDENCE ONLY — never recommends, never
// compares to a specific broker, never claims an official sale. No UI.
// ============================================================================
import "server-only";
import { computeBrokerWinningDNA } from "./engine";
import { buildWinningDNAExplanation } from "./explain";
import { gatherWinningDNARecords, upsertWinningDNARows } from "./repository";
import { WINNING_DNA_MODEL_VERSION, type WinningDNARecomputeSummary } from "./types";

/**
 * Compute + persist winning DNA for every market segment × window of an org.
 *
 * Pipeline position: MAI-1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → **9**.
 */
export async function calculateBrokerWinningDNAForOrganization(
  organizationId: string,
): Promise<WinningDNARecomputeSummary> {
  const summary: WinningDNARecomputeSummary = {
    segments: 0, strongDna: 0, weakDna: 0, lowConfidence: 0, written: 0,
  };

  const records = await gatherWinningDNARecords(organizationId);
  if (!records.length) return summary; // no broker-attributed listings → nothing to mine

  const results = computeBrokerWinningDNA(records, Date.now());
  if (!results.length) return summary;
  summary.segments = results.length;

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = results.map((r) => {
    if (r.winningProfile.weak) summary.weakDna++; else summary.strongDna++;
    if (r.confidence < 40) summary.lowConfidence++;
    const explanation = buildWinningDNAExplanation(r);
    return {
      organization_id: organizationId,
      city: r.city, neighborhood: r.neighborhood, property_type: r.propertyType,
      rooms: r.rooms, price_bucket: r.priceBucket, window_days: r.windowDays,
      calculated_at: now, model_version: WINNING_DNA_MODEL_VERSION,
      sample_size: r.sampleSize, confidence: r.confidence,
      winning_profile: r.winningProfile as never,
      behaviour_patterns: r.behaviourPatterns as never,
      pricing_patterns: r.pricingPatterns as never,
      activity_patterns: r.activityPatterns as never,
      listing_patterns: r.listingPatterns as never,
      market_patterns: r.marketPatterns as never,
      median_days_on_market: r.medianDaysOnMarket,
      median_price_reduction_pct: r.medianPriceReductionPct,
      market_success_rate: r.marketSuccessRate,
      market_dominance: r.marketDominance,
      market_share: r.marketShare,
      evidence: r.evidence as never,
      metadata: { ...r.metadata, explanation } as never,
      updated_at: now,
    } as Record<string, unknown>;
  });

  await upsertWinningDNARows(rows);
  summary.written = rows.length;
  return summary;
}
