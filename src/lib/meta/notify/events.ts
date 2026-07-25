// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · NOTIFICATION EVENT REGISTRY. Phase 0.
// ----------------------------------------------------------------------------
// The canonical catalogue of emittable Meta events + a PURE builder that stamps
// a well-formed, non-secret envelope. NOTHING is delivered — this only defines
// and constructs contracts. A future Notification Delivery OS consumes them.
// ============================================================================
import type { MetaNotificationEvent, MetaNotificationEventName, MetaNotificationSeverity } from "./types";

/** Default severity per event (routing hint only). */
export const META_EVENT_SEVERITY: Record<MetaNotificationEventName, MetaNotificationSeverity> = {
  "meta.connection.expiring": "warning",
  "meta.connection.revoked": "critical",
  "meta.permission.missing": "warning",
  "meta.post.approval_requested": "info",
  "meta.post.approved": "info",
  "meta.post.rejected": "info",
  "meta.post.changes_requested": "info",
  "meta.post.scheduled": "info",
  "meta.post.scheduled_cancelled": "info",
  "meta.post.retry_scheduled": "warning",
  "meta.post.dead_lettered": "critical",
  "meta.post.published": "info",
  "meta.post.partially_published": "warning",
  "meta.post.failed": "critical",
  "meta.post.manual_review_required": "warning",
  "meta.post.verified": "info",
  "meta.post.discrepancy_detected": "warning",
  "meta.post.provider_deleted": "critical",
  "meta.post.provider_hidden": "warning",
  "meta.post.ambiguous_resolved": "info",
  "meta.post.verification_failed": "warning",
  "meta.comment.received": "info",
  "meta.comment.urgent": "warning",
  "meta.comment.reply_published": "info",
  "meta.comment.moderated": "info",
  "meta.comment.moderation_failed": "warning",
  "meta.insights.refreshed": "info",
  "meta.insights.refresh_failed": "warning",
  "meta.inbox.new_conversation": "info",
  "meta.inbox.assigned": "info",
  "meta.intelligence.high_urgency_detected": "warning",
  "meta.intelligence.suggestion_ready": "info",
  "meta.intelligence.scoring_failed": "warning",
  "meta.listening.new_mention": "info",
  "meta.listening.high_urgency_mention": "warning",
  "meta.listening.source_degraded": "warning",
  "meta.listening.ingestion_failed": "warning",
  "meta.message.received": "info",
  "meta.message.sent": "info",
  "meta.message.send_review": "warning",
  "meta.webhook.unhealthy": "critical",
  "meta.rate_limit.warning": "warning",
};

/** All canonical event names (stable, deterministic order). */
export const META_EVENT_NAMES: readonly MetaNotificationEventName[] = Object.keys(META_EVENT_SEVERITY) as MetaNotificationEventName[];

/** Fields the builder needs; `occurredAt`/`correlationId` are caller-supplied. */
export interface BuildMetaEventInput<T extends Record<string, unknown>> {
  event: MetaNotificationEventName;
  orgId: string;
  occurredAt: string;
  assetRef?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  data?: T;
}

/**
 * PURE builder for a canonical event envelope. It never reads a clock (caller
 * supplies `occurredAt`, keeping the function deterministic and testable) and
 * never includes a secret.
 */
export function buildMetaNotificationEvent<T extends Record<string, unknown>>(input: BuildMetaEventInput<T>): MetaNotificationEvent<T> {
  return {
    schemaVersion: 1,
    event: input.event,
    orgId: input.orgId,
    assetRef: input.assetRef ?? null,
    actorId: input.actorId ?? null,
    severity: META_EVENT_SEVERITY[input.event],
    occurredAt: input.occurredAt,
    correlationId: input.correlationId ?? null,
    data: (input.data ?? {}) as T,
  };
}
