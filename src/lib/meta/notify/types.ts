// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · NOTIFICATION EVENT CONTRACTS. Phase 0.
// ----------------------------------------------------------------------------
// CONTRACTS ONLY. Meta Workspace EMITS canonical events; a future Notification
// Delivery OS ROUTES them. Nothing is delivered here, and no existing delivery
// provider is touched. Every event is org-scoped, non-secret, versioned,
// timestamped, and traceable.
// ============================================================================

/** The closed set of canonical Meta notification event names. */
export type MetaNotificationEventName =
  | "meta.connection.expiring"
  | "meta.connection.revoked"
  | "meta.permission.missing"
  | "meta.post.approval_requested"
  | "meta.post.approved"
  | "meta.post.rejected"
  | "meta.post.changes_requested"
  | "meta.post.scheduled"
  | "meta.post.published"
  | "meta.post.failed"
  | "meta.comment.received"
  | "meta.comment.urgent"
  | "meta.message.received"
  | "meta.webhook.unhealthy"
  | "meta.rate_limit.warning";

/** Severity hint for downstream routing (not a delivery decision). */
export type MetaNotificationSeverity = "info" | "warning" | "critical";

/**
 * A canonical, non-secret notification event. `data` carries only safe,
 * event-specific fields (ids, counts, reasons) — never a token, private message
 * body, or raw provider payload.
 */
export interface MetaNotificationEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Schema version for forward-compatibility. */
  schemaVersion: 1;
  event: MetaNotificationEventName;
  orgId: string;
  /** Canonical asset reference (opaque ids), when applicable. */
  assetRef: string | null;
  /** Audit provenance only. */
  actorId: string | null;
  severity: MetaNotificationSeverity;
  occurredAt: string; // ISO-8601
  /** Correlation id threading the event to its originating operation. */
  correlationId: string | null;
  /** Safe, event-specific payload (no secrets). */
  data: T;
}
