// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT OBSERVABILITY. Phase 2.
// ----------------------------------------------------------------------------
// Metric-name + low-cardinality-dimension CONTRACTS only (no emission). Identifier
// dimensions (org/object/asset/job/user/lease) are FORBIDDEN and validated — a
// metric can never leak an id or blow up cardinality.
// ============================================================================
export const INSIGHT_METRICS = {
  refreshScheduled: "meta_insight_refresh_scheduled_total",
  refreshExecuted: "meta_insight_refresh_executed_total",
  refreshFailed: "meta_insight_refresh_failed_total",
  snapshotsAppended: "meta_insight_snapshots_appended_total",
  quiesced: "meta_insight_quiesced_total",
  providerFetchMs: "meta_insight_provider_fetch_ms",
  queueDepth: "meta_insight_queue_depth",
  deadLettered: "meta_insight_dead_lettered_total",
} as const;

export const ALLOWED_DIMENSIONS: ReadonlySet<string> = new Set(["platform", "subject_kind", "job_kind", "status", "result", "error_category", "metric_key", "period"]);
export const FORBIDDEN_DIMENSIONS: ReadonlySet<string> = new Set(["org_id", "provider_object_id", "asset_id", "job_id", "user_id", "lease_token", "correlation_id"]);

export interface MetricContract { name: string; dimensions: readonly string[] }
export function validateMetricContract(c: MetricContract): { ok: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const d of c.dimensions) { if (FORBIDDEN_DIMENSIONS.has(d)) violations.push(`forbidden identifier dimension: ${d}`); else if (!ALLOWED_DIMENSIONS.has(d)) violations.push(`non-allowlisted dimension: ${d}`); }
  return { ok: violations.length === 0, violations };
}

// ── Queue-health evaluation (Batch 7 · Production GA) ────────────────────────
// Coarse, secret-free grade over canonical status counts only (no ids, no
// payloads). Mirrors the sibling subsystems' evaluators; reused by the internal
// queue-health route to bring insights to parity with the other Meta queues.
export function evaluateInsightsHealth(input: { byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }): { healthy: boolean; backlog: number; degraded: boolean } {
  const backlog = (input.byStatus.scheduled ?? 0) + (input.byStatus.available ?? 0) + (input.byStatus.retry_wait ?? 0);
  const degraded = input.deadLetter > 0 || (input.oldestDueMs ?? 0) > 15 * 60_000 || backlog > 500;
  return { healthy: !degraded, backlog, degraded };
}
