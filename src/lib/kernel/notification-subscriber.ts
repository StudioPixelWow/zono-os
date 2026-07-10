// ============================================================================
// 🔔 ZONO OS 2.0 — Stage 3 · Event Kernel · Notification subscriber (PURE).
// A SECOND consumer of the domain_events outbox (alongside the timeline). Turns
// a small set of HIGH-SIGNAL business events into a per-user notification. Most
// events produce no notification (they live in the timeline only) — this keeps
// the attention feed meaningful. Pure + deterministic; the processor writes the
// returned row to `notifications` (best-effort, secondary to the timeline).
//
// SAFETY: this never sends anything externally and never auto-acts — it only
// creates an in-app notification for the actor. A null actor → null (skip),
// because notifications.user_id is NOT NULL.
// ============================================================================
import type { DomainEventLike } from "./subscriber";

export type NotificationLevel = "info" | "success" | "warning" | "critical";

/** A ready-to-insert notifications row (entity FK column resolved by the processor). */
export interface NotificationProjection {
  org_id: string;
  user_id: string;
  level: NotificationLevel;
  category: string;
  title: string;
  href: string | null;
  entityType: string;   // buyer | seller | lead | property | deal | meeting | document
  entityId: string;     // used to fill the matching *_id FK column
}

interface Rule { title: string; level: NotificationLevel; category: string; href: (id: string) => string | null }

// Only these types raise a notification. Everything else → timeline only.
const RULES: Record<string, Rule> = {
  "lead.created":      { title: "ליד חדש התקבל", level: "info",     category: "new_lead", href: () => "/leads" },
  "deal.won":          { title: "עסקה נסגרה בהצלחה 🎉", level: "success",  category: "deal",     href: () => "/deals" },
  "deal.lost":         { title: "עסקה אבדה", level: "warning",  category: "deal",     href: () => "/deals" },
  "property.sold":     { title: "נכס נמכר", level: "success",  category: "property", href: (id) => `/properties/${id}` },
  "meeting.no_show":   { title: "אי-הגעה לפגישה", level: "warning",  category: "meeting",  href: () => "/calendar" },
  "meeting.cancelled": { title: "פגישה בוטלה", level: "info",     category: "meeting",  href: () => "/calendar" },
  "document.signed":   { title: "מסמך נחתם", level: "success",  category: "document", href: () => "/legal-templates" },
  "document.completed":{ title: "מסמך הושלם", level: "success",  category: "document", href: () => "/legal-templates" },
};

/**
 * Project a domain event into a notification, or null to skip.
 * Deterministic: same input → same output.
 */
export function projectEventToNotification(evt: DomainEventLike): NotificationProjection | null {
  if (!evt.organization_id || !evt.entity_id || !evt.entity_type) return null;
  // No actor → nobody to notify (user_id is NOT NULL). Skip cleanly.
  if (!evt.actor_user_id) return null;
  const rule = RULES[evt.event_type];
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
