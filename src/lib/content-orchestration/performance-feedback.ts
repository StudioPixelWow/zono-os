// ============================================================================
// ZONO — performance → learning feedback (pure). Deterministic, evidence-gated.
// Recommendations require a minimum sample size and always cite platform,
// period, sample size and metric. NEVER mutates Brand DNA — output is advisory
// and requires review/approval.
// ============================================================================

export interface PerformanceRecord {
  orgId: string;
  outputId: string;
  publicationId: string;
  platform: string;
  variantKey: string;
  period: string;
  freshness: string;
  impressions: number;
  reach: number;
  engagement: number;
  clicks: number;
  saves?: number;
  shares?: number;
  leads?: number;
  spend?: number | null;
}

export interface FeedbackRecommendation {
  kind: "format" | "hook" | "visual_subject" | "cta" | "publication_pattern";
  statement: string;
  evidence: { platform: string; period: string; sampleSize: number; metric: string; value: number; comparison?: number };
  confidence: "low" | "medium" | "high";
  requiresApproval: true;
}

export interface FeedbackResult {
  status: "insufficient_evidence" | "recommendation";
  reason?: string;
  recommendations: FeedbackRecommendation[];
  mutatesBrandDna: false;
}

export const MIN_SAMPLE_SIZE = 5;

function ctr(r: PerformanceRecord): number { return r.impressions > 0 ? r.clicks / r.impressions : 0; }

/**
 * Compare two variant cohorts on CTR. Requires ≥ MIN_SAMPLE_SIZE records each.
 * Pure — no side effects, never touches Brand DNA.
 */
export function evaluateVariantPerformance(
  platform: string, period: string, cohortA: PerformanceRecord[], cohortB: PerformanceRecord[],
): FeedbackResult {
  if (cohortA.length < MIN_SAMPLE_SIZE || cohortB.length < MIN_SAMPLE_SIZE) {
    return { status: "insufficient_evidence", reason: `need ≥ ${MIN_SAMPLE_SIZE} per cohort (have ${cohortA.length}/${cohortB.length})`, recommendations: [], mutatesBrandDna: false };
  }
  const avg = (rs: PerformanceRecord[]) => rs.reduce((s, r) => s + ctr(r), 0) / rs.length;
  const a = avg(cohortA), b = avg(cohortB);
  const winner = a >= b ? cohortA : cohortB;
  const value = Math.max(a, b), comparison = Math.min(a, b);
  const lift = comparison > 0 ? (value - comparison) / comparison : 1;
  const confidence: FeedbackRecommendation["confidence"] = winner.length >= 20 && lift > 0.2 ? "high" : winner.length >= 10 ? "medium" : "low";
  return {
    status: "recommendation",
    recommendations: [{
      kind: "format",
      statement: `Variant '${winner[0].variantKey}' had the higher CTR on ${platform}`,
      evidence: { platform, period, sampleSize: winner.length, metric: "ctr", value, comparison },
      confidence,
      requiresApproval: true,
    }],
    mutatesBrandDna: false,
  };
}
