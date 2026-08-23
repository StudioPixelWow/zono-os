// ============================================================================
// ZONO — Buyer Command Center 5.1 closure: freshness model, next best action,
// event-driven recompute routing, and the new buyer-intent notifications.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/buyer-command-center-5-1.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveMatchFreshness, isNewSinceReview, FRESHNESS_LABEL_HE, FRESHNESS_TONE,
} from "../../src/lib/matching-intelligence/freshness.ts";
import { computeBuyerNextAction } from "../../src/lib/matching-intelligence/buyer-next-action.ts";
import { projectEventToMatchRecompute } from "../../src/lib/kernel/matching-subscriber.ts";
import { NOTIFICATION_RULES, projectEventToNotification } from "../../src/lib/kernel/notification-subscriber.ts";
import { isValidNotificationCategory } from "../../src/lib/kernel/notification-categories.ts";

const base = { matchStatus: "active", propertyAvailable: true, shortlistState: null, lastCalculatedAt: "2026-08-20T00:00:00Z", reviewedAt: null } as const;

// ── 1. Freshness derivation from REAL state only ────────────────────────────
test("never reviewed → NEW", () => {
  assert.equal(deriveMatchFreshness({ ...base, reviewedAt: null }), "NEW");
});
test("computed after last review → NEW; before → REVIEWED", () => {
  assert.equal(deriveMatchFreshness({ ...base, lastCalculatedAt: "2026-08-22T00:00:00Z", reviewedAt: "2026-08-21T00:00:00Z" }), "NEW");
  assert.equal(deriveMatchFreshness({ ...base, lastCalculatedAt: "2026-08-20T00:00:00Z", reviewedAt: "2026-08-21T00:00:00Z" }), "REVIEWED");
});
test("shortlist state dominates NEW/REVIEWED", () => {
  assert.equal(deriveMatchFreshness({ ...base, shortlistState: "selected" }), "SHORTLISTED");
  assert.equal(deriveMatchFreshness({ ...base, shortlistState: "sent" }), "SENT");
  assert.equal(deriveMatchFreshness({ ...base, shortlistState: "viewed" }), "VIEWED");
  assert.equal(deriveMatchFreshness({ ...base, shortlistState: "liked" }), "LIKED");
  assert.equal(deriveMatchFreshness({ ...base, shortlistState: "rejected" }), "REJECTED");
  assert.equal(deriveMatchFreshness({ ...base, shortlistState: "visit_requested" }), "VISIT_REQUESTED");
});
test("unavailable property / inactive match → INACTIVE (dominates everything)", () => {
  assert.equal(deriveMatchFreshness({ ...base, propertyAvailable: false, shortlistState: "liked" }), "INACTIVE");
  assert.equal(deriveMatchFreshness({ ...base, matchStatus: "inactive", shortlistState: "liked" }), "INACTIVE");
});
test("isNewSinceReview only true for the NEW state", () => {
  assert.equal(isNewSinceReview({ ...base, reviewedAt: null }), true);
  assert.equal(isNewSinceReview({ ...base, shortlistState: "liked" }), false);
});
test("every freshness state has a Hebrew label and a tone", () => {
  for (const f of ["NEW", "REVIEWED", "SHORTLISTED", "SENT", "VIEWED", "LIKED", "REJECTED", "VISIT_REQUESTED", "INACTIVE"] as const) {
    assert.ok(FRESHNESS_LABEL_HE[f] && /[֐-׿]/.test(FRESHNESS_LABEL_HE[f]), `no Hebrew label for ${f}`);
    assert.ok(FRESHNESS_TONE[f], `no tone for ${f}`);
  }
});

// ── 2. Next best action — one, evidence-backed, prioritised ─────────────────
const sig = { newMatches: 0, shortlisted: 0, sentAny: false, liked: 0, visitRequested: 0, hasUpcomingViewing: false };
test("no evidence → no action", () => {
  assert.equal(computeBuyerNextAction("קרן", sig), null);
});
test("visit requested + no viewing → schedule (highest priority)", () => {
  const a = computeBuyerNextAction("קרן", { ...sig, visitRequested: 1, liked: 2, newMatches: 5 });
  assert.equal(a?.key, "schedule_visit_requested");
  assert.match(a!.message, /קרן/);
});
test("liked + no viewing → schedule visit", () => {
  assert.equal(computeBuyerNextAction("קרן", { ...sig, liked: 2 })?.key, "schedule_liked");
});
test("liked but a viewing is already scheduled → not a schedule action", () => {
  assert.notEqual(computeBuyerNextAction("קרן", { ...sig, liked: 2, hasUpcomingViewing: true })?.key, "schedule_liked");
});
test("shortlisted, never sent → send selection", () => {
  assert.equal(computeBuyerNextAction("קרן", { ...sig, shortlisted: 3 })?.key, "send_selection");
});
test("only new matches → review", () => {
  const a = computeBuyerNextAction("קרן", { ...sig, newMatches: 4 });
  assert.equal(a?.key, "review_matches");
  assert.match(a!.message, /4 התאמות חדשות/);
});
test("next action is deterministic", () => {
  const s = { ...sig, newMatches: 4, shortlisted: 1 };
  assert.equal(JSON.stringify(computeBuyerNextAction("קרן", s)), JSON.stringify(computeBuyerNextAction("קרן", s)));
});

// ── 3. Event-driven recompute routing — BOUNDED, one entity ─────────────────
const ev = (event_type: string, entity_type: string, entity_id = "E1") => ({
  id: "D", event_type, entity_type, entity_id, occurred_at: "2026-08-23T00:00:00Z", organization_id: "ORG", actor_user_id: "U", payload: {},
});
test("buyer criteria events → recompute that ONE buyer", () => {
  for (const e of ["buyer.created", "buyer.updated", "buyer.stage_changed"]) {
    assert.deepEqual(projectEventToMatchRecompute(ev(e, "buyer", "B1")), { scope: "buyer", id: "B1", reason: e });
  }
});
test("property lifecycle events → recompute that ONE property", () => {
  for (const e of ["property.created", "property.updated", "property.price_changed", "property.status_changed", "property.published", "property.sold", "property.archived"]) {
    assert.deepEqual(projectEventToMatchRecompute(ev(e, "property", "P1")), { scope: "property", id: "P1", reason: e });
  }
});
test("unrelated events → no recompute (never an org-wide scan)", () => {
  assert.equal(projectEventToMatchRecompute(ev("deal.won", "deal")), null);
  assert.equal(projectEventToMatchRecompute(ev("buyer.archived", "buyer")), null); // not a criteria change
  assert.equal(projectEventToMatchRecompute(ev("meeting.created", "meeting")), null);
});
test("recompute routing is deterministic", () => {
  const e = ev("property.price_changed", "property", "P1");
  assert.equal(JSON.stringify(projectEventToMatchRecompute(e)), JSON.stringify(projectEventToMatchRecompute(e)));
});

// ── 4. New buyer-intent notifications — valid categories + buyer deep-link ───
test("the three buyer-intent rules exist with VALID categories", () => {
  for (const e of ["buyer.liked_property", "buyer.requested_viewing", "buyer.opened_portal"]) {
    const rule = NOTIFICATION_RULES[e];
    assert.ok(rule, `missing rule ${e}`);
    assert.equal(isValidNotificationCategory(rule.category), true, `${e} invalid category ${rule.category}`);
  }
});
test("buyer-intent notifications deep-link to the buyer page and route to the actor (owner)", () => {
  const n = projectEventToNotification({
    id: "E", event_type: "buyer.liked_property", entity_type: "buyer", entity_id: "B1",
    occurred_at: "2026-08-23T00:00:00Z", organization_id: "ORG", actor_user_id: "OWNER", payload: {},
  });
  assert.ok(n);
  assert.equal(n!.href, "/buyers/B1");
  assert.equal(n!.user_id, "OWNER");        // routed to the owner (the event actor)
  assert.match(n!.title, /[֐-׿]/);          // Hebrew
  assert.equal(isValidNotificationCategory(n!.category), true);
});
test("no owner (null actor) → no notification (never a null-user insert)", () => {
  const n = projectEventToNotification({
    id: "E", event_type: "buyer.opened_portal", entity_type: "buyer", entity_id: "B1",
    occurred_at: "2026-08-23T00:00:00Z", organization_id: "ORG", actor_user_id: null, payload: {},
  });
  assert.equal(n, null);
});
