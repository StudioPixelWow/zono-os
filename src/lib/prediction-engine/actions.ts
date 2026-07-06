"use server";
// ============================================================================
// 🔮 ZONO — Prediction Engine — server actions. PHASE 52.0. Read-only.
// ============================================================================
import { getPredictions } from "./service";
import type { PredictionReport } from "./types";

export async function getPredictionsAction(): Promise<{ report?: PredictionReport; error?: string }> {
  try {
    return { report: await getPredictions() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "בניית התחזיות נכשלה" };
  }
}
