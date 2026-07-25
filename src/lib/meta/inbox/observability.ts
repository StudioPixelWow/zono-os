// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INBOX OBSERVABILITY. Phase 3.
// ----------------------------------------------------------------------------
// Metric-name + low-cardinality-dimension CONTRACTS only (no emission). Identifier
// dimensions (org/conversation/user/lease) are FORBIDDEN and validated.
// ============================================================================
export const INBOX_METRICS = {
  syncScheduled: "meta_inbox_sync_scheduled_total",
  syncExecuted: "meta_inbox_sync_executed_total",
  conversationsProjected: "meta_inbox_conversations_projected_total",
  conversationsCreated: "meta_inbox_conversations_created_total",
  actionsApplied: "meta_inbox_actions_applied_total",
  queueDepth: "meta_inbox_queue_depth",
  deadLettered: "meta_inbox_dead_lettered_total",
  syncLatencyMs: "meta_inbox_sync_latency_ms",
} as const;

export const ALLOWED_DIMENSIONS: ReadonlySet<string> = new Set(["platform", "status", "action", "result", "error_category", "source_kind"]);
export const FORBIDDEN_DIMENSIONS: ReadonlySet<string> = new Set(["org_id", "conversation_id", "user_id", "assignee_user_id", "lease_token", "correlation_id", "participant_external_id"]);

export interface MetricContract { name: string; dimensions: readonly string[] }
export function validateMetricContract(c: MetricContract): { ok: boolean; violations: readonly string[] } {
  const violations: string[] = [];
  for (const d of c.dimensions) { if (FORBIDDEN_DIMENSIONS.has(d)) violations.push(`forbidden identifier dimension: ${d}`); else if (!ALLOWED_DIMENSIONS.has(d)) violations.push(`non-allowlisted dimension: ${d}`); }
  return { ok: violations.length === 0, violations };
}
