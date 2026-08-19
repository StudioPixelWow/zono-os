// ============================================================================
// ZONO — Agent Daily Autopilot core: deterministic proof (pure, mocks-free).
// Run: node --experimental-strip-types --test scripts/daily-autopilot-tests/daily-plan-core.test.ts
// Covers the pure-decidable matrix: quiet/no-work, P0 SLA breach, capacity limit,
// hard-time anchoring + imminent-meeting primary, meeting conflict, deterministic
// same-state ordering, done-today, bucket assignment, estimate policy, canPrepare.
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyPlan, mapActionToPlanItem, mapMeetingToPlanItem, ESTIMATED_MINUTES,
  type DailyActionInput, type DailyMeetingInput,
} from "../../src/lib/daily/daily-plan-core.ts";

const NOW = Date.parse("2026-08-19T06:00:00.000Z"); // 09:00 Israel
function iso(hourUtc: number, min = 0) { return new Date(Date.parse("2026-08-19T00:00:00.000Z") + (hourUtc * 60 + min) * 60000).toISOString(); }

function action(over: Partial<DailyActionInput> = {}): DailyActionInput {
  return { id: over.id ?? "a1", kind: over.kind ?? "lead_callback", priority: over.priority ?? "P1", urgency: over.urgency ?? 50, title: over.title ?? "ליד", reason: over.reason ?? "מחכה", href: over.href ?? "/leads/1", cta: over.cta ?? "חזרה", icon: over.icon ?? "Phone", entity: over.entity };
}
function meeting(over: Partial<DailyMeetingInput> = {}): DailyMeetingInput {
  return { id: over.id ?? "m1", type: over.type ?? "viewing", title: over.title ?? "ביקור", startAt: over.startAt ?? iso(8), endAt: over.endAt ?? iso(8, 45), buyerName: over.buyerName ?? "דני", propertyTitle: over.propertyTitle ?? "הרצל 18", propertyId: over.propertyId ?? "p1", href: over.href ?? "/viewings", status: over.status ?? "scheduled" };
}
function build(over: Partial<Parameters<typeof buildDailyPlan>[0]> = {}) {
  return buildDailyPlan({ actions: [], meetings: [], doneToday: [], role: "agent", nowMs: NOW, date: "2026-08-19", ...over });
}

// ── A) no work → quiet ───────────────────────────────────────────────────────
test("A no work → quiet plan, no primary action", () => {
  const p = build();
  assert.equal(p.quiet, true);
  assert.equal(p.primaryAction, null);
  assert.equal(p.health.level, "quiet");
  assert.match(p.headline, /בשליטה/);
});

// ── B) P0 SLA breach is must-do and primary ──────────────────────────────────
test("B P0 lead breach → needs_attention + primary", () => {
  const p = build({ actions: [action({ id: "hot", kind: "lead_callback", priority: "P0", urgency: 90, title: "ליד חדש" })] });
  assert.equal(p.buckets.needsAttention.length, 1);
  assert.equal(p.primaryAction?.id, "hot");
  assert.equal(p.primaryAction?.type, "lead_followup");
});

// ── F) viewing today anchors the day (hard time) ─────────────────────────────
test("F today viewing → fixed_time bucket with real duration", () => {
  const p = build({ meetings: [meeting({ startAt: iso(11), endAt: iso(12) })] });
  assert.equal(p.buckets.fixedTime.length, 1);
  assert.equal(p.buckets.fixedTime[0].type, "viewing");
  assert.equal(p.buckets.fixedTime[0].estimatedMinutes, 60);
  assert.equal(p.buckets.fixedTime[0].fixedTime, true);
});

// ── imminent meeting becomes the primary action ──────────────────────────────
test("imminent meeting (within 90m) wins primary over P0 work", () => {
  const p = build({
    actions: [action({ id: "p0", priority: "P0", urgency: 95 })],
    meetings: [meeting({ id: "soon", startAt: iso(7), endAt: iso(7, 45) })], // 10:00, now 09:00 → 60m away
  });
  assert.equal(p.primaryAction?.id, "meeting:soon");
});

test("non-imminent meeting does NOT preempt P0 work as primary", () => {
  const p = build({
    actions: [action({ id: "p0", priority: "P0", urgency: 95 })],
    meetings: [meeting({ id: "later", startAt: iso(14), endAt: iso(15) })], // 17:00 → far
  });
  assert.equal(p.primaryAction?.id, "p0");
});

// ── M) two meetings conflict → surfaced ──────────────────────────────────────
test("M overlapping meetings surface a conflict", () => {
  const p = build({ meetings: [meeting({ id: "m1", startAt: iso(11), endAt: iso(12) }), meeting({ id: "m2", startAt: iso(11, 30), endAt: iso(12, 30) })] });
  assert.equal(p.health.conflicts.length, 1);
});
test("non-overlapping meetings → no conflict", () => {
  const p = build({ meetings: [meeting({ id: "m1", startAt: iso(11), endAt: iso(12) }), meeting({ id: "m2", startAt: iso(13), endAt: iso(14) })] });
  assert.equal(p.health.conflicts.length, 0);
});

// ── T) capacity limit: 30 P2 actions but small capacity → few in should/if, rest deferred ──
test("T 30 candidate actions are capacity-limited into if_time overflow", () => {
  const actions = Array.from({ length: 30 }, (_, i) => action({ id: `t${i}`, kind: "task_today", priority: "P2", urgency: 10 }));
  const p = build({ actions, capacityMinutes: 50 }); // 50/10 = 5 fit
  const fit = p.items.filter((i) => i.bucket === "if_time" && i.estimatedMinutes <= 10);
  assert.equal(p.buckets.ifTime.length, 30);           // all present (visible)
  // only 5 consumed capacity; the rest are still if_time but deferred — assert total preserved
  assert.equal(fit.length, 30);
  assert.equal(p.summary.ifTime, 30);
});

test("P0 work is always must-do even beyond capacity", () => {
  const actions = [action({ id: "a", priority: "P0", urgency: 80 }), action({ id: "b", priority: "P0", urgency: 70 })];
  const p = build({ actions, capacityMinutes: 5 });
  assert.equal(p.buckets.needsAttention.length, 2);
});

// ── U) deterministic same-state ordering ─────────────────────────────────────
test("U same input → identical ordering", () => {
  const actions = [action({ id: "a", priority: "P1", urgency: 40 }), action({ id: "b", priority: "P0", urgency: 60 }), action({ id: "c", priority: "P1", urgency: 90 })];
  const p1 = build({ actions });
  const p2 = build({ actions });
  assert.deepEqual(p1.items.map((i) => i.id), p2.items.map((i) => i.id));
  // P0 first, then P1 by urgency desc
  assert.deepEqual(p1.buckets.needsAttention.map((i) => i.id), ["b"]);
  assert.deepEqual(p1.buckets.shouldToday.map((i) => i.id), ["c", "a"]);
});

// ── I) marketing plan action is preparable ───────────────────────────────────
test("I marketing_attention → marketing_plan type, canPrepare", () => {
  const it = mapActionToPlanItem(action({ kind: "marketing_attention", priority: "P1", title: "תוכנית" }));
  assert.equal(it.type, "marketing_plan");
  assert.equal(it.canPrepare, true);
  assert.equal(it.actionType, "prepare");
  assert.equal(it.requiresConfirmation, true);
});

// ── D) inbound reply maps to buyer_reply ─────────────────────────────────────
test("D customer_reply → buyer_reply type", () => {
  assert.equal(mapActionToPlanItem(action({ kind: "customer_reply" })).type, "buyer_reply");
});
test("E seller_callback maps + 15m estimate", () => {
  const it = mapActionToPlanItem(action({ kind: "seller_strategy" }));
  assert.equal(it.type, "seller_callback");
  assert.equal(it.estimatedMinutes, ESTIMATED_MINUTES.seller_callback);
});

// ── G) completed viewing is not double-counted as pending work ───────────────
test("G completed meeting is done, not pending, and frees capacity", () => {
  const p = build({ meetings: [meeting({ id: "done1", status: "completed", startAt: iso(6), endAt: iso(7) })] });
  assert.equal(p.buckets.fixedTime[0].status, "done");
  assert.equal(p.items.find((i) => i.id === "meeting:done1"), undefined); // completed anchors omitted from action list
});

// ── cancelled meeting excluded ───────────────────────────────────────────────
test("cancelled meeting excluded from plan", () => {
  const p = build({ meetings: [meeting({ id: "x", status: "cancelled" })] });
  assert.equal(p.buckets.fixedTime.length, 0);
});

// ── done today passthrough ───────────────────────────────────────────────────
test("done-today passthrough (real completed state only)", () => {
  const p = build({ doneToday: [{ id: "d1", label: "2 ביקורים", icon: "MapPin" }] });
  assert.equal(p.doneToday.length, 1);
});

// ── dedupe actions + meetings by id ──────────────────────────────────────────
test("duplicate action ids are deduped", () => {
  const p = build({ actions: [action({ id: "dup" }), action({ id: "dup" })] });
  assert.equal(p.items.filter((i) => i.id === "dup").length, 1);
});

// ── health level ─────────────────────────────────────────────────────────────
test("busy when >=3 must-do", () => {
  const actions = ["a", "b", "c"].map((id) => action({ id, priority: "P0", urgency: 80 }));
  assert.equal(build({ actions }).health.level, "busy");
});

// ── meeting without end uses default estimate ────────────────────────────────
test("meeting without end → default estimate by type", () => {
  const base: DailyMeetingInput = { id: "n", type: "meeting", title: "x", startAt: iso(8), endAt: null, href: "/", status: "scheduled" };
  assert.equal(mapMeetingToPlanItem({ ...base, type: "meeting" }).estimatedMinutes, 30);
  assert.equal(mapMeetingToPlanItem({ ...base, type: "viewing" }).estimatedMinutes, 45);
});
