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
// Stage 4A — Graph subscriber (pure; wired into the drain loop once domain_events is live).
export { projectEventToGraphEdges } from "./graph-subscriber";
export type { GraphEdgeUpsert } from "./graph-subscriber";
// Stage 4B — Org-Memory subscriber (pure; wired into the drain loop once domain_events is live).
export { projectEventToMemory } from "./memory-subscriber";
export type { MemoryEventUpsert } from "./memory-subscriber";
// Stage 5A — Journey subscriber (pure; wiring reuses the journey service once domain_events is live).
export { projectEventToJourneyTransition } from "./journey-subscriber";
export type { JourneyTransition, JourneySubjectType } from "./journey-subscriber";
// Stage 2 — Legacy timeline bridge + backfill (pure mappers + server sweep).
export { syntheticEventId, bridgeLegacyActivity, bridgeJourneyEvent, bridgeDocumentAudit } from "./legacy-bridge";
export type { BridgedProjection, LegacyActivityRow, JourneyEventRow, DocumentAuditRow } from "./legacy-bridge";
export { backfillTimeline } from "./backfill-service";
export type { BackfillResult, BackfillDiagnostics } from "./backfill-service";
// Outbox observability (read-only health).
export { getKernelOutboxHealth, getTimelineKernelHealth } from "./health";
export type { KernelOutboxHealth, TimelineKernelHealth } from "./health";
