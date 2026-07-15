// ============================================================================
// 🔎 ZONO OS 2.0 — Stage 4 · Search subscriber (PURE).
// Classifies a domain event into a search-index intent: upsert (create / update
// / stage-change / conversion) or soft_delete (archive / removal). It does NOT
// read entity data — the server indexer fetches the current row and builds the
// document. Idempotency is per (event_id, entity) downstream. Pure + deterministic.
// Empty (null) = the event does not affect search.
// ============================================================================
import type { DomainEventLike } from "@/lib/kernel/subscriber";
import { SEARCHABLE_ENTITY_TYPES } from "./document";

export interface SearchIndexIntent {
  action: "upsert" | "soft_delete";
  entityType: string;
  entityId: string;
  eventId: string;
}

// Events that refresh a search document (create / update / stage / conversion /
// status). Archive + disappearance soft-delete. Kept explicit so unrelated
// events never churn the projection.
const UPSERT_EVENTS = new Set<string>([
  "buyer.created", "buyer.updated", "buyer.stage_changed",
  "seller.created", "seller.updated", "seller.risk_changed",
  "lead.created", "lead.updated", "lead.stage_changed",
  "lead.converted_to_buyer", "lead.converted_to_seller",
  "property.created", "property.updated", "property.price_changed",
  "property.status_changed", "property.sold", "property.published",
  "external_listing.ingested", "external_listing.updated",
  "external_listing.promoted", "external_listing.returned",
  "deal.created", "deal.updated", "deal.stage_changed", "deal.won", "deal.lost",
  "meeting.created", "meeting.rescheduled", "meeting.completed", "meeting.cancelled",
  "task.created", "task.completed",
  "document.created", "document.sent", "document.completed", "document.signed",
  "agent.profile_updated",
]);

// Lifecycle-moving journey events that refresh the journey's OWN search document
// (title from the subject, subtitle = type · stage). Unrelated journey.* churn
// (e.g. score updates) never touches search. Batch 5.6B.
const JOURNEY_UPSERT_EVENTS = new Set<string>([
  "journey.created", "journey.stage_changed", "journey.completed",
  "journey.blocked", "journey.paused", "journey.resumed", "journey.reopened",
]);

const SOFT_DELETE_EVENTS = new Set<string>([
  "property.archived",
  "buyer.archived",
  "external_listing.disappeared",
]);

/** Classify a domain event into a search-index intent, or null. Deterministic. */
export function classifyEventForSearch(evt: DomainEventLike): SearchIndexIntent | null {
  if (!evt.id || !evt.organization_id || !evt.entity_type || !evt.entity_id) return null;

  // Journey events index the journey's OWN first-class document (entity_type=
  // 'journey', entity_id = the journey id). The dedicated journey indexer
  // resolves the subject entity to build the title/route. Handled BEFORE the
  // generic searchable guard because 'journey' is not in SEARCH_CONFIG. 5.6B.
  if (evt.event_type.startsWith("journey.")) {
    if (!JOURNEY_UPSERT_EVENTS.has(evt.event_type)) return null;
    return { action: "upsert", entityType: "journey", entityId: evt.entity_id, eventId: evt.id };
  }

  if (!SEARCHABLE_ENTITY_TYPES.includes(evt.entity_type)) return null;
  if (SOFT_DELETE_EVENTS.has(evt.event_type)) {
    return { action: "soft_delete", entityType: evt.entity_type, entityId: evt.entity_id, eventId: evt.id };
  }
  if (UPSERT_EVENTS.has(evt.event_type)) {
    return { action: "upsert", entityType: evt.entity_type, entityId: evt.entity_id, eventId: evt.id };
  }
  return null;
}
