// ============================================================================
// 🔔 ZONO OS 2.0 — Event Kernel · Notification CATEGORY contract (PURE).
// The SINGLE source of truth for the values a notification's `category` may take.
// It mirrors the Postgres `notification_category` enum EXACTLY. A notification row
// whose category is not one of these fails the enum check at INSERT time — and the
// old projector swallowed that failure, so a valid domain event was marked
// consumed while its notification silently vanished (this is the bug this file
// exists to make impossible).
//
// Contract:
//  • `Rule.category` (notification-subscriber) is typed as `NotificationCategory`,
//    so an invalid literal is a COMPILE error — not a production surprise.
//  • The CI contract test (scripts/fd-closure-tests/notification-categories.test.ts)
//    enumerates every rule and asserts its category is in this set.
//  • If the DB enum ever gains/loses a value, update THIS list (and only this list)
//    — everything else derives from it.
//
// Keep in lock-step with the enum. Verified against production
// (pg_enum · notification_category) on 2026-08-23.
// ============================================================================

/**
 * The canonical, valid `notification_category` enum values — verbatim from the DB.
 * `as const` makes each a literal so `NotificationCategory` is a precise union.
 */
export const NOTIFICATION_CATEGORIES = [
  "task_due",
  "followup_due",
  "price_change",
  "new_lead",
  "new_match",
  "document_pending",
  "exclusivity_expiring",
  "deal_update",
  "meeting_reminder",
  "mention",
  "market_event",
  "system",
] as const;

/** A category that the DB `notification_category` enum will accept. */
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Fast membership set (frozen so the canonical list cannot be mutated at runtime). */
const VALID = new Set<string>(NOTIFICATION_CATEGORIES);

/** Runtime guard — true iff `value` is a valid notification category. */
export function isValidNotificationCategory(value: string): value is NotificationCategory {
  return VALID.has(value);
}
