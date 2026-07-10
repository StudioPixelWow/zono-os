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
