// ============================================================================
// 🔔 ZONO OS 2.0 — Stage 3 · Event Kernel · Notification subscriber (PURE).
// A SECOND consumer of the domain_events outbox (alongside the timeline). Turns
// a small set of HIGH-SIGNAL business events into a per-user notification. Most
// events produce no notification (they live in the timeline only) — this keeps
// the attention feed meaningful. Pure + deterministic; the processor writes the
// returned row to `notifications` (SECONDARY to the timeline, but NOT best-effort:
// a genuine insert failure re-drives the event — see decideNotificationDelivery).
//
// SAFETY: this never sends anything externally and never auto-acts — it only
// creates an in-app notification for the actor. A null actor → null (skip),
// because notifications.user_id is NOT NULL.
//
// CATEGORY CONTRACT: every rule's `category` is a NotificationCategory (mirrors the
// DB `notification_category` enum). An invalid literal is a COMPILE error here and
// a CI failure in the contract test — so the silent-drop bug (an invalid enum value
// throwing at INSERT, swallowed) can never recur.
// ============================================================================
import type { DomainEventLike } from "./subscriber";
import type { NotificationCategory } from "./notification-categories";

export type NotificationLevel = "info" | "success" | "warning" | "critical";

/** A ready-to-insert notifications row (entity FK column resolved by the processor). */
export interface NotificationProjection {
  org_id: string;
  user_id: string;
  level: NotificationLevel;
  category: NotificationCategory;
  title: string;
  href: string | null;
  entityType: string;   // buyer | seller | lead | property | deal | meeting | document
  entityId: string;     // used to fill the matching *_id FK column
}

/** category is a NotificationCategory → an invalid enum value cannot be authored. */
interface Rule { title: string; level: NotificationLevel; category: NotificationCategory; href: (id: string) => string | null }

// Only these types raise a notification. Everything else → timeline only.
//
// Every `category` below is a valid DB enum value (see NOTIFICATION_CATEGORIES).
// Deep-links point at the EXACT entity where a detail route exists (deals/[id],
// properties/[id], leads/[id]); meetings have no detail route, so the calendar is
// their canonical context. Titles are Hebrew, human-facing — never a raw enum/UUID.
export const NOTIFICATION_RULES: Record<string, Rule> = {
  // Lead — a brand-new lead: deep-link to that lead, not the generic list.
  "lead.created":      { title: "ליד חדש התקבל",       level: "info",    category: "new_lead",         href: (id) => `/leads/${id}` },
  // Deal outcomes — the notification bucket is deal_update; link to the exact deal.
  "deal.won":          { title: "עסקה נסגרה בהצלחה 🎉", level: "success", category: "deal_update",       href: (id) => `/deals/${id}` },
  "deal.lost":         { title: "עסקה אבדה",            level: "warning", category: "deal_update",       href: (id) => `/deals/${id}` },
  // A sale is a closed transaction (deal_update); the entity is the property.
  "property.sold":     { title: "נכס נמכר",             level: "success", category: "deal_update",       href: (id) => `/properties/${id}` },
  // Meetings have no detail route — the calendar is their canonical context.
  "meeting.no_show":   { title: "אי-הגעה לפגישה",       level: "warning", category: "meeting_reminder",  href: () => "/calendar" },
  "meeting.cancelled": { title: "פגישה בוטלה",          level: "info",    category: "meeting_reminder",  href: () => "/calendar" },
  // Documents — the signed/completed legal document; deep-link to that document.
  "document.signed":   { title: "מסמך נחתם",            level: "success", category: "document_pending",  href: (id) => `/legal-templates/${id}` },
  "document.completed":{ title: "מסמך הושלם",           level: "success", category: "document_pending",  href: (id) => `/legal-templates/${id}` },
};

/**
 * Project a domain event into a notification, or null to skip.
 * Deterministic: same input → same output.
 */
export function projectEventToNotification(evt: DomainEventLike): NotificationProjection | null {
  if (!evt.organization_id || !evt.entity_id || !evt.entity_type) return null;
  // No actor → nobody to notify (user_id is NOT NULL). Skip cleanly.
  if (!evt.actor_user_id) return null;
  const rule = NOTIFICATION_RULES[evt.event_type];
  if (!rule) return null;
  return {
    org_id: evt.organization_id,
    user_id: evt.actor_user_id,
    level: rule.level,
    category: rule.category,
    title: rule.title,
    href: rule.href(evt.entity_id),
    entityType: evt.entity_type,
    entityId: evt.entity_id,
  };
}

/** Map an entity type to its notifications FK column (or null if unmapped). */
export function notificationEntityColumn(entityType: string): string | null {
  switch (entityType) {
    case "buyer": return "buyer_id";
    case "seller": return "seller_id";
    case "lead": return "lead_id";
    case "property": return "property_id";
    case "deal": return "deal_id";
    case "meeting": return "meeting_id";
    default: return null;
  }
}

// ── Delivery decision (PURE) ────────────────────────────────────────────────
// The processor performs the INSERT; this function decides what the outcome MEANS.
// Extracted so the critical "do not swallow a real failure" rule is unit-testable
// without a live DB, and so the processor has exactly one place that classifies it.

export type NotificationDeliveryStatus = "done" | "duplicate" | "failed";

export interface NotificationDeliveryDecision {
  /** Delivery-ledger status to record for observability. */
  status: NotificationDeliveryStatus;
  /** Whether to count this as a delivered notification. */
  notified: boolean;
  /**
   * TRUE ⇒ the event must NOT be marked successfully consumed. The processor
   * re-drives it (retry_count++, then dead-letters at MAX_RETRIES) so a genuine
   * insert failure is retryable/observable — never silently lost.
   */
  hardFailure: boolean;
  /** The real reason, for the delivery ledger + logs (never swallowed). */
  reason: string | null;
}

/** A Postgres unique-violation on (org_id,event_id) — an idempotent no-op, NOT a failure. */
export function isDuplicateInsertError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "23505" || (err.message ?? "").toLowerCase().includes("duplicate key");
}

/**
 * Classify a notification INSERT result.
 *   null error        → done       (delivered)                    — not a failure
 *   duplicate (23505) → duplicate  (already delivered; idempotent) — not a failure
 *   any other error   → failed + hardFailure                      — re-drive the event
 *
 * The last branch is the fix: an invalid-enum / constraint / transient error is a
 * GENUINE failure. It is logged, recorded, and blocks the event from being marked
 * consumed — instead of being swallowed while the event is marked done.
 */
export function decideNotificationDelivery(insertError: { code?: string; message?: string } | null | undefined): NotificationDeliveryDecision {
  if (!insertError) return { status: "done", notified: true, hardFailure: false, reason: null };
  if (isDuplicateInsertError(insertError)) return { status: "duplicate", notified: false, hardFailure: false, reason: "duplicate" };
  return { status: "failed", notified: false, hardFailure: true, reason: insertError.message ?? "notification_insert_failed" };
}
