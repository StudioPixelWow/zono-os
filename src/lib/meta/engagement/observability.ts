// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · ENGAGEMENT OBSERVABILITY. Phase 1.
// ----------------------------------------------------------------------------
// Metric-name + low-cardinality-dimension CONTRACTS only (no emission). Identifier
// dimensions (org/object/comment/action/user/lease) are FORBIDDEN and validated —
// a metric can never leak an id or blow up cardinality.
// ============================================================================
export const ENGAGEMENT_METRICS = {
  commentsIngested: "meta_comments_ingested_total",
  commentSyncJobs: "meta_comment_sync_jobs_total",
  commentBackfillJobs: "meta_comment_backfill_jobs_total",
  moderationRequested: "meta_comment_moderation_requested_total",
  moderationApproved: "meta_comment_moderation_approved_total",
  moderationExecuted: "meta_comment_moderation_executed_total",
  moderationFailed: "meta_comment_moderation_failed_total",
  moderationManualReview: "meta_comment_moderation_manual_review_total",
  ingestLatencyMs: "meta_comment_ingest_latency_ms",
  moderationLatencyMs: "meta_comment_moderation_latency_ms",
  queueDepth: "meta_comment_queue_depth",
  deadLettered: "meta_comment_dead_lettered_total",
  providerFetchMs: "meta_comment_provider_fetch_ms",
} as const;

export const ALLOWED_DIMENSIONS: ReadonlySet<string> = new Set(["platform", "job_kind", "action_kind", "status", "result", "error_category", "verb"]);
export const FORBIDDEN_DIMENSIONS: ReadonlySet<string> = new Set(["org_id", "provider_object_id", "comment_id", "action_id", "user_id", "lease_token", "correlation_id", "author_external_id"]);

export interface MetricContract { name: string; dimensions: readonly string[] }
export function validateMetricContract(c: MetricContract): { ok: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const d of c.dimensions) { if (FORBIDDEN_DIMENSIONS.has(d)) violations.push(`forbidden identifier dimension: ${d}`); else if (!ALLOWED_DIMENSIONS.has(d)) violations.push(`non-allowlisted dimension: ${d}`); }
  return { ok: violations.length === 0, violations };
}
