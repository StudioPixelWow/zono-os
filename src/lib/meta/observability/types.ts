// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · OBSERVABILITY contracts. Phase 0.
// ----------------------------------------------------------------------------
// Contract-only observability surface. Reuses the in-house metrics *pattern*
// from Batch 6.6A.1 conceptually (no import of frozen internals). Phase 0 only
// declares the metric/health vocabulary; nothing is emitted or scraped here.
// ============================================================================

/** Canonical operational metric names (stable identifiers, not values). */
export type MetaMetricName =
  | "meta.provider.calls_total"
  | "meta.provider.errors_total"
  | "meta.publish.jobs_total"
  | "meta.publish.duration_ms"
  | "meta.webhook.received_total"
  | "meta.webhook.signature_failures_total"
  | "meta.rate_limit.remaining"
  | "meta.token.health_checks_total";

/** A canonical health probe result for a Meta subsystem. */
export interface MetaHealthProbe {
  subsystem: "connection" | "publishing" | "webhooks" | "comments" | "provider";
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  detail: string | null;
  checkedAt: string;
}
