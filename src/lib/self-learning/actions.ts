"use server";
// ============================================================================
// 🧬 ZONO — Self-Learning AI — server actions. PHASE 54.0. Read-only, advisory.
// ============================================================================
import { getLearningReport } from "./service";
import type { LearningReport } from "./types";

export async function getLearningReportAction(): Promise<{ report?: LearningReport; error?: string }> {
  try {
    return { report: await getLearningReport() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "טעינת הלמידה נכשלה" };
  }
}
