// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTELLIGENCE OBSERVABILITY. Phase 4.
// ----------------------------------------------------------------------------
// Metric-name + low-cardinality-dimension CONTRACTS only (no emission). Identifier
// + content dimensions (org/conversation/comment/user/subject_ref/lease/content)
// are FORBIDDEN and validated. The raw model name is forbidden as a dimension (it
// can be high-cardinality) — only a coarse `model_provider` bucket is allowed.
// ============================================================================
export const INTEL_METRICS = {
  jobsEnqueued: "meta_intel_jobs_enqueued_total",
  jobsCompleted: "meta_intel_jobs_completed_total",
  jobsFailed: "meta_intel_jobs_failed_total",
  jobsDeadLettered: "meta_intel_jobs_dead_lettered_total",
  scoringLatencyMs: "meta_intel_scoring_latency_ms",
  copilotDraftLatencyMs: "meta_intel_reply_draft_latency_ms",
  structuredOutputRejected: "meta_intel_structured_output_rejected_total",
  signalsBySentiment: "meta_intel_signals_by_sentiment_total",
  signalsByIntent: "meta_intel_signals_by_intent_total",
  signalsByUrgency: "meta_intel_signals_by_urgency_total",
  suggestions: "meta_intel_suggestions_total",
  rescores: "meta_intel_rescores_total",
  queueLagMs: "meta_intel_queue_lag_ms",
  queueBacklog: "meta_intel_queue_backlog",
} as const;

export const ALLOWED_DIMENSIONS: ReadonlySet<string> = new Set(["platform", "sentiment", "intent", "urgency", "action_kind", "status", "result", "error_category", "job_kind", "model_provider"]);
export const FORBIDDEN_DIMENSIONS: ReadonlySet<string> = new Set(["org_id", "conversation_id", "inbox_conversation_id", "comment_id", "user_id", "subject_ref", "lease_token", "correlation_id", "model_name", "content", "content_fragment", "participant_external_id"]);

export interface MetricContract { name: string; dimensions: readonly string[] }
export function validateMetricContract(c: MetricContract): { ok: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const d of c.dimensions) { if (FORBIDDEN_DIMENSIONS.has(d)) violations.push(`forbidden dimension: ${d}`); else if (!ALLOWED_DIMENSIONS.has(d)) violations.push(`non-allowlisted dimension: ${d}`); }
  return { ok: violations.length === 0, violations };
}

/** Secret-free queue-health evaluator (coarse buckets only). */
export function evaluateQueueHealth(input: { byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }): { healthy: boolean; backlog: number; degraded: boolean } {
  const backlog = (input.byStatus.scheduled ?? 0) + (input.byStatus.available ?? 0) + (input.byStatus.retry_wait ?? 0);
  const degraded = input.deadLetter > 0 || (input.oldestDueMs ?? 0) > 15 * 60_000 || backlog > 500;
  return { healthy: !degraded, backlog, degraded };
}
