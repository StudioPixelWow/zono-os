// ============================================================================
// Evidence-Based Broker Coach™ — MAI-11 service (server-only).
//
// Orchestrates the coach recompute for one organization: gather the MAI-10 gap
// profiles + MAI-6 context → generate structured, evidence-backed coaching
// (pure engine) → upsert. Runs after MAI-10 in the sync pipeline. Best-effort,
// idempotent. No LLM, no invented advice; insufficient evidence ⇒ "Not enough
// evidence". No UI.
// ============================================================================
import "server-only";
import { computeBrokerCoach } from "./engine";
import { buildCoachHeadline } from "./explain";
import { gatherCoachInputs, upsertCoachingRows } from "./repository";
import { COACH_MODEL_VERSION, COACH_VERSION, type CoachRecomputeSummary } from "./types";

/**
 * Compute + persist evidence-based coaching for every broker of an org.
 *
 * Pipeline position: MAI-1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → **11**.
 */
export async function generateBrokerCoachForOrganization(
  organizationId: string,
): Promise<CoachRecomputeSummary> {
  const summary: CoachRecomputeSummary = { brokers: 0, coached: 0, notEnoughEvidence: 0, written: 0 };

  const inputs = await gatherCoachInputs(organizationId);
  if (!inputs.length) return summary; // no gap profiles → nothing to coach
  summary.brokers = inputs.length;

  const results = computeBrokerCoach(inputs);
  if (!results.length) return summary;

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = results.map((r) => {
    if (r.recommendations.length) summary.coached++;
    if (r.metadata.notEnoughEvidence) summary.notEnoughEvidence++;
    const headline = buildCoachHeadline(r);
    return {
      organization_id: organizationId, broker_id: r.brokerId,
      generated_at: now, model_version: COACH_MODEL_VERSION, coach_version: COACH_VERSION,
      overall_priority: r.overallPriority, overall_confidence: r.overallConfidence,
      recommendations: r.recommendations as never, insights: r.insights as never,
      warnings: r.warnings as never, opportunities: r.opportunities as never, strengths: r.strengths as never,
      evidence: r.evidence as never,
      metadata: { ...r.metadata, dailyCoach: r.dailyCoach, headline } as never,
      updated_at: now,
    } as Record<string, unknown>;
  });

  await upsertCoachingRows(rows);
  summary.written = rows.length;
  return summary;
}
