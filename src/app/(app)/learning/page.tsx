// ============================================================================
// 🧬 ZONO — Self-Learning AI page (/learning). PHASE 54.0.
// What the office has LEARNED from real outcomes — advisory, threshold-gated.
// ============================================================================
import { getLearningReport } from "@/lib/self-learning/service";
import type { LearningReport } from "@/lib/self-learning/types";
import { LearningView } from "./LearningView";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  let report: LearningReport | null = null;
  try { report = await getLearningReport(); } catch (e) { console.error("[learning] load failed:", e); }
  return <LearningView report={report} />;
}
