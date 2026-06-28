// ============================================================================
// Self-Learning & Model Calibration™ — MAI-13 service (server-only).
//
// Orchestrates the calibration pass for one organization: for each observation
// window (weekly / monthly / quarterly) gather every MAI model's historical
// predictions + observed evidence → measure accuracy / calibration / stability
// (pure engine) → upsert. Runs after MAI-12 in the sync pipeline. It NEVER
// modifies a model, weight or threshold — recommendations are advisory only.
// Best-effort, idempotent, deterministic. No LLM, no free text. No UI.
// ============================================================================
import "server-only";
import { computeModelCalibration } from "./engine";
import { buildCalibrationHeadline } from "./explain";
import { gatherCalibrationInputs, upsertCalibrationRows } from "./repository";
import { CALIBRATION_MODEL_VERSION, type CalibrationRunSummary } from "./types";

/** Observation windows: weekly · monthly · quarterly. */
export const CALIBRATION_WINDOWS = [7, 30, 90] as const;

/**
 * Measure + persist calibration for every MAI model of an org, across all
 * observation windows.
 *
 * Pipeline position: MAI-1 → … → 11 → 12 → **13** (final observability layer).
 */
export async function evaluateMAIModelsForOrganization(
  organizationId: string,
  windows: readonly number[] = CALIBRATION_WINDOWS,
): Promise<CalibrationRunSummary> {
  const summary: CalibrationRunSummary = { models: 0, evaluated: 0, notEnoughEvidence: 0, recommendations: 0, written: 0 };
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const windowDays of windows) {
    const inputs = await gatherCalibrationInputs(organizationId, windowDays);
    const results = computeModelCalibration(inputs);
    for (const r of results) {
      summary.models++;
      if (r.metadata.notEnoughEvidence) summary.notEnoughEvidence++; else summary.evaluated++;
      if (r.recommendedAction !== "NONE") summary.recommendations++;
      rows.push({
        organization_id: organizationId,
        model_name: r.modelName, model_version: r.modelVersion,
        evaluation_window_days: r.evaluationWindowDays, evaluated_at: now,
        sample_size: r.sampleSize,
        accuracy: r.accuracy, precision: r.precision, recall: r.recall, f1_score: r.f1Score,
        calibration_score: r.calibrationScore, confidence_accuracy: r.confidenceAccuracy,
        false_positive_rate: r.falsePositiveRate, false_negative_rate: r.falseNegativeRate,
        prediction_stability: r.predictionStability,
        recommended_action: r.recommendedAction,
        recommended_weight_change: r.recommendedWeightChange,
        recommended_threshold_change: r.recommendedThresholdChange,
        evidence: r.evidence as never,
        metadata: { ...r.metadata, engineVersion: CALIBRATION_MODEL_VERSION, headline: buildCalibrationHeadline(r) } as never,
        updated_at: now,
      });
    }
  }

  await upsertCalibrationRows(rows);
  summary.written = rows.length;
  return summary;
}
