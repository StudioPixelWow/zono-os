// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION HEALTH (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Deterministic, secret-free, low-cardinality health grades for webhook ingestion,
// the reconciliation queue, provider verification, and overall publishing
// consistency. Pure functions of counts + ages — no ids, no payloads.
// ============================================================================
export type HealthGrade = "healthy" | "degraded" | "critical";
export interface HealthResult { grade: HealthGrade; reasons: readonly string[] }

const worst = (a: HealthGrade, b: HealthGrade): HealthGrade => (["healthy", "degraded", "critical"].indexOf(b) > ["healthy", "degraded", "critical"].indexOf(a) ? b : a);

export interface WebhookHealthInput { lastValidWebhookAgeMs: number | null; invalidSignatureRate: number; unmatchedBacklog: number; failed: number }
export const DEFAULT_WEBHOOK_THRESHOLDS = { maxSilenceMs: 6 * 3600_000, maxInvalidRate: 0.1, maxUnmatched: 100, criticalInvalidRate: 0.5 };
export function evaluateWebhookHealth(i: WebhookHealthInput, t = DEFAULT_WEBHOOK_THRESHOLDS): HealthResult {
  let g: HealthGrade = "healthy"; const reasons: string[] = [];
  if (i.invalidSignatureRate >= t.criticalInvalidRate) { g = worst(g, "critical"); reasons.push("high_invalid_signature_rate"); }
  else if (i.invalidSignatureRate >= t.maxInvalidRate) { g = worst(g, "degraded"); reasons.push("elevated_invalid_signature_rate"); }
  if (i.unmatchedBacklog > t.maxUnmatched) { g = worst(g, "degraded"); reasons.push("unmatched_backlog_high"); }
  if (i.lastValidWebhookAgeMs != null && i.lastValidWebhookAgeMs > t.maxSilenceMs) { g = worst(g, "degraded"); reasons.push("no_recent_valid_webhook"); }
  return { grade: g, reasons };
}

export interface ReconcileQueueHealthInput { backlog: number; inFlight: number; oldestDueMs: number | null; deadLetter: number; unresolved: number }
export const DEFAULT_RECONCILE_THRESHOLDS = { maxBacklog: 1000, maxOldestDueMs: 600_000, maxDeadLetter: 50, maxUnresolved: 200 };
export function evaluateReconcileQueueHealth(i: ReconcileQueueHealthInput, t = DEFAULT_RECONCILE_THRESHOLDS): HealthResult {
  let g: HealthGrade = "healthy"; const reasons: string[] = [];
  if (i.deadLetter > t.maxDeadLetter) { g = worst(g, "critical"); reasons.push("dead_letter_accumulation"); }
  if (i.oldestDueMs != null && i.oldestDueMs > t.maxOldestDueMs * 3) { g = worst(g, "critical"); reasons.push("reconciliation_worker_possibly_stuck"); }
  else if (i.oldestDueMs != null && i.oldestDueMs > t.maxOldestDueMs) { g = worst(g, "degraded"); reasons.push("oldest_due_high"); }
  if (i.backlog > t.maxBacklog) { g = worst(g, "degraded"); reasons.push("backlog_high"); }
  if (i.unresolved > t.maxUnresolved) { g = worst(g, "degraded"); reasons.push("unresolved_high"); }
  return { grade: g, reasons };
}

export interface ConsistencyHealthInput { openDiscrepancies: number; criticalDiscrepancies: number; providerDeleted: number; permissionLost: number }
export const DEFAULT_CONSISTENCY_THRESHOLDS = { maxOpen: 100, maxCritical: 0, maxPermissionLost: 5 };
export function evaluatePublishingConsistency(i: ConsistencyHealthInput, t = DEFAULT_CONSISTENCY_THRESHOLDS): HealthResult {
  let g: HealthGrade = "healthy"; const reasons: string[] = [];
  if (i.criticalDiscrepancies > t.maxCritical) { g = worst(g, "critical"); reasons.push("critical_discrepancies_present"); }
  if (i.permissionLost > t.maxPermissionLost) { g = worst(g, "degraded"); reasons.push("permission_loss_widespread"); }
  if (i.openDiscrepancies > t.maxOpen) { g = worst(g, "degraded"); reasons.push("open_discrepancies_high"); }
  return { grade: g, reasons };
}
