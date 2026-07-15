// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 2 · Event Kernel · Timeline subscriber (PURE).
// Projects a durable domain_events row into the ONE canonical activity timeline.
// Pure + deterministic + offline-testable: no I/O. The processor (server) feeds
// rows in and writes the returned projections to activity_events.
//
// Stage-2 upgrades:
//  • Returns an ARRAY of projections — one per timeline the event belongs on
//    (the subject PLUS any related entities found in the payload/metadata), so a
//    single event (e.g. deal.won) appears on Deal + Property + Buyer + Seller
//    timelines WITHOUT duplicating the canonical event (idempotency key includes
//    the target entity, so each timeline gets exactly one row).
//  • Carries event_id (idempotency), source ('kernel'), visibility, description,
//    related-entity link and metadata.
//  • Uses actor_user_id (the real activity_events column — the old actor_id was
//    a silent write bug).
//  • Empty array = "no timeline projection for this type" (skip, mark done).
// ============================================================================

/** The minimal shape the projector needs from a domain_events row. */
export interface DomainEventLike {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
  organization_id: string;
  actor_user_id: string | null;
  payload: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export type TimelineVisibility = "internal" | "private" | "shared" | "public";

/** A ready-to-insert activity_events projection (one timeline row). */
export interface TimelineProjection {
  org_id: string;
  event_id: string;                    // originating domain_events.id (idempotency)
  event_type: string;                  // domain event_type verbatim (free text)
  entity_type: string;                 // the timeline this row belongs on
  entity_id: string;
  related_entity_type: string | null;  // the most relevant other party (context)
  related_entity_id: string | null;
  title: string;                       // Hebrew, human-facing line
  description: string | null;
  actor_user_id: string | null;
  occurred_at: string;
  visibility: TimelineVisibility;
  source: "kernel";
  metadata: Record<string, unknown>;
}

// Human, Hebrew titles per domain event type. Kept in sync with DOMAIN_EVENTS.
const TITLES: Record<string, string> = {
  "organization.created": "ארגון נוצר",
  "organization.updated": "פרטי ארגון עודכנו",
  "agent.invited": "סוכן הוזמן",
  "agent.activated": "סוכן הופעל",
  "agent.deactivated": "סוכן הושבת",
  "agent.role_changed": "תפקיד סוכן שונה",
  "agent.profile_updated": "פרופיל סוכן עודכן",
  "buyer.created": "נוצר קונה חדש",
  "buyer.updated": "פרטי קונה עודכנו",
  "buyer.stage_changed": "שלב הקונה השתנה",
  "buyer.archived": "קונה הועבר לארכיון",
  "seller.created": "נוצר מוכר חדש",
  "seller.updated": "פרטי מוכר עודכנו",
  "seller.linked_to_property": "מוכר קושר לנכס",
  "seller.unlinked_from_property": "מוכר נותק מנכס",
  "seller.risk_changed": "סיכון מוכר השתנה",
  "lead.created": "נוצר ליד חדש",
  "lead.updated": "פרטי ליד עודכנו",
  "lead.stage_changed": "שלב הליד השתנה",
  "lead.assigned": "ליד שויך",
  "lead.converted_to_buyer": "ליד הומר לקונה",
  "lead.converted_to_seller": "ליד הומר למוכר",
  "property.created": "נוצר נכס חדש",
  "property.updated": "פרטי נכס עודכנו",
  "property.published": "נכס פורסם",
  "property.price_changed": "מחיר הנכס עודכן",
  "property.status_changed": "סטטוס הנכס השתנה",
  "property.sold": "נכס נמכר",
  "property.archived": "נכס הועבר לארכיון",
  "external_listing.ingested": "מודעה חיצונית נקלטה",
  "external_listing.promoted": "מודעה חיצונית קודמה לנכס",
  "deal.created": "נוצרה עסקה חדשה",
  "deal.stage_changed": "שלב העסקה השתנה",
  "deal.won": "עסקה נסגרה בהצלחה",
  "deal.lost": "עסקה אבדה",
  "deal.updated": "פרטי עסקה עודכנו",
  "task.created": "נוצרה משימה",
  "task.assigned": "משימה שויכה",
  "task.completed": "משימה הושלמה",
  "task.overdue": "משימה באיחור",
  "meeting.created": "נקבעה פגישה",
  "meeting.rescheduled": "פגישה נדחתה למועד אחר",
  "meeting.completed": "פגישה הושלמה",
  "meeting.cancelled": "פגישה בוטלה",
  "meeting.no_show": "אי-הגעה לפגישה",
  "journey.created": "מסע לקוח נפתח",
  "journey.stage_changed": "שלב במסע הלקוח השתנה",
  "journey.completed": "מסע לקוח הושלם",
  "journey.blocked": "מסע לקוח נחסם",
  "document.created": "נוצר מסמך",
  "document.approval_requested": "התבקש אישור למסמך",
  "document.approved": "מסמך אושר",
  "document.sent": "מסמך נשלח",
  "document.viewed": "מסמך נצפה",
  "document.signed": "מסמך נחתם",
  "document.completed": "מסמך הושלם",
  "document.failed": "טיפול במסמך נכשל",
  "facebook.connected": "חשבון פייסבוק חובר",
  "facebook.disconnected": "חשבון פייסבוק נותק",
  "whatsapp.connected": "וואטסאפ חובר",
  "whatsapp.disconnected": "וואטסאפ נותק",
  "automation.activated": "אוטומציה הופעלה",
  "automation.run_completed": "ריצת אוטומציה הושלמה",
  "automation.run_failed": "ריצת אוטומציה נכשלה",
};

/**
 * Types we deliberately do NOT project to the timeline. Channel history
 * (communication.*) is kept in its own ledgers and bridged as milestones only —
 * never duplicated here. The rest are low-signal noise.
 */
const SKIP = new Set<string>([
  "communication.received",
  "communication.sent",
  "external_listing.updated",
  "external_listing.disappeared",
  "external_listing.returned",
  "automation.run_requested",
]);

// Payload/metadata keys that name a related entity, mapped to its entity type.
const RELATION_KEYS: { keys: string[]; type: string }[] = [
  { keys: ["propertyId", "property_id"], type: "property" },
  { keys: ["buyerId", "buyer_id"], type: "buyer" },
  { keys: ["sellerId", "seller_id"], type: "seller" },
  { keys: ["leadId", "lead_id"], type: "lead" },
  { keys: ["dealId", "deal_id"], type: "deal" },
  { keys: ["meetingId", "meeting_id"], type: "meeting" },
  { keys: ["documentId", "document_id"], type: "document" },
  { keys: ["journeyId", "journey_id"], type: "journey" },
  { keys: ["externalListingId", "external_listing_id"], type: "external_listing" },
  { keys: ["taskId", "task_id"], type: "task" },
];

interface EntityRef { type: string; id: string }

function readString(src: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = src?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ── BATCH 5.6A — THE JOURNEY TIMELINE FACT ──────────────────────────────────
//
// THE DEFECT THIS FIXES (found by the 5.6 inventory, confirmed on live data):
//
// journey-applier emits `journey.*` with entityType "journey" and entityId = the
// JOURNEY's id. The projector anchored the row on that id, so the lifecycle fact
// landed on a timeline nobody reads — it did NOT appear on the buyer's or the
// property's timeline — while the raw `buyer.stage_changed` command produced a
// SECOND row for the very same business fact. One advance, two rows, and the
// better one invisible. Live proof: for one buyer advance, activity_events held
//   09:13:39  buyer.stage_changed    → entity_type=buyer
//   09:13:42  journey.stage_changed  → entity_type=journey   ← nobody sees this
//
// THE RULE (deterministic, and it loses NOTHING):
//   1. A journey fact is anchored on its SUBJECT (the buyer / property / …), read
//      from the payload the applier already writes. The journey itself becomes the
//      related link, so the row still points at the spine.
//   2. `journey.stage_changed` is SUPPRESSED when — and only when — the event that
//      caused it was itself a `*.stage_changed` COMMAND. That command already wrote
//      this exact fact on this exact timeline; the journey row would be its echo.
//      We know the cause because the applier records `metadata.sourceEventType`.
//   3. Every other journey fact is kept and promoted: `journey.created`,
//      `journey.completed`, and a stage change driven by real evidence
//      (property.published, meeting.completed, deal.won …) is NOT a duplicate of
//      the event that caused it — "the listing was published" and "the journey moved
//      to active" are two different sentences, and a broker wants both.
//
// We suppress by PROVENANCE, not by string-matching two rows after the fact. A
// dedupe that guesses is how duplicates get hidden instead of fixed.

const JOURNEY_EVENT_PREFIX = "journey.";

/** True for the applier's own output. */
function isJourneyEventType(t: string): boolean {
  return t.startsWith(JOURNEY_EVENT_PREFIX);
}

/** The entity a journey belongs to — the timeline a broker actually opens. */
export function journeySubject(evt: DomainEventLike): EntityRef | null {
  const type = readString(evt.payload, "subjectType");
  const id = readString(evt.payload, "subjectId");
  return type && id ? { type, id } : null;
}

/**
 * Is this journey transition merely the echo of a stage COMMAND that already
 * produced its own timeline row on the same entity?
 */
export function isEchoOfStageCommand(evt: DomainEventLike): boolean {
  if (evt.event_type !== "journey.stage_changed") return false;
  const src = readString(evt.metadata, "sourceEventType");
  return !!src && src.endsWith(".stage_changed") && !isJourneyEventType(src);
}

/** All related entities named in the event's payload/metadata (subject excluded). */
export function relatedEntities(evt: DomainEventLike): EntityRef[] {
  const out: EntityRef[] = [];
  const seen = new Set<string>([`${evt.entity_type}:${evt.entity_id}`]);
  for (const { keys, type } of RELATION_KEYS) {
    for (const k of keys) {
      const id = readString(evt.payload, k) ?? readString(evt.metadata, k);
      if (!id) continue;
      const dedup = `${type}:${id}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push({ type, id });
    }
  }
  return out;
}

/** Optional Hebrew detail line from the payload (never exposes internals). */
function descriptionFor(evt: DomainEventLike): string | null {
  const p = evt.payload ?? {};
  switch (evt.event_type) {
    case "property.price_changed": {
      const from = p.oldPrice ?? p.from ?? p.previous;
      const to = p.newPrice ?? p.to ?? p.price;
      if (from != null && to != null) return `מ-${from} ל-${to}`;
      return null;
    }
    case "property.status_changed":
    case "deal.stage_changed":
    case "buyer.stage_changed":
    case "lead.stage_changed":
    case "journey.stage_changed": {
      const from = p.fromStage ?? p.from ?? p.previous;
      const to = p.toStage ?? p.to ?? p.stage ?? p.status;
      if (from != null && to != null) return `${from} ← ${to}`;
      if (to != null) return `${to}`;
      return null;
    }
    default:
      return null;
  }
}

/**
 * Project a domain event into one timeline row per relevant entity (subject +
 * related). Empty array = skip. Deterministic: same input → same output.
 */
export function projectEventToTimeline(evt: DomainEventLike): TimelineProjection[] {
  if (!evt.id || !evt.event_type || !evt.entity_type || !evt.entity_id || !evt.organization_id) return [];
  if (SKIP.has(evt.event_type)) return [];

  // 5.6A — a journey transition that merely echoes a stage COMMAND is not a second
  // fact. The command's own row already said it, on this same timeline.
  if (isEchoOfStageCommand(evt)) return [];

  const title = TITLES[evt.event_type] ?? genericTitle(evt.event_type);
  if (!title) return [];

  const description = descriptionFor(evt);
  const related = relatedEntities(evt);

  // 5.6A — anchor a journey fact on its SUBJECT, and LINK it back to the journey.
  // The journey is context, not a timeline of its own: fanning out to the journey
  // entity is what produced the row nobody could see. Without a subject in the
  // payload we keep the old anchor rather than drop the fact — an ugly row beats a
  // lost one.
  const jSubject = isJourneyEventType(evt.event_type) ? journeySubject(evt) : null;
  const journeyRef: EntityRef | null = jSubject ? { type: "journey", id: evt.entity_id } : null;
  const subject: EntityRef = jSubject ?? { type: evt.entity_type, id: evt.entity_id };

  const timelines: EntityRef[] = jSubject ? [subject] : [subject, ...related];

  return timelines.map((t) => {
    // Context link: on the subject's own row, point to the primary related
    // entity; on a related entity's row, point back to the subject.
    const link: EntityRef | null =
      journeyRef ??
      (t.type === subject.type && t.id === subject.id ? (related[0] ?? null) : subject);
    return {
      org_id: evt.organization_id,
      event_id: evt.id,
      event_type: evt.event_type,
      entity_type: t.type,
      entity_id: t.id,
      related_entity_type: link?.type ?? null,
      related_entity_id: link?.id ?? null,
      title,
      description,
      actor_user_id: evt.actor_user_id,
      occurred_at: evt.occurred_at,
      visibility: "internal" as const,
      source: "kernel" as const,
      metadata: { domainEventType: evt.event_type },
    };
  });
}

/** Fallback title for a type absent from the map: "<entity> · <verb>". */
function genericTitle(eventType: string): string {
  const parts = eventType.split(".");
  return parts.length === 2 ? `${parts[0]} · ${parts[1].replace(/_/g, " ")}` : eventType;
}
