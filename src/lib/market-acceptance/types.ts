// ============================================================================
// Market Acceptance Intelligence™ — FOUNDATION types (PURE, client-safe).
//
// Evidence only. This phase observes and records the lifecycle of every external
// listing. It does NOT infer "sold" / acceptance scores / valuation impact —
// those belong to later phases. States and events here describe what was
// OBSERVED, never what is assumed.
// ============================================================================

/** Observed lifecycle state of a single external listing. */
export type ListingLifecycleState =
  | "ACTIVE"          // seen in the most recent scan of its area
  | "DISAPPEARED"     // was active, not returned by a scan that covered its city
  | "RETURNED"        // reappeared after a disappearance (transient; settles to ACTIVE)
  | "LIKELY_SOLD"     // reserved for a later inference phase — never set here
  | "LIKELY_REMOVED"  // reserved for a later inference phase — never set here
  | "UNKNOWN";        // indeterminate (e.g. never re-scanned)

/** Append-only timeline event types. */
export type ListingEventType =
  | "FIRST_SEEN"
  | "PRICE_CHANGED"
  | "IMAGE_CHANGED"
  | "DESCRIPTION_CHANGED"
  | "STATUS_CHANGED"
  | "DISAPPEARED"
  | "RETURNED"
  | "REAPPEARED_WITH_NEW_ID" // reserved (cross-id inference) — not produced in MAI-1
  | "LIKELY_DUPLICATE"       // reserved (inference) — not produced in MAI-1
  | "MANUAL_OVERRIDE";       // reserved (human action) — not produced in MAI-1

/** One row of `market_listing_lifecycle`. */
export interface ListingLifecycleRow {
  id: string;
  organization_id: string;
  provider: string;
  external_id: string;
  listing_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_scan_at: string;
  current_state: ListingLifecycleState;
  days_on_market: number;
  times_seen: number;
  times_disappeared: number;
  times_returned: number;
  last_known_price: number | null;
  last_known_status: string | null;
  last_known_images: unknown;
  last_known_coordinates: { lat: number; lng: number } | null;
  last_known_address: string | null;
  last_known_city: string | null;
  last_known_neighborhood: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** One row of `market_listing_events` (append-only). */
export interface ListingEventRow {
  id: string;
  organization_id: string;
  lifecycle_id: string | null;
  provider: string;
  external_id: string;
  event_type: ListingEventType;
  previous_value: unknown;
  new_value: unknown;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Summary returned by a reconcile pass (for logging — not persisted scoring). */
export interface LifecycleReconcileResult {
  scanned: number;        // external listings considered "seen this run"
  created: number;        // new lifecycle rows
  updated: number;        // existing lifecycle rows touched
  disappeared: number;    // active rows that went missing in scanned cities
  returned: number;       // rows that came back from a gone state
  eventsAppended: number; // timeline rows written
}
