// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING OBSERVABILITY. Phase 6.
// ----------------------------------------------------------------------------
// Metric-name + low-cardinality-dimension CONTRACTS only (no emission). Identifier +
// content dimensions (org/conversation/message/user/participant/lease/cursor/text/
// body/raw-error) are FORBIDDEN and validated. Message bodies never appear in any
// metric. Includes a secret-free messaging health evaluator.
// ============================================================================
export const MESSAGING_METRICS = {
  jobsScheduled: "meta_messaging_jobs_scheduled_total",
  jobsCompleted: "meta_messaging_jobs_completed_total",
  jobsRetried: "meta_messaging_jobs_retried_total",
  jobsDeadLettered: "meta_messaging_jobs_dead_lettered_total",
  messagesIngested: "meta_messaging_messages_ingested_total",
  messagesDeduplicated: "meta_messaging_messages_deduplicated_total",
  sendsDrafted: "meta_messaging_sends_drafted_total",
  sendsApproved: "meta_messaging_sends_approved_total",
  sendsSent: "meta_messaging_sends_sent_total",
  sendsManualReview: "meta_messaging_sends_manual_review_total",
  windowBlocked: "meta_messaging_window_blocked_total",
  policyTagBlocked: "meta_messaging_policy_tag_blocked_total",
  providerReadLatencyMs: "meta_messaging_provider_read_latency_ms",
  providerSendLatencyMs: "meta_messaging_provider_send_latency_ms",
  queueLagMs: "meta_messaging_queue_lag_ms",
  queueBacklog: "meta_messaging_queue_backlog",
} as const;

export const ALLOWED_DIMENSIONS: ReadonlySet<string> = new Set(["platform", "job_kind", "outcome", "direction", "window_state", "policy_tag", "approval_state", "error_kind", "health_state"]);
export const FORBIDDEN_DIMENSIONS: ReadonlySet<string> = new Set(["org_id", "conversation_id", "message_id", "user_id", "participant_external_id", "lease_token", "cursor", "cursor_ref", "text", "body", "content", "raw_error", "encryption_key", "correlation_id"]);

export interface MetricContract { name: string; dimensions: readonly string[] }
export function validateMetricContract(c: MetricContract): { ok: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const d of c.dimensions) { if (FORBIDDEN_DIMENSIONS.has(d)) violations.push(`forbidden dimension: ${d}`); else if (!ALLOWED_DIMENSIONS.has(d)) violations.push(`non-allowlisted dimension: ${d}`); }
  return { ok: violations.length === 0, violations };
}
export function evaluateMessagingHealth(input: { byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null; manualReview: number }): { state: "healthy" | "degraded" | "critical"; backlog: number } {
  const backlog = (input.byStatus.scheduled ?? 0) + (input.byStatus.available ?? 0) + (input.byStatus.retry_wait ?? 0);
  if (input.deadLetter > 0 || (input.oldestDueMs ?? 0) > 30 * 60_000) return { state: "critical", backlog };
  if (input.manualReview > 0 || backlog > 500 || (input.oldestDueMs ?? 0) > 10 * 60_000) return { state: "degraded", backlog };
  return { state: "healthy", backlog };
}
