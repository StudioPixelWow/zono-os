// ============================================================================
// 🏢 ZONO — BROKER INTELLIGENCE · Area 6 · Office (PURE).
// Manager view. Summarizes the SAME shared priority queue (no new engine) into
// the four things a manager must see automatically: highest office opportunity,
// highest office risk, biggest revenue opportunity, biggest retention risk.
// Pure selection over already-prioritized, evidence-based recommendations —
// nothing fabricated. Honest nulls when no qualifying item exists.
// ============================================================================
import type { PrioritizedRecommendation } from "./priority";

export interface OfficeSummary {
  /** Highest-priority growth opportunity (acquisition or ready buyer). */
  topOpportunity: PrioritizedRecommendation | null;
  /** Highest-priority risk of losing something (deal risk or seller churn). */
  topRisk: PrioritizedRecommendation | null;
  /** Biggest revenue opportunity — a ready buyer/deal about to close. */
  biggestRevenue: PrioritizedRecommendation | null;
  /** Biggest retention risk — a seller most likely to cancel. */
  biggestRetention: PrioritizedRecommendation | null;
  /** Totals for honest coverage. */
  totalActionable: number;
}

const isOpportunity = (r: PrioritizedRecommendation) => r.area === "acquisition" || r.area === "buyer";
const isRisk = (r: PrioritizedRecommendation) => r.area === "deal" || r.area === "seller";
// Revenue-bearing = a buyer about to transact or a deal in motion.
const isRevenue = (r: PrioritizedRecommendation) => r.area === "buyer" || r.area === "deal";
// Retention = a seller at risk of cancelling exclusivity.
const isRetention = (r: PrioritizedRecommendation) => r.area === "seller";

/** The queue is already sorted by priority desc, so the first match per bucket
 *  is the highest. Pure + deterministic. */
export function summarizeOffice(queue: PrioritizedRecommendation[]): OfficeSummary {
  const first = (pred: (r: PrioritizedRecommendation) => boolean) => queue.find(pred) ?? null;
  return {
    topOpportunity: first(isOpportunity),
    topRisk: first(isRisk),
    biggestRevenue: first(isRevenue),
    biggestRetention: first(isRetention),
    totalActionable: queue.length,
  };
}
