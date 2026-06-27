// ============================================================================
// Autonomous Growth Strategy™ — MAI-12 service (server-only).
//
// Orchestrates the strategy recompute for one organization: gather the MAI-11
// coaching + MAI-10 gap snapshot → build a structured, evidence-backed
// execution plan with a marked Zone Dominance simulation (pure engine) →
// upsert. Runs after MAI-11 in the sync pipeline. Best-effort, idempotent. No
// LLM, no invented strategy, no free text. No UI.
// ============================================================================
import "server-only";
import { computeBrokerStrategy } from "./engine";
import { buildStrategyHeadline } from "./explain";
import { gatherStrategyInputs, upsertStrategyRows } from "./repository";
import { STRATEGY_MODEL_VERSION, STRATEGY_VERSION, type StrategyRecomputeSummary } from "./types";

/**
 * Compute + persist an autonomous growth strategy for every broker of an org.
 *
 * Pipeline position: MAI-1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → **12**.
 */
export async function generateBrokerGrowthStrategy(
  organizationId: string,
): Promise<StrategyRecomputeSummary> {
  const summary: StrategyRecomputeSummary = { brokers: 0, withStrategy: 0, notEnoughEvidence: 0, blockedActions: 0, written: 0 };

  const inputs = await gatherStrategyInputs(organizationId);
  if (!inputs.length) return summary; // no coaching → nothing to strategize
  summary.brokers = inputs.length;

  const results = computeBrokerStrategy(inputs);
  if (!results.length) return summary;

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = results.map((r) => {
    const active = (r.metadata.activeCount as number | undefined) ?? 0;
    if (active > 0) summary.withStrategy++;
    if (r.metadata.notEnoughEvidence) summary.notEnoughEvidence++;
    summary.blockedActions += r.blockedActions.length;
    const headline = buildStrategyHeadline(r);
    return {
      organization_id: organizationId, broker_id: r.brokerId,
      generated_at: now, model_version: STRATEGY_MODEL_VERSION, strategy_version: STRATEGY_VERSION,
      overall_priority: r.overallPriority, overall_confidence: r.overallConfidence,
      expected_zone_score: r.expectedZoneScore, expected_improvement: r.expectedImprovement,
      daily_actions: r.dailyActions as never, weekly_actions: r.weeklyActions as never, monthly_actions: r.monthlyActions as never,
      quick_wins: r.quickWins as never, long_term_actions: r.longTermActions as never, blocked_actions: r.blockedActions as never,
      estimated_impact: r.estimatedImpact as never, evidence: r.evidence as never,
      metadata: { ...r.metadata, headline } as never,
      updated_at: now,
    } as Record<string, unknown>;
  });

  await upsertStrategyRows(rows);
  summary.written = rows.length;
  return summary;
}
