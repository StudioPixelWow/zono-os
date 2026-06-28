// ============================================================================
// Self-Learning & Model Calibration™ — MAI-13 QA (PURE, deterministic).
//
// Exercises computeModelCalibration against the phase spec scenarios. No DB, no
// LLM, no randomness — runnable with `npx tsx`. Asserts: perfect predictions ⇒
// high accuracy, false positives detected (high FPR ⇒ raise-threshold advice),
// false negatives detected (high FNR ⇒ lower-threshold advice), weak sample ⇒
// low confidence + COLLECT_MORE_EVIDENCE, calibration/stability drift detected,
// and byte-identical reruns. It never asserts the model was modified.
// ============================================================================
import { computeModelCalibration } from "./engine";
import { CALIBRATION_MIN_SAMPLE, type ModelEvalInput, type PredictionSample, type MAIModelName } from "./types";

export interface CalibrationQaCase { name: string; pass: boolean; detail: string }

const samples = (n: number, predicted: boolean, observed: boolean, confidence: number): PredictionSample[] =>
  Array.from({ length: n }, () => ({ predictedPositive: predicted, observedPositive: observed, confidence }));

const input = (modelName: MAIModelName, s: PredictionSample[], series: number[][] = []): ModelEvalInput =>
  ({ modelName, modelVersion: "test", evaluationWindowDays: 30, samples: s, stabilitySeries: series });

export function runCalibrationQa(): { cases: CalibrationQaCase[]; allPass: boolean } {
  const cases: CalibrationQaCase[] = [];
  const add = (name: string, pass: boolean, detail: string) => cases.push({ name, pass, detail });

  // 1) Perfect predictions → accuracy high (1.0), well-calibrated, NONE.
  {
    const s = [...samples(30, true, true, 90), ...samples(30, false, false, 90)];
    const r = computeModelCalibration([input("MARKET_ACCEPTANCE", s)])[0];
    const pass = r.accuracy === 1 && r.falsePositiveRate === 0 && r.falseNegativeRate === 0 && r.recommendedAction === "NONE";
    add("Perfect predictions → accuracy high", pass, `acc=${r.accuracy} fpr=${r.falsePositiveRate} fnr=${r.falseNegativeRate} rec=${r.recommendedAction}`);
  }

  // 2) False positives → detected (high FPR ⇒ INCREASE_THRESHOLD).
  {
    const s = [...samples(20, true, true, 80), ...samples(30, true, false, 80), ...samples(20, false, false, 80)];
    const r = computeModelCalibration([input("MARKET_ACCEPTANCE", s)])[0];
    const pass = (r.falsePositiveRate ?? 0) > 0.2 && r.recommendedAction === "INCREASE_THRESHOLD" && (r.recommendedThresholdChange ?? 0) > 0;
    add("False positives → detected", pass, `fpr=${r.falsePositiveRate} rec=${r.recommendedAction} Δthr=${r.recommendedThresholdChange}`);
  }

  // 3) False negatives → detected (high FNR ⇒ LOWER_THRESHOLD).
  {
    const s = [...samples(10, true, true, 80), ...samples(40, false, true, 80), ...samples(20, false, false, 80)];
    const r = computeModelCalibration([input("MARKET_ACCEPTANCE", s)])[0];
    const pass = (r.falseNegativeRate ?? 0) > 0.2 && r.recommendedAction === "LOWER_THRESHOLD" && (r.recommendedThresholdChange ?? 0) < 0;
    add("False negatives → detected", pass, `fnr=${r.falseNegativeRate} rec=${r.recommendedAction} Δthr=${r.recommendedThresholdChange}`);
  }

  // 4) Weak sample → low confidence + COLLECT_MORE_EVIDENCE.
  {
    const r = computeModelCalibration([input("MARKET_ACCEPTANCE", samples(5, true, true, 80))])[0];
    const pass = r.sampleSize < CALIBRATION_MIN_SAMPLE && r.metadata.lowConfidence === true && r.recommendedAction === "COLLECT_MORE_EVIDENCE";
    add("Weak sample → low confidence", pass, `n=${r.sampleSize} lowConf=${r.metadata.lowConfidence} rec=${r.recommendedAction}`);
  }

  // 5) Calibration drift → detected (overconfident: 95% conf, ~50% correct ⇒ REVIEW_WEIGHT_PROFILE).
  {
    const s = [...samples(30, true, true, 95), ...samples(30, true, false, 95)];
    const r = computeModelCalibration([input("MARKET_ACCEPTANCE", s)])[0];
    const pass = (r.calibrationScore ?? 1) < 0.8 && r.metadata.confidenceFlag === "OVERCONFIDENT" && r.recommendedAction !== "NONE";
    add("Calibration drift → detected", pass, `cal=${r.calibrationScore} flag=${r.metadata.confidenceFlag} rec=${r.recommendedAction}`);
  }

  // 6) Instability → low stability detected from a wildly drifting snapshot series.
  {
    const series = [[10, 90, 15, 85, 20], [5, 95, 10, 90]];
    const r = computeModelCalibration([input("ZONE_DOMINANCE", [], series)])[0];
    const pass = (r.predictionStability ?? 1) < 0.8 && r.sampleSize === series.length;
    add("Instability → low stability detected", pass, `stability=${r.predictionStability} n=${r.sampleSize}`);
  }

  // 7) Every model evaluated (7 models in, 7 results out, name-sorted).
  {
    const names: MAIModelName[] = ["MARKET_ACCEPTANCE", "GAP_ANALYSIS", "WINNING_DNA", "BROKER_COACH", "GROWTH_STRATEGY", "ZONE_DOMINANCE", "VALUATION_WEIGHT"];
    const out = computeModelCalibration(names.map((n) => input(n, [])));
    const sorted = out.map((r) => r.modelName).join(",") === [...names].sort((a, b) => a.localeCompare(b)).join(",");
    add("Every model evaluated", out.length === names.length && sorted, `models=${out.length} sorted=${sorted}`);
  }

  // 8) Deterministic rerun → byte-identical output.
  {
    const mk = (): ModelEvalInput[] => [input("MARKET_ACCEPTANCE", [...samples(25, true, true, 70), ...samples(25, false, false, 70)], [[60, 62, 61]])];
    const a = JSON.stringify(computeModelCalibration(mk()));
    const b = JSON.stringify(computeModelCalibration(mk()));
    add("Deterministic rerun → same output", a === b, a === b ? "stable" : "DIVERGED");
  }

  // 9) No model is modified — engine returns measurements + advice only (no apply hooks).
  {
    const r = computeModelCalibration([input("MARKET_ACCEPTANCE", samples(60, true, false, 90))])[0];
    const advisoryOnly = typeof r.recommendedAction === "string" && !("applied" in r) && !("newThreshold" in r);
    add("No automatic model update", advisoryOnly, `rec=${r.recommendedAction} advisoryOnly=${advisoryOnly}`);
  }

  const allPass = cases.every((c) => c.pass);
  return { cases, allPass };
}
