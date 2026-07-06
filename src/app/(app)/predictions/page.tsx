// ============================================================================
// 🔮 ZONO — Prediction Engine page (/predictions). PHASE 52.0.
// Probabilistic forecasts consuming existing engine signals (no recompute).
// ============================================================================
import { getPredictions } from "@/lib/prediction-engine/service";
import type { PredictionReport } from "@/lib/prediction-engine/types";
import { PredictionsView } from "./PredictionsView";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  let report: PredictionReport | null = null;
  try { report = await getPredictions(); } catch (e) { console.error("[predictions] load failed:", e); }
  return <PredictionsView report={report} />;
}
