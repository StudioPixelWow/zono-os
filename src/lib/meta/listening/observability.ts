// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING OBSERVABILITY. Phase 5.
// ----------------------------------------------------------------------------
// Metric-name + low-cardinality-dimension CONTRACTS only (no emission). Identifier +
// content dimensions (org/asset/author/mention/provider-object/user/lease/cursor/
// text/raw-error/raw-model) are FORBIDDEN and validated. Includes a secret-free
// listening health evaluator (healthy | degraded | critical).
// ============================================================================
export const LISTENING_METRICS = {
  jobsScheduled: "meta_listening_jobs_scheduled_total",
  jobsCompleted: "meta_listening_jobs_completed_total",
  jobsRetried: "meta_listening_jobs_retried_total",
  jobsDeadLettered: "meta_listening_jobs_dead_lettered_total",
  mentionsIngested: "meta_listening_mentions_ingested_total",
  mentionsDeduplicated: "meta_listening_mentions_deduplicated_total",
  mentionsMatched: "meta_listening_mentions_matched_total",
  mentionsUnmatched: "meta_listening_mentions_unmatched_total",
  pollDurationMs: "meta_listening_poll_duration_ms",
  providerReadLatencyMs: "meta_listening_provider_read_latency_ms",
  queueLagMs: "meta_listening_queue_lag_ms",
  queueBacklog: "meta_listening_queue_backlog",
  sourceFreshnessMs: "meta_listening_source_freshness_ms",
  capabilityBlocked: "meta_listening_capability_blocked_total",
  rateLimited: "meta_listening_rate_limited_total",
  intelligenceEnqueued: "meta_listening_intelligence_enqueued_total",
  inboxProjected: "meta_listening_inbox_projected_total",
} as const;

export const ALLOWED_DIMENSIONS: ReadonlySet<string> = new Set(["platform", "job_kind", "outcome", "mention_kind", "match_state", "error_kind", "health_state"]);
export const FORBIDDEN_DIMENSIONS: ReadonlySet<string> = new Set(["org_id", "asset_id", "author_id", "author_external_id", "mention_id", "provider_object_id", "user_id", "lease_token", "cursor", "cursor_ref", "text", "content", "raw_error", "model_name", "correlation_id"]);

export interface MetricContract { name: string; dimensions: readonly string[] }
export function validateMetricContract(c: MetricContract): { ok: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const d of c.dimensions) { if (FORBIDDEN_DIMENSIONS.has(d)) violations.push(`forbidden dimension: ${d}`); else if (!ALLOWED_DIMENSIONS.has(d)) violations.push(`non-allowlisted dimension: ${d}`); }
  return { ok: violations.length === 0, violations };
}

/** Secret-free listening health evaluator. */
export function evaluateListeningHealth(input: { byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null; blockedSources: number }): { state: "healthy" | "degraded" | "critical"; backlog: number } {
  const backlog = (input.byStatus.scheduled ?? 0) + (input.byStatus.available ?? 0) + (input.byStatus.retry_wait ?? 0);
  if (input.deadLetter > 0 || (input.oldestDueMs ?? 0) > 30 * 60_000) return { state: "critical", backlog };
  if (input.blockedSources > 0 || backlog > 500 || (input.oldestDueMs ?? 0) > 10 * 60_000) return { state: "degraded", backlog };
  return { state: "healthy", backlog };
}
