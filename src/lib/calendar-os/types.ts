// ============================================================================
// 🗓️ ZONO — Calendar OS™ · unified model. PHASE 43.0 (Foundation).
// ONE event model for the whole platform. Calendar OS does NOT own data — it
// AGGREGATES existing sources (meetings, tasks, missions, followups,
// property_calendar_plans) into a single CalendarEvent. No new table.
// ============================================================================

/** The originating system a CalendarEvent was normalized from. */
export type EventSource =
  | "meeting" | "task" | "mission" | "followup" | "property_plan" | "provider" | "custom";

/** Business event type (the label shown to the user). */
export type EventType =
  | "meeting" | "property_visit" | "buyer_visit" | "seller_meeting"
  | "task" | "mission" | "workflow_step" | "reminder" | "phone_call"
  | "whatsapp_followup" | "facebook_publish" | "marketing_campaign"
  | "photo_day" | "open_house" | "document_deadline" | "signature" | "custom";

export const EVENT_TYPE_HE: Record<EventType, string> = {
  meeting: "פגישה", property_visit: "ביקור בנכס", buyer_visit: "ביקור קונה",
  seller_meeting: "פגישת מוכר", task: "משימה", mission: "משימת AI",
  workflow_step: "שלב תהליך", reminder: "תזכורת", phone_call: "שיחת טלפון",
  whatsapp_followup: "מעקב וואטסאפ", facebook_publish: "פרסום פייסבוק",
  marketing_campaign: "קמפיין שיווק", photo_day: "יום צילום", open_house: "בית פתוח",
  document_deadline: "דדליין מסמך", signature: "חתימה", custom: "אירוע",
};

export type EntityKind = "buyer" | "seller" | "lead" | "property" | "office" | "broker" | null;

export interface EventEntity { kind: EntityKind; id: string | null; name: string | null }

/** The single unified event. Every source normalizes to this. */
export interface CalendarEvent {
  /** Stable, source-qualified id — the dedup key (`${source}:${rawId}`). */
  id: string;
  source: EventSource;
  type: EventType;
  title: string;
  detail: string | null;
  /** ISO start; null-safe events are dropped by the normalizer. */
  start: string;
  /** ISO end (optional). */
  end: string | null;
  allDay: boolean;
  status: string | null;         // scheduled | done | cancelled | pending | ...
  done: boolean;
  priority: number;              // 0..100
  urgency: number;               // 0..100 (derived: closeness to due + priority)
  entity: EventEntity;
  propertyId: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  href: string | null;           // internal ZONO deep-link
  /** Read-only in Calendar OS — it lives in its source system (approval-gated to change). */
  locked: boolean;
}

// ── AI daily plan ────────────────────────────────────────────────────────────
export interface PlannedSlot {
  event: CalendarEvent;
  rank: number;
  score: number;
  reason: string;
  suggestedStart: string | null;   // when the planner recommends doing it (approval-gated)
}
export interface DayPlan {
  date: string;                    // yyyy-mm-dd
  slots: PlannedSlot[];
  summary: { total: number; meetings: number; tasks: number; overdue: number; freeAfter: string | null };
}

// ── Smart reschedule (never auto — proposal only) ────────────────────────────
export type RescheduleTrigger =
  | "meeting_cancelled" | "traffic" | "new_hot_lead" | "seller_at_risk"
  | "property_emergency" | "manual";
export interface RescheduleProposal {
  trigger: RescheduleTrigger;
  moved: { eventId: string; title: string; from: string | null; toSuggested: string | null; why: string }[];
  note: string;                    // always reminds: requires approval, nothing auto-changed
}

// ── Route optimization ───────────────────────────────────────────────────────
export interface RouteStop { eventId: string; title: string; lat: number | null; lng: number | null; city: string | null }
export interface OptimizedRoute {
  order: RouteStop[];
  totalKm: number;
  legs: { fromTitle: string; toTitle: string; km: number }[];
  unlocated: RouteStop[];          // stops without coordinates (kept, appended)
}

// ── Team availability ────────────────────────────────────────────────────────
export type AvailabilityState = "free" | "busy" | "meeting" | "field" | "vacation" | "offline";
export interface BrokerAvailability {
  brokerId: string; name: string | null;
  state: AvailabilityState;
  nextFreeAt: string | null;
  todayEvents: number;
}

// ── Provider abstraction (Google / Outlook) — INTERFACE ONLY, no connectors ──
export type ProviderId = "google" | "microsoft" | "ical";
export interface CalendarProviderStatus { id: ProviderId; label: string; connected: boolean; note: string }
/**
 * Future two-way sync contract. No implementation ships in the foundation phase;
 * this only fixes the shape so connectors can be added later without refactor.
 */
export interface CalendarProvider {
  id: ProviderId;
  label: string;
  /** Pull external events into the unified model (future). */
  listEvents(range: { start: string; end: string }): Promise<CalendarEvent[]>;
  /** Push an internal event out (future, approval-gated). */
  pushEvent?(event: CalendarEvent): Promise<{ ok: boolean; externalId?: string }>;
  status(): Promise<CalendarProviderStatus>;
}
