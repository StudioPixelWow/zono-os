// ============================================================================
// 🔗 ZONO OS 2.0 — Event Kernel · Matching recompute subscriber (PURE).
// Maps a domain event to a BOUNDED match recompute — one buyer, or one property —
// never an org-wide scan. The daily buyer-matches-reconcile cron stays the safety
// net; this keeps a buyer's match set fresh the moment criteria or inventory move.
//
// Pure + deterministic: it only decides WHAT to recompute (scope + id). The
// processor performs it via generateMatchesForBuyerId / generateMatchesForPropertyId.
// ============================================================================
import type { DomainEventLike } from "./subscriber";

export interface MatchRecomputeIntent {
  scope: "buyer" | "property";
  id: string;               // buyerId or propertyId to recompute
  reason: string;           // the event that triggered it (observability)
}

// Buyer-side triggers: anything that changes a buyer's search criteria/identity.
const BUYER_EVENTS = new Set<string>([
  "buyer.created",
  "buyer.updated",
  "buyer.stage_changed",
]);

// Property-side triggers: create, price, status, publish/unpublish, core attrs.
// property.sold / archived / status_changed all flow here so a now-unavailable
// property is removed from ACTIVE recommendations by the bounded recompute.
const PROPERTY_EVENTS = new Set<string>([
  "property.created",
  "property.updated",
  "property.price_changed",
  "property.status_changed",
  "property.published",
  "property.stage_changed",
  "property.sold",
  "property.archived",
  "property.back_on_market",
]);

/**
 * Decide the bounded recompute for an event, or null to skip.
 * Deterministic: same event → same intent.
 */
export function projectEventToMatchRecompute(evt: DomainEventLike): MatchRecomputeIntent | null {
  if (!evt.organization_id || !evt.entity_id) return null;
  if (evt.entity_type === "buyer" && BUYER_EVENTS.has(evt.event_type)) {
    return { scope: "buyer", id: evt.entity_id, reason: evt.event_type };
  }
  if (evt.entity_type === "property" && PROPERTY_EVENTS.has(evt.event_type)) {
    return { scope: "property", id: evt.entity_id, reason: evt.event_type };
  }
  return null;
}
