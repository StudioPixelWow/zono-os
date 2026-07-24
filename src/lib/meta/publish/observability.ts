// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH OBSERVABILITY. Phase 3A.
// ----------------------------------------------------------------------------
// Contract-only metric names + allowed low-cardinality dimensions. High-cardinality
// labels (org id, draft id, operation id, external object id) are FORBIDDEN. Logs
// must be structured + secret-free. Nothing is emitted here (contracts only).
// ============================================================================

export type PublishMetricName =
  | "meta.publish.operation.created"
  | "meta.publish.operation.completed"
  | "meta.publish.operation.duration_ms"
  | "meta.publish.target.duration_ms"
  | "meta.publish.target.success"
  | "meta.publish.target.failure"
  | "meta.publish.partial_success"
  | "meta.publish.provider_processing.duration_ms"
  | "meta.publish.manual_retry"
  | "meta.publish.ambiguous_result"
  | "meta.publish.duplicate_suppressed"
  | "meta.publish.rate_limited"
  | "meta.publish.media_fetch_failure"
  | "meta.publish.readiness_blocked";

/** The ONLY allowed metric dimensions — all bounded-cardinality. */
export const ALLOWED_METRIC_DIMENSIONS = ["platform", "content_kind", "result_class", "error_category", "provider", "capability_key"] as const;

/** Forbidden (high-cardinality) label keys — must never be used as metric labels. */
export const FORBIDDEN_METRIC_DIMENSIONS = ["org_id", "draft_id", "operation_id", "external_object_id", "target_id", "user_id"] as const;

export function isAllowedDimension(key: string): boolean {
  return (ALLOWED_METRIC_DIMENSIONS as readonly string[]).includes(key);
}
