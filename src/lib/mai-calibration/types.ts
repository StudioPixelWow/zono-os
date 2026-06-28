// ============================================================================
// Self-Learning & Model Calibration™ — MAI-13 types (PURE, client-safe).
//
// The observability layer of Market Acceptance Intelligence™. It MEASURES every
// MAI model — comparing historical predictions against later observed evidence
// — and reports accuracy / precision / recall / F1 / calibration / confidence-
// accuracy / FPR / FNR / stability, plus an ADVISORY calibration recommendation.
// It never modifies a model: recommendations are suggestions only. No LLM, no
// free text, no fake values, deterministic.
// ============================================================================

export const CALIBRATION_MODEL_VERSION = "mai-13.0";

/** Below this many resolved samples a model is "not enough evidence". */
export const CALIBRATION_MIN_SAMPLE = 20;
/** A model is considered "small sample" (low confidence) below this. */
export const CALIBRATION_LOW_SAMPLE = 50;
/** FPR above this ⇒ recommend raising the threshold. */
export const HIGH_FPR = 0.2;
/** FNR above this ⇒ recommend lowering the threshold. */
export const HIGH_FNR = 0.2;
/** Calibration score below this ⇒ recommend reviewing the weight profile. */
export const LOW_CALIBRATION = 0.8;
/** Prediction stability below this ⇒ flag instability. */
export const LOW_STABILITY = 0.8;
/** |mean confidence − accuracy| above this ⇒ over/under-confidence. */
export const CONFIDENCE_GAP = 0.1;

/** The MAI models evaluated independently (closed set). */
export type MAIModelName =
  | "MARKET_ACCEPTANCE"
  | "GAP_ANALYSIS"
  | "WINNING_DNA"
  | "BROKER_COACH"
  | "GROWTH_STRATEGY"
  | "ZONE_DOMINANCE"
  | "VALUATION_WEIGHT";

/** Advisory calibration actions (closed set — NEVER auto-applied). */
export type RecommendedAction =
  | "NONE"
  | "INCREASE_THRESHOLD"
  | "LOWER_THRESHOLD"
  | "COLLECT_MORE_EVIDENCE"
  | "INCREASE_SAMPLE"
  | "REVIEW_WEIGHT_PROFILE";

/**
 * One resolved validation sample: a past prediction whose later outcome is now
 * observable. `predictedPositive` = the model said "positive" (e.g. likely
 * accepted); `observedPositive` = later evidence confirmed positive (e.g. an
 * official transaction). `confidence` is the model's stated 0..100 confidence.
 */
export interface PredictionSample {
  predictedPositive: boolean;
  observedPositive: boolean;
  confidence: number; // 0..100
}

/**
 * A per-entity numeric snapshot series for a model output across consecutive
 * runs/time (e.g. a broker's Zone Dominance over the last N evaluations). Used
 * to measure prediction stability (drift). Empty ⇒ stability not measurable.
 */
export type StabilitySeries = number[];

/** Pure engine input for one MAI model. */
export interface ModelEvalInput {
  modelName: MAIModelName;
  modelVersion: string;
  evaluationWindowDays: number;
  /** Binary validation samples (may be empty for non-classifier models). */
  samples: PredictionSample[];
  /** Per-entity output series for stability/drift (may be empty). */
  stabilitySeries: StabilitySeries[];
  /**
   * Observational strategy outcomes (GROWTH_STRATEGY only): later measured
   * deltas vs the strategy's projection. Reported, never used to claim cause.
   */
  strategyObservations?: StrategyObservation[];
}

/** Observed movement of a measurable metric after a strategy was produced. */
export interface StrategyObservation {
  metric: "zone_dominance" | "market_share" | "dom" | "acceptance";
  delta: number;   // observed later change (sign meaningful)
  improved: boolean;
}

/** One traceable evidence row behind a calibration metric. */
export interface CalibrationEvidence {
  label: string;
  source: string;  // table/field identifier the metric came from
  value?: number | string;
}

/** Computed calibration for one MAI model (camelCase; service maps to DB). */
export interface ModelCalibrationResult {
  modelName: MAIModelName;
  modelVersion: string;
  evaluationWindowDays: number;
  sampleSize: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  calibrationScore: number | null;
  confidenceAccuracy: number | null;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  predictionStability: number | null;
  recommendedAction: RecommendedAction;
  recommendedWeightChange: number | null;
  recommendedThresholdChange: number | null;
  evidence: CalibrationEvidence[];
  metadata: Record<string, unknown>;
}

/** Persisted row of `mai_model_calibration`. */
export interface MAIModelCalibrationRow {
  id: string;
  organization_id: string;
  model_name: string;
  model_version: string;
  evaluation_window_days: number;
  evaluated_at: string;
  sample_size: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  calibration_score: number | null;
  confidence_accuracy: number | null;
  false_positive_rate: number | null;
  false_negative_rate: number | null;
  prediction_stability: number | null;
  recommended_action: string | null;
  recommended_weight_change: number | null;
  recommended_threshold_change: number | null;
  evidence: CalibrationEvidence[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Summary returned by an org-wide calibration pass (for logging). */
export interface CalibrationRunSummary {
  models: number;
  evaluated: number;        // models with enough evidence
  notEnoughEvidence: number;
  recommendations: number;  // models with a non-NONE recommendation
  written: number;
}
