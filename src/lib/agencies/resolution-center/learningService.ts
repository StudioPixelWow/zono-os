// ============================================================================
// ZONO — PHASE 26.12: Learning service (SERVER-ONLY). Records human decisions as
// AI feedback and aggregates them into learning statistics + resolution history.
// Pure aggregation lives in resolutionCenterFormat; this is the IO layer.
// ============================================================================
import "server-only";
import { recordFeedback, listFeedback, type RecordFeedbackInput } from "./learningRepository";
import { aggregateLearning } from "./resolutionCenterFormat";
import type { LearningStats, FeedbackRecord } from "./resolutionCenterFormat";

export async function recordLearning(input: RecordFeedbackInput): Promise<void> {
  return recordFeedback(input);
}

export async function getLearningStats(): Promise<LearningStats> {
  return aggregateLearning(await listFeedback(500));
}

/** Recent decisions as a history timeline (newest first). */
export async function getResolutionHistory(limit = 60): Promise<FeedbackRecord[]> {
  return listFeedback(limit);
}
