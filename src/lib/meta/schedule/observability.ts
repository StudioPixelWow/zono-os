// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SCHEDULE OBSERVABILITY CONTRACTS. Phase 3B.
// ----------------------------------------------------------------------------
// Metric-name + low-cardinality-dimension CONTRACTS only (no emission here, no
// provider call). High-cardinality labels (org id, operation id, target id, job
// id, external object id, correlation id) are FORBIDDEN as metric dimensions — a
// pure guard enforces that so a metric can never leak an identifier or blow up
// cardinality. This mirrors the Phase-3A observability contract for the queue.
// ============================================================================

export const SCHEDULE_METRICS = {
  jobsScheduled: "meta_schedule_jobs_scheduled_total",
  jobsClaimed: "meta_schedule_jobs_claimed_total",
  jobsExecuted: "meta_schedule_jobs_executed_total",
  retriesScheduled: "meta_schedule_retries_scheduled_total",
  deadLettered: "meta_schedule_dead_lettered_total",
  recovered: "meta_schedule_recovered_total",
  requeued: "meta_schedule_requeued_total",
  dispatchLatencyMs: "meta_schedule_dispatch_latency_ms",
  queueDepth: "meta_schedule_queue_depth",
  leaseExpired: "meta_schedule_lease_expired_total",
} as const;

/** Allowed low-cardinality dimensions. Everything else is rejected. */
export const ALLOWED_DIMENSIONS: ReadonlySet<string> = new Set(["job_kind", "status", "outcome", "reason", "retry_class", "platform", "result"]);

/** High-cardinality / identifier dimensions that must never label a metric. */
export const FORBIDDEN_DIMENSIONS: ReadonlySet<string> = new Set(["org_id", "operation_id", "target_id", "job_id", "external_object_id", "correlation_id", "lease_token", "user_id"]);

export interface MetricContract { name: string; dimensions: readonly string[] }

/** Pure validation: a contract is valid iff every dimension is allow-listed and
 *  none is a forbidden identifier. */
export function validateMetricContract(c: MetricContract): { ok: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const d of c.dimensions) {
    if (FORBIDDEN_DIMENSIONS.has(d)) violations.push(`forbidden identifier dimension: ${d}`);
    else if (!ALLOWED_DIMENSIONS.has(d)) violations.push(`non-allowlisted dimension: ${d}`);
  }
  return { ok: violations.length === 0, violations };
}
