// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 2 · Event Kernel · Timeline subscriber (PURE).
// Projects a durable domain_events row into a unified activity-timeline entry.
// Pure + deterministic: no I/O, fully offline-testable. The processor (server)
// feeds rows in and writes the returned projection to activity_events.
// A null return = "no timeline projection for this type" (skip, mark done).
// ============================================================================

/** The minimal shape the projector needs from a domain_events row. */
export interface DomainEventLike {
  event_type: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
  organization_id: string;
  actor_user_id: string | null;
  payload: Record<string, unknown> | null;
}

/** A ready-to-insert activity_events projection. */
export interface TimelineProjection {
  org_id: string;
  event_type: string;      // reuse the domain event_type verbatim (activity event_type is free text)
  entity_type: string;
  entity_id: string;
  title: string;           // Hebrew, human-facing timeline line
  actor_id: string | null;
  occurred_at: string;
}

// Human, Hebrew titles per domain event type. Kept in sync with DOMAIN_EVENTS
// (src/lib/kernel/events.ts). Unmapped types fall through to a generic title.
const TITLES: Record<string, string> = {
  // organization / agents
  "organization.created": "ארגון נוצר",
  "organization.updated": "פרטי ארגון עודכנו",
  "agent.invited": "סוכן הוזמן",
  "agent.activated": "סוכן הופעל",
  "agent.deactivated": "סוכן הושבת",
  "agent.role_changed": "תפקיד סוכן שונה",
  "agent.profile_updated": "פרופיל סוכן עודכן",
  // buyers
  "buyer.created": "נוצר קונה חדש",
  "buyer.updated": "פרטי קונה עודכנו",
  "buyer.stage_changed": "שלב הקונה השתנה",
  "buyer.archived": "קונה הועבר לארכיון",
  // sellers
  "seller.created": "נוצר מוכר חדש",
  "seller.updated": "פרטי מוכר עודכנו",
  "seller.linked_to_property": "מוכר קושר לנכס",
  "seller.unlinked_from_property": "מוכר נותק מנכס",
  "seller.risk_changed": "סיכון מוכר השתנה",
  // leads
  "lead.created": "נוצר ליד חדש",
  "lead.updated": "פרטי ליד עודכנו",
  "lead.stage_changed": "שלב הליד השתנה",
  "lead.assigned": "ליד שויך",
  "lead.converted_to_buyer": "ליד הומר לקונה",
  "lead.converted_to_seller": "ליד הומר למוכר",
  // properties
  "property.created": "נוצר נכס חדש",
  "property.updated": "פרטי נכס עודכנו",
  "property.published": "נכס פורסם",
  "property.price_changed": "מחיר הנכס עודכן",
  "property.status_changed": "סטטוס הנכס השתנה",
  "property.sold": "נכס נמכר",
  "property.archived": "נכס הועבר לארכיון",
  // external listings
  "external_listing.ingested": "מודעה חיצונית נקלטה",
  "external_listing.updated": "מודעה חיצונית עודכנה",
  "external_listing.promoted": "מודעה חיצונית קודמה לנכס",
  "external_listing.disappeared": "מודעה חיצונית נעלמה",
  "external_listing.returned": "מודעה חיצונית חזרה",
  // deals
  "deal.created": "נוצרה עסקה חדשה",
  "deal.stage_changed": "שלב העסקה השתנה",
  "deal.won": "עסקה נסגרה בהצלחה",
  "deal.lost": "עסקה אבדה",
  "deal.updated": "פרטי עסקה עודכנו",
  // tasks
  "task.created": "נוצרה משימה",
  "task.assigned": "משימה שויכה",
  "task.completed": "משימה הושלמה",
  "task.overdue": "משימה באיחור",
  // meetings
  "meeting.created": "נקבעה פגישה",
  "meeting.rescheduled": "פגישה נדחתה למועד אחר",
  "meeting.completed": "פגישה הושלמה",
  "meeting.cancelled": "פגישה בוטלה",
  "meeting.no_show": "אי-הגעה לפגישה",
  // journeys
  "journey.created": "מסע לקוח נפתח",
  "journey.stage_changed": "שלב במסע הלקוח השתנה",
  "journey.completed": "מסע לקוח הושלם",
  "journey.blocked": "מסע לקוח נחסם",
  // documents
  "document.created": "נוצר מסמך",
  "document.approval_requested": "התבקש אישור למסמך",
  "document.approved": "מסמך אושר",
  "document.sent": "מסמך נשלח",
  "document.viewed": "מסמך נצפה",
  "document.signed": "מסמך נחתם",
  "document.completed": "מסמך הושלם",
  "document.failed": "טיפול במסמך נכשל",
};

/** Domain event types we deliberately do NOT project to the timeline (noise). */
const SKIP = new Set<string>([
  "external_listing.ingested",
  "external_listing.updated",
]);

/**
 * Project a domain event into a timeline entry, or null to skip it.
 * Deterministic: same input → same output.
 */
export function projectEventToTimeline(evt: DomainEventLike): TimelineProjection | null {
  if (!evt.event_type || !evt.entity_type || !evt.entity_id || !evt.organization_id) return null;
  if (SKIP.has(evt.event_type)) return null;
  const title = TITLES[evt.event_type] ?? genericTitle(evt.event_type);
  if (!title) return null;
  return {
    org_id: evt.organization_id,
    event_type: evt.event_type,
    entity_type: evt.entity_type,
    entity_id: evt.entity_id,
    title,
    actor_id: evt.actor_user_id,
    occurred_at: evt.occurred_at,
  };
}

/** Fallback title for a type absent from the map: "<entity>: <verb>". */
function genericTitle(eventType: string): string {
  const parts = eventType.split(".");
  return parts.length === 2 ? `${parts[0]} · ${parts[1].replace(/_/g, " ")}` : eventType;
}
