// ============================================================================
// ZONO — Notification CATEGORY INTEGRITY closure.
// A live production E2E proved a systemic defect: a domain event could be marked
// PROCESSED while its notification silently vanished, because the rule used a
// `category` string that is not a valid `notification_category` enum value — the
// INSERT threw and the error was swallowed. This suite is the regression fence:
//
//   1. EVERY notification rule's category is in the canonical valid set. An
//      invalid category (the exact shape of the original bug) fails CI here.
//   2. The delivery decision NEVER swallows a genuine insert failure: a
//      non-duplicate error is a hardFailure (event re-driven), a duplicate is an
//      idempotent no-op (safe), success is delivered once.
//   3. Deep-links resolve to the exact entity where a detail route exists.
//   4. Titles are Hebrew and carry no raw enum/UUID/internal term.
//
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/notification-category-integrity.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFICATION_CATEGORIES,
  isValidNotificationCategory,
} from "../../src/lib/kernel/notification-categories.ts";
import {
  NOTIFICATION_RULES,
  projectEventToNotification,
  decideNotificationDelivery,
  isDuplicateInsertError,
} from "../../src/lib/kernel/notification-subscriber.ts";

// The exact set the DB `notification_category` enum accepts (verified on prod
// 2026-08-23). If the enum changes, THIS must change in lock-step — that is the
// point of pinning it independently of the contract module.
const DB_ENUM = [
  "task_due", "followup_due", "price_change", "new_lead", "new_match",
  "document_pending", "exclusivity_expiring", "deal_update", "meeting_reminder",
  "mention", "market_event", "system",
];

// ── 1. Canonical contract mirrors the DB enum exactly ───────────────────────
test("canonical categories mirror the DB enum exactly (no drift)", () => {
  assert.deepEqual([...NOTIFICATION_CATEGORIES].sort(), [...DB_ENUM].sort());
});

test("isValidNotificationCategory accepts every canonical value", () => {
  for (const c of NOTIFICATION_CATEGORIES) assert.equal(isValidNotificationCategory(c), true, c);
});

test("isValidNotificationCategory rejects the invalid values that caused the bug", () => {
  for (const bad of ["deal", "property", "meeting", "document", "", "DEAL_UPDATE"]) {
    assert.equal(isValidNotificationCategory(bad), false, bad);
  }
});

// ── 2. THE FENCE: every rule's category is valid ────────────────────────────
test("EVERY notification rule uses a valid category (no silent-drop possible)", () => {
  const offenders: string[] = [];
  for (const [event, rule] of Object.entries(NOTIFICATION_RULES)) {
    if (!isValidNotificationCategory(rule.category)) offenders.push(`${event} → "${rule.category}"`);
  }
  assert.deepEqual(offenders, [], `invalid categories: ${offenders.join(", ")}`);
});

test("the previously-broken rules are present and now valid", () => {
  for (const event of ["deal.won", "deal.lost", "property.sold", "meeting.no_show", "meeting.cancelled", "document.signed", "document.completed"]) {
    const rule = NOTIFICATION_RULES[event];
    assert.ok(rule, `rule missing: ${event}`);
    assert.equal(isValidNotificationCategory(rule.category), true, `${event} category invalid`);
  }
});

test("specific category assignments match the intended semantics", () => {
  assert.equal(NOTIFICATION_RULES["deal.won"].category, "deal_update");
  assert.equal(NOTIFICATION_RULES["deal.lost"].category, "deal_update");
  assert.equal(NOTIFICATION_RULES["property.sold"].category, "deal_update");
  assert.equal(NOTIFICATION_RULES["meeting.no_show"].category, "meeting_reminder");
  assert.equal(NOTIFICATION_RULES["meeting.cancelled"].category, "meeting_reminder");
  assert.equal(NOTIFICATION_RULES["document.signed"].category, "document_pending");
  assert.equal(NOTIFICATION_RULES["document.completed"].category, "document_pending");
  assert.equal(NOTIFICATION_RULES["lead.created"].category, "new_lead");
});

// ── 3. Delivery decision does NOT swallow genuine failures ──────────────────
test("success → delivered once, not a failure", () => {
  const d = decideNotificationDelivery(null);
  assert.deepEqual(d, { status: "done", notified: true, hardFailure: false, reason: null });
});

test("duplicate (23505) → idempotent no-op, NOT a hard failure", () => {
  const d = decideNotificationDelivery({ code: "23505", message: "duplicate key value violates unique constraint" });
  assert.equal(d.status, "duplicate");
  assert.equal(d.hardFailure, false);
  assert.equal(d.notified, false);
});

test("duplicate detected by message text too (no code)", () => {
  assert.equal(isDuplicateInsertError({ message: "duplicate key value" }), true);
  assert.equal(isDuplicateInsertError({ code: "23505" }), true);
  assert.equal(isDuplicateInsertError(null), false);
  assert.equal(isDuplicateInsertError({ code: "22P02" }), false);
});

test("invalid-enum error (the original bug) → hardFailure, event must re-drive", () => {
  const d = decideNotificationDelivery({ code: "22P02", message: 'invalid input value for enum notification_category: "deal"' });
  assert.equal(d.status, "failed");
  assert.equal(d.hardFailure, true);   // ← NOT swallowed
  assert.equal(d.notified, false);
  assert.match(d.reason ?? "", /notification_category/);
});

test("any other genuine insert error → hardFailure (retryable/observable)", () => {
  for (const err of [{ code: "23514", message: "check constraint" }, { code: "23502", message: "null value" }, { message: "connection reset" }]) {
    const d = decideNotificationDelivery(err);
    assert.equal(d.hardFailure, true, JSON.stringify(err));
    assert.equal(d.status, "failed");
    assert.ok(d.reason && d.reason.length > 0);
  }
});

// ── 4. Deep-links resolve to the exact entity / context ─────────────────────
test("deep-links point at the exact entity where a detail route exists", () => {
  const proj = (event: string, entityType: string, id: string) =>
    projectEventToNotification({
      id: "E", event_type: event, entity_type: entityType, entity_id: id,
      occurred_at: "2026-08-23T00:00:00Z", organization_id: "ORG", actor_user_id: "U", payload: {},
    });
  assert.equal(proj("deal.won", "deal", "D1")?.href, "/deals/D1");
  assert.equal(proj("deal.lost", "deal", "D1")?.href, "/deals/D1");
  assert.equal(proj("property.sold", "property", "P1")?.href, "/properties/P1");
  assert.equal(proj("lead.created", "lead", "L1")?.href, "/leads/L1");
  assert.equal(proj("document.signed", "document", "DOC1")?.href, "/legal-templates/DOC1");
  // Meetings have no detail route → calendar is the canonical context (not generic-list wrong).
  assert.equal(proj("meeting.no_show", "meeting", "M1")?.href, "/calendar");
  assert.equal(proj("meeting.cancelled", "meeting", "M1")?.href, "/calendar");
});

// ── 5. Hebrew-only, no raw enum/UUID/internal term in user-facing copy ──────
test("every rule title is Hebrew and free of raw enum/UUID/internal terms", () => {
  const HEBREW = /[֐-׿]/;
  const FORBIDDEN = /\b(deal|property|meeting|document|document_pending|deal_update|meeting_reminder|new_lead|uuid|null)\b/i;
  for (const [event, rule] of Object.entries(NOTIFICATION_RULES)) {
    assert.match(rule.title, HEBREW, `${event} title not Hebrew: ${rule.title}`);
    assert.doesNotMatch(rule.title, FORBIDDEN, `${event} title leaks internal term: ${rule.title}`);
    assert.doesNotMatch(rule.title, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i, `${event} title leaks a UUID`);
  }
});

// ── 6. Guards that make the projector safe ──────────────────────────────────
test("no actor → no notification (user_id is NOT NULL)", () => {
  const n = projectEventToNotification({
    id: "E", event_type: "deal.won", entity_type: "deal", entity_id: "D1",
    occurred_at: "2026-08-23T00:00:00Z", organization_id: "ORG", actor_user_id: null, payload: {},
  });
  assert.equal(n, null);
});

test("unmapped / low-signal event → no notification (timeline only)", () => {
  const n = projectEventToNotification({
    id: "E", event_type: "buyer.updated", entity_type: "buyer", entity_id: "B1",
    occurred_at: "2026-08-23T00:00:00Z", organization_id: "ORG", actor_user_id: "U", payload: {},
  });
  assert.equal(n, null);
});

test("projector is deterministic", () => {
  const ev = {
    id: "E", event_type: "deal.won", entity_type: "deal", entity_id: "D1",
    occurred_at: "2026-08-23T00:00:00Z", organization_id: "ORG", actor_user_id: "U", payload: {},
  };
  assert.equal(JSON.stringify(projectEventToNotification(ev)), JSON.stringify(projectEventToNotification(ev)));
});
