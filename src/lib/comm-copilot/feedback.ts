// ============================================================================
// 🤖 ZONO — Copilot HUMAN FEEDBACK aggregation (pure).
// ----------------------------------------------------------------------------
// Turns captured feedback records into quality metrics. IMPORTANT: this data is
// for FUTURE MODEL EVALUATION ONLY. Nothing here feeds back into generation —
// the Copilot never auto-retrains or changes behavior from feedback (a hard
// invariant, asserted in QA). Pure + testable.
// ============================================================================
import type { FeedbackRecord, FeedbackMetrics } from "./types";

/** Feedback exists to measure quality over time — never to alter live behavior. */
export const FEEDBACK_PURPOSE = "evaluation_only" as const;

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);

/** Aggregate feedback records into acceptance/rejection/correction/usage rates,
 *  classification accuracy, and summary/recommendation usefulness. */
export function computeFeedbackMetrics(records: FeedbackRecord[]): FeedbackMetrics {
  const of = (t: FeedbackRecord["artifactType"]) => records.filter((r) => r.artifactType === t);
  const count = (arr: FeedbackRecord[], v: string) => arr.filter((r) => r.feedback === v).length;

  const replies = of("reply_suggestion");
  const classifications = of("classification");
  const summaries = of("summary");
  const recs = of("recommendation");

  const totalReplies = replies.length;
  const accepted = count(replies, "accepted");
  const edited = count(replies, "edited");
  const correct = count(classifications, "correct");
  const incorrect = count(classifications, "incorrect");

  return {
    totalReplies,
    acceptanceRate: ratio(accepted, totalReplies),
    rejectionRate: ratio(count(replies, "rejected"), totalReplies),
    correctionRate: ratio(edited, totalReplies),
    suggestionUsage: ratio(accepted + edited, totalReplies),          // used in any form
    totalClassifications: classifications.length,
    classificationAccuracy: ratio(correct, correct + incorrect),
    summaryUsefulness: ratio(count(summaries, "useful"), count(summaries, "useful") + count(summaries, "not_useful")),
    recommendationUsefulness: ratio(count(recs, "useful"), count(recs, "useful") + count(recs, "not_useful")),
  };
}
