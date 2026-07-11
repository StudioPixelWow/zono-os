// ============================================================================
// 🧠 ZONO OS 2.0 — Event Kernel · public surface.
// ============================================================================
export { emitBusinessEvent } from "./emit";
export type { EmitEventInput, EmitResult } from "./emit";
export { DOMAIN_EVENTS } from "./events";
export type { DomainEventType, DomainEntityType } from "./events";
// Stage 2 — Timeline subscriber + outbox processor.
export { projectEventToTimeline } from "./subscriber";
export type { DomainEventLike, TimelineProjection } from "./subscriber";
export { drainDomainEvents } from "./processor";
export type { DrainResult } from "./processor";
// Stage 3 — Notification subscriber (second consumer of the outbox).
export { projectEventToNotification, notificationEntityColumn } from "./notification-subscriber";
export type { NotificationProjection, NotificationLevel } from "./notification-subscriber";
// Stage 3 — Automation subscriber (classifies event → journey trigger + approval-bundle candidate; never executes).
export { projectEventToAutomation } from "./automation-subscriber";
export type { AutomationIntent } from "./automation-subscriber";
// Stage 3 — Recommendation subscriber (event → affected areas + Daily/Executive cache refresh).
export { projectEventToRecommendationRefresh } from "./recommendation-subscriber";
export type { RecommendationRefresh, RecommendationArea } from "./recommendation-subscriber";
// Stage 3 — Per-subscriber delivery ledger (observability + idempotency).
export { recordDelivery } from "./subscriber-deliveries";
export type { SubscriberName, DeliveryStatus, DeliveryInput } from "./subscriber-deliveries";
// Stage 4A — Graph subscriber (pure; wired into the drain loop once domain_events is live).
export { projectEventToGraphEdges } from "./graph-subscriber";
export type { GraphEdgeUpsert } from "./graph-subscriber";
// Stage 4B — Org-Memory subscriber (pure; wired into the drain loop once domain_events is live).
export { projectEventToMemory } from "./memory-subscriber";
export type { MemoryEventUpsert } from "./memory-subscriber";
// Batch 5.2 — Journey subscriber: PURE projection (evidence → canonical intents)
// + the server applier that performs them through buildTransition() and the 5.1
// DB constraints. It replaces the Stage-5A sketch (projectEventToJourneyTransition),
// whose ad-hoc stages ("in_deal", "closed_won") were never canonical.
export { projectEventToJourney, isJourneyEvent } from "./journey-subscriber";
export type { JourneyIntent, JourneyProjection, JourneySkipReason } from "./journey-subscriber";
export { applyJourneyIntent } from "./journey-applier";
export type { JourneyOutcome, JourneyApplyResult } from "./journey-applier";
// Stage 2 — Legacy timeline bridge + backfill (pure mappers + server sweep).
export { syntheticEventId, bridgeLegacyActivity, bridgeJourneyEvent, bridgeDocumentAudit } from "./legacy-bridge";
export type { BridgedProjection, LegacyActivityRow, JourneyEventRow, DocumentAuditRow } from "./legacy-bridge";
export { backfillTimeline } from "./backfill-service";
export type { BackfillResult, BackfillDiagnostics } from "./backfill-service";
// Outbox observability (read-only health).
export { getKernelOutboxHealth, getTimelineKernelHealth } from "./health";
export type { KernelOutboxHealth, TimelineKernelHealth } from "./health";
