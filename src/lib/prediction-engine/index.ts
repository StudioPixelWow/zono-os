// ============================================================================
// 🔮 ZONO — Prediction Engine — barrel. PHASE 52.0.
// Forecasts 9 outcomes by consuming existing engine signals (no recompute).
// Every prediction: confidence, data sufficiency, evidence, missing data, risk,
// approval-gated action, expiration. Nothing auto-executes.
// ============================================================================
export {
  PREDICTION_ENGINE_VERSION, PREDICTION_HE, NO_CERTAINTY_NOTE,
  type PredictionKind, type Prediction, type PredictionReport, type PredictionSignals,
  type DataSufficiency, type RiskLevel, type Trend, type PredictionSubject, type PredictionAction,
} from "./types";
export { forecast, summarizePredictions } from "./forecast";
export { getPredictions } from "./service";
export { runSelfCheck } from "./qa";
