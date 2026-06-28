// ============================================================================
// Self-Learning & Model Calibration™ — MAI-13 engine (PURE, deterministic).
//
// Measures each MAI model independently by comparing historical predictions
// against later observed evidence. Computes accuracy / precision / recall / F1,
// a binned calibration score (1 − expected calibration error), confidence-
// accuracy, false-positive / false-negative rates, and prediction stability
// (1 − normalised drift across snapshots). It then derives an ADVISORY
// calibration recommendation (raise/lower threshold, collect more evidence,
// review the weight profile) — but NEVER applies it. No model is modified. No
// LLM, no randomness, no free text, no fake values.
// ============================================================================
import {
  CALIBRATION_MIN_SAMPLE, CALIBRATION_LOW_SAMPLE, HIGH_FPR, HIGH_FNR,
  LOW_CALIBRATION, LOW_STABILITY, CONFIDENCE_GAP,
  type ModelEvalInput, type ModelCalibrationResult, type PredictionSample,
  type StabilitySeries, type RecommendedAction, type CalibrationEvidence,
} from "./types";

const round = (v: number, dp = 4): number => { const f = 10 ** dp; return Math.round(v * f) / f; };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number | null => (xs.length ? sum(xs) / xs.length : null);

/** Compute calibration for every MAI model. Pure + deterministic. */
export function computeModelCalibration(inputs: ModelEvalInput[]): ModelCalibrationResult[] {
  const out = inputs.map(evaluateModel);
  // Stable, name-ordered output (deterministic reruns).
  out.sort((a, b) => a.modelName.localeCompare(b.modelName) || a.evaluationWindowDays - b.evaluationWindowDays);
  return out;
}

function evaluateModel(input: ModelEvalInput): ModelCalibrationResult {
  const samples = input.samples;
  const seriesCount = input.stabilitySeries.length;
  const sampleSize = samples.length > 0 ? samples.length : seriesCount;
  const evidence: CalibrationEvidence[] = [];

  // ── Confusion matrix (only when we have binary validation samples) ─────────
  let accuracy: number | null = null, precision: number | null = null, recall: number | null = null;
  let f1: number | null = null, fpr: number | null = null, fnr: number | null = null;
  let calibration: number | null = null, confidenceAccuracy: number | null = null;
  let meanConf: number | null = null;

  if (samples.length > 0) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const s of samples) {
      if (s.predictedPositive && s.observedPositive) tp++;
      else if (s.predictedPositive && !s.observedPositive) fp++;
      else if (!s.predictedPositive && s.observedPositive) fn++;
      else tn++;
    }
    const n = samples.length;
    accuracy = round((tp + tn) / n);
    precision = tp + fp > 0 ? round(tp / (tp + fp)) : null;   // no positive predictions ⇒ undefined
    recall = tp + fn > 0 ? round(tp / (tp + fn)) : null;       // no actual positives ⇒ undefined
    f1 = precision != null && recall != null && precision + recall > 0 ? round((2 * precision * recall) / (precision + recall)) : null;
    fpr = fp + tn > 0 ? round(fp / (fp + tn)) : null;
    fnr = fn + tp > 0 ? round(fn / (fn + tp)) : null;
    calibration = round(expectedCalibration(samples));
    confidenceAccuracy = round(confidenceMatch(samples));
    meanConf = round((sum(samples.map((s) => clamp(s.confidence, 0, 100))) / n) / 100);

    evidence.push({ label: "confusion_matrix", source: "market_acceptance_scores × market_listing_lifecycle / property_transactions", value: `TP=${tp} FP=${fp} FN=${fn} TN=${tn}` });
    evidence.push({ label: "accuracy", source: "derived", value: accuracy });
    if (calibration != null) evidence.push({ label: "calibration_score (1−ECE)", source: "derived", value: calibration });
  }

  // ── Prediction stability (drift across snapshots) ──────────────────────────
  const stability = seriesCount > 0 ? round(predictionStability(input.stabilitySeries)) : null;
  if (stability != null) evidence.push({ label: "prediction_stability", source: "snapshot_series", value: stability });

  // ── Over / under-confidence (observational) ────────────────────────────────
  let confidenceFlag: "OVERCONFIDENT" | "UNDERCONFIDENT" | "STABLE" | null = null;
  if (meanConf != null && accuracy != null) {
    const gap = meanConf - accuracy;
    confidenceFlag = gap > CONFIDENCE_GAP ? "OVERCONFIDENT" : gap < -CONFIDENCE_GAP ? "UNDERCONFIDENT" : "STABLE";
    evidence.push({ label: "confidence_vs_accuracy", source: "derived", value: `${confidenceFlag} (conf=${meanConf} acc=${accuracy})` });
  }

  // ── Strategy validation (GROWTH_STRATEGY): observation only, no causation ──
  if (input.strategyObservations && input.strategyObservations.length) {
    const improved = input.strategyObservations.filter((o) => o.improved).length;
    evidence.push({ label: "strategy_improvement_rate (observational)", source: "broker_growth_strategy × broker_gap_analysis", value: round(improved / input.strategyObservations.length, 3) });
  }

  // ── Advisory recommendation (NEVER auto-applied) ───────────────────────────
  const rec = recommend({ sampleSize, fpr, fnr, calibration, stability, confidenceFlag });

  const notEnoughEvidence = sampleSize < CALIBRATION_MIN_SAMPLE;
  return {
    modelName: input.modelName,
    modelVersion: input.modelVersion,
    evaluationWindowDays: input.evaluationWindowDays,
    sampleSize,
    accuracy, precision, recall, f1Score: f1,
    calibrationScore: calibration, confidenceAccuracy,
    falsePositiveRate: fpr, falseNegativeRate: fnr,
    predictionStability: stability,
    recommendedAction: rec.action,
    recommendedWeightChange: rec.weightChange,
    recommendedThresholdChange: rec.thresholdChange,
    evidence,
    metadata: {
      notEnoughEvidence,
      smallSample: sampleSize < CALIBRATION_LOW_SAMPLE,
      lowConfidence: notEnoughEvidence,
      confidenceFlag,
      seriesCount,
      observationalOnly: !!(input.strategyObservations && input.strategyObservations.length),
      reason: rec.reason,
    },
  };
}

/** Expected Calibration Error → 1 − ECE. Bins predictions by confidence decile. */
function expectedCalibration(samples: PredictionSample[]): number {
  const bins: { conf: number[]; correct: number[] }[] = Array.from({ length: 10 }, () => ({ conf: [], correct: [] }));
  for (const s of samples) {
    const c = clamp(s.confidence, 0, 100) / 100;
    const idx = Math.min(9, Math.floor(c * 10));
    bins[idx].conf.push(c);
    // "correct" here = the prediction's positive belief matched the observation.
    bins[idx].correct.push(s.predictedPositive === s.observedPositive ? 1 : 0);
  }
  const n = samples.length;
  let ece = 0;
  for (const b of bins) {
    if (!b.conf.length) continue;
    const meanC = sum(b.conf) / b.conf.length;
    const acc = sum(b.correct) / b.correct.length;
    ece += (b.conf.length / n) * Math.abs(meanC - acc);
  }
  return clamp(1 - ece, 0, 1);
}

/** Mean agreement between stated confidence and observed correctness (Brier-like accuracy). */
function confidenceMatch(samples: PredictionSample[]): number {
  const diffs = samples.map((s) => {
    const c = clamp(s.confidence, 0, 100) / 100;
    const correct = s.predictedPositive === s.observedPositive ? 1 : 0;
    return Math.abs(c - correct);
  });
  return clamp(1 - (sum(diffs) / samples.length), 0, 1);
}

/** Prediction stability: 1 − mean normalised consecutive drift across snapshot series. */
function predictionStability(series: StabilitySeries[]): number {
  const perSeries: number[] = [];
  for (const xs of series) {
    if (xs.length < 2) continue;
    let drift = 0;
    for (let i = 1; i < xs.length; i++) drift += Math.abs(xs[i] - xs[i - 1]);
    drift /= xs.length - 1;
    const scale = Math.max(1, sum(xs.map(Math.abs)) / xs.length); // mean magnitude (≥1)
    perSeries.push(clamp(1 - drift / scale, 0, 1));
  }
  const m = mean(perSeries);
  return m == null ? 1 : m;
}

interface RecCtx {
  sampleSize: number;
  fpr: number | null; fnr: number | null;
  calibration: number | null; stability: number | null;
  confidenceFlag: "OVERCONFIDENT" | "UNDERCONFIDENT" | "STABLE" | null;
}

/** Single advisory recommendation by severity. Suggestions only — never applied. */
function recommend(c: RecCtx): { action: RecommendedAction; weightChange: number | null; thresholdChange: number | null; reason: string } {
  if (c.sampleSize < CALIBRATION_MIN_SAMPLE) {
    return { action: "COLLECT_MORE_EVIDENCE", weightChange: null, thresholdChange: null, reason: `sample ${c.sampleSize} < ${CALIBRATION_MIN_SAMPLE}` };
  }
  // Threshold issues take priority (most actionable, fully measurable).
  if (c.fpr != null && c.fpr > HIGH_FPR && (c.fnr == null || c.fpr >= c.fnr)) {
    return { action: "INCREASE_THRESHOLD", weightChange: null, thresholdChange: round(clamp(c.fpr - HIGH_FPR, 0, 0.2), 3), reason: `FPR ${c.fpr} > ${HIGH_FPR}` };
  }
  if (c.fnr != null && c.fnr > HIGH_FNR) {
    return { action: "LOWER_THRESHOLD", weightChange: null, thresholdChange: -round(clamp(c.fnr - HIGH_FNR, 0, 0.2), 3), reason: `FNR ${c.fnr} > ${HIGH_FNR}` };
  }
  // Calibration / stability drift → review the weight profile (advisory delta).
  const lowCal = c.calibration != null && c.calibration < LOW_CALIBRATION;
  const lowStab = c.stability != null && c.stability < LOW_STABILITY;
  if (lowCal || lowStab) {
    const sign = c.confidenceFlag === "OVERCONFIDENT" ? -1 : c.confidenceFlag === "UNDERCONFIDENT" ? 1 : -1;
    return { action: "REVIEW_WEIGHT_PROFILE", weightChange: round(sign * 0.05, 3), thresholdChange: null, reason: lowCal ? `calibration ${c.calibration} < ${LOW_CALIBRATION}` : `stability ${c.stability} < ${LOW_STABILITY}` };
  }
  if (c.sampleSize < CALIBRATION_LOW_SAMPLE) {
    return { action: "INCREASE_SAMPLE", weightChange: null, thresholdChange: null, reason: `sample ${c.sampleSize} < ${CALIBRATION_LOW_SAMPLE}` };
  }
  return { action: "NONE", weightChange: null, thresholdChange: null, reason: "within tolerances" };
}
