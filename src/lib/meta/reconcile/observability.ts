// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION OBSERVABILITY. Phase 3C.
// ----------------------------------------------------------------------------
// Metric-name + low-cardinality-dimension CONTRACTS only (no emission, no provider
// call). Identifier dimensions (org/operation/target/object/webhook/user/lease)
// are FORBIDDEN and a pure guard enforces it — a metric can never leak an id or
// blow up cardinality.
// ============================================================================
export const RECONCILE_METRICS = {
  webhookReceived: "meta_webhook_received_total",
  webhookVerified: "meta_webhook_verified_total",
  webhookInvalidSignature: "meta_webhook_invalid_signature_total",
  webhookDeduplicated: "meta_webhook_deduplicated_total",
  webhookUnmatched: "meta_webhook_unmatched_total",
  webhookProcessingLatencyMs: "meta_webhook_processing_latency_ms",
  reconcileJobsDue: "meta_reconcile_jobs_due",
  reconcileJobsExecuting: "meta_reconcile_jobs_executing",
  verificationSuccess: "meta_reconcile_verification_success_total",
  verificationRetry: "meta_reconcile_verification_retry_total",
  verificationUnresolved: "meta_reconcile_verification_unresolved_total",
  ambiguityResolved: "meta_reconcile_ambiguity_resolved_total",
  discrepancyOpened: "meta_reconcile_discrepancy_opened_total",
  discrepancyResolved: "meta_reconcile_discrepancy_resolved_total",
  providerObjectMissing: "meta_reconcile_provider_object_missing_total",
  providerObjectDeleted: "meta_reconcile_provider_object_deleted_total",
  providerObjectHidden: "meta_reconcile_provider_object_hidden_total",
  providerPermissionLost: "meta_reconcile_provider_permission_lost_total",
  queueLag: "meta_reconcile_queue_lag_ms",
  deadLettered: "meta_reconcile_dead_lettered_total",
  autoRepairApplied: "meta_reconcile_auto_repair_applied_total",
  manualVerificationRequested: "meta_reconcile_manual_verification_requested_total",
  providerLookupMs: "meta_reconcile_provider_lookup_ms",
} as const;

export const ALLOWED_DIMENSIONS: ReadonlySet<string> = new Set(["provider", "platform", "object_type", "event_type", "discrepancy_type", "severity", "result", "error_category", "evidence_kind", "job_kind"]);
export const FORBIDDEN_DIMENSIONS: ReadonlySet<string> = new Set(["org_id", "operation_id", "target_id", "provider_object_id", "webhook_event_id", "user_id", "draft_id", "lease_token", "correlation_id"]);

export interface MetricContract { name: string; dimensions: readonly string[] }
export function validateMetricContract(c: MetricContract): { ok: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const d of c.dimensions) {
    if (FORBIDDEN_DIMENSIONS.has(d)) violations.push(`forbidden identifier dimension: ${d}`);
    else if (!ALLOWED_DIMENSIONS.has(d)) violations.push(`non-allowlisted dimension: ${d}`);
  }
  return { ok: violations.length === 0, violations };
}
