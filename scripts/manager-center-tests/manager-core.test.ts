// ============================================================================
// ZONO — Manager/Owner Command Center core: deterministic proof (pure, mocks-free).
// Run: node --experimental-strip-types --test scripts/manager-center-tests/manager-core.test.ts
// Covers the pure-decidable matrix: no-exceptions, priority buckets, dedupe,
// deterministic ordering, summary counts, office-health dimensions, primary
// decision, aging, and the exception-type → group/priority/dimension mapping.
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildManagerCommandCenter, makeException, rankExceptions, dedupeExceptions, humanizeAging,
  EXCEPTION_META, type ManagerException, type ManagerExceptionType,
} from "../../src/lib/office/manager-core.ts";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
function ex(type: ManagerExceptionType, over: Partial<Parameters<typeof makeException>[0]> = {}): ManagerException {
  return makeException({ id: over.id ?? `${type}:1`, type, title: over.title ?? "x", subtitle: over.subtitle ?? "y", reason: over.reason ?? "z", route: "/", cta: "פתיחה", ...over });
}
function build(exceptions: ManagerException[], role: "manager" | "owner" = "manager") {
  return buildManagerCommandCenter({ exceptions, role, date: "2026-08-19" });
}

// ── A) no exceptions → quiet ─────────────────────────────────────────────────
test("A no exceptions → quiet, no decision, all health ok", () => {
  const c = build([]);
  assert.equal(c.quiet, true);
  assert.equal(c.nextDecision, null);
  assert.match(c.headline, /בשליטה/);
  assert.ok(c.health.every((h) => h.status === "ok"));
});

// ── B) one critical lead → P0 + primary decision ─────────────────────────────
test("B lead SLA breach → critical + nextDecision", () => {
  const c = build([ex("lead_sla_breach", { title: "דני כהן" })]);
  assert.equal(c.critical.length, 1);
  assert.equal(c.nextDecision?.type, "lead_sla_breach");
  assert.equal(c.health.find((h) => h.dimension === "customers")?.status, "critical");
});

// ── C) multiple unassigned leads counted ─────────────────────────────────────
test("C unassigned leads counted in summary", () => {
  const c = build([ex("lead_unassigned", { id: "l1", entityId: "l1" }), ex("lead_unassigned", { id: "l2", entityId: "l2" }), ex("lead_unassigned", { id: "l3", entityId: "l3" })]);
  assert.equal(c.summary.unassignedLeads, 3);
  assert.equal(c.attention.length, 3);
});

// ── E) stale deal ────────────────────────────────────────────────────────────
test("E stale deal → deals group + summary", () => {
  const c = build([ex("deal_stale", { entityId: "d1" })]);
  assert.equal(c.groups.deals.length, 1);
  assert.equal(c.summary.staleDeals, 1);
  assert.equal(c.health.find((h) => h.dimension === "deals")?.status, "attention");
});

// ── G) property not marketed ─────────────────────────────────────────────────
test("G property not marketed → properties dimension attention", () => {
  const c = build([ex("property_not_marketed", { entityId: "p1" })]);
  assert.equal(c.summary.propertiesNotMarketed, 1);
  assert.equal(c.health.find((h) => h.dimension === "properties")?.status, "attention");
});

// ── H) marketing plan awaiting approval counted ──────────────────────────────
test("H plan waiting approval → plansAwaiting", () => {
  const c = build([ex("marketing_plan_waiting_approval", { entityId: "p1", canPrepare: true })]);
  assert.equal(c.summary.plansAwaiting, 1);
});

// ── I) marketing partial failure is P0 critical ──────────────────────────────
test("I marketing_plan_failed is P0 critical", () => {
  const c = build([ex("marketing_plan_failed", { entityId: "p1" })]);
  assert.equal(c.critical.length, 1);
  assert.equal(c.health.find((h) => h.dimension === "marketing")?.status, "critical");
});

// ── M/N) publish failed P0, reconciliation P1 ────────────────────────────────
test("M+N publish failed critical, reconciliation attention", () => {
  const c = build([ex("publish_failed"), ex("publish_reconciliation")]);
  assert.equal(c.critical.filter((e) => e.type === "publish_failed").length, 1);
  assert.equal(c.attention.filter((e) => e.type === "publish_reconciliation").length, 1);
});

// ── O/P) support + billing are operations P0 ─────────────────────────────────
test("O+P support + billing → operations critical", () => {
  const c = build([ex("support_escalation"), ex("billing_action_required")]);
  assert.equal(c.groups.operations.length, 2);
  assert.equal(c.health.find((h) => h.dimension === "operations")?.status, "critical");
});

// ── Q) overloaded agent is P2 opportunity, not surveillance ──────────────────
test("Q agent_overloaded → P2 opportunities/team", () => {
  const c = build([ex("agent_overloaded", { title: "מאיר" })]);
  assert.equal(c.opportunities.length, 1);
  assert.equal(c.groups.team.length, 1);
  assert.equal(c.quiet, true); // no P0/P1 → office still "quiet" for decisions
});

// ── J) seller callback ───────────────────────────────────────────────────────
test("J seller callback → sellers group, customers dimension", () => {
  const c = build([ex("seller_callback", { title: "בעל הנכס · הרצל 18" })]);
  assert.equal(c.groups.sellers.length, 1);
  assert.equal(EXCEPTION_META.seller_callback.dimension, "customers");
});

// ── X) no duplicate exception represented twice ──────────────────────────────
test("X dedupe by type+entity", () => {
  const items = [ex("deal_stale", { id: "a", entityType: "deal", entityId: "d1" }), ex("deal_stale", { id: "b", entityType: "deal", entityId: "d1" })];
  assert.equal(dedupeExceptions(items).length, 1);
  const c = build(items);
  assert.equal(c.groups.deals.length, 1);
});

// ── W) deterministic same-state ordering ─────────────────────────────────────
test("W deterministic ordering: P0 before P1, urgency desc", () => {
  const items = [
    ex("deal_stale", { id: "a", entityId: "a", urgency: 40 }),
    ex("publish_failed", { id: "b", entityId: "b" }),
    ex("deal_stale", { id: "c", entityId: "c", urgency: 90 }),
  ];
  const r1 = rankExceptions(items).map((e) => e.id);
  const r2 = rankExceptions(items).map((e) => e.id);
  assert.deepEqual(r1, r2);
  assert.equal(r1[0], "b");                 // P0 first
  assert.deepEqual(r1.slice(1), ["c", "a"]); // then P1 by urgency desc
});

// ── priority override respected (high-value deal → P0) ───────────────────────
test("server priority override respected", () => {
  const c = build([ex("deal_stale", { priority: "P0", entityId: "big" })]);
  assert.equal(c.critical.length, 1);
});

// ── aging ────────────────────────────────────────────────────────────────────
test("aging labels are human + real", () => {
  assert.equal(humanizeAging(new Date(NOW - 5 * 3600_000).toISOString(), NOW), "ממתין 5 שעות");
  assert.equal(humanizeAging(new Date(NOW - 26 * 3600_000).toISOString(), NOW), "באיחור יום");
  assert.equal(humanizeAging(null, NOW), null);
});

// ── every exception type maps to a group + dimension ─────────────────────────
test("every exception type has group + dimension + priority meta", () => {
  for (const t of Object.keys(EXCEPTION_META) as ManagerExceptionType[]) {
    const m = EXCEPTION_META[t];
    assert.ok(m.group && m.dimension && m.defaultPriority);
  }
});

// ── R/personal-vs-office is a routing concern; here assert role passthrough ──
test("role passthrough (owner)", () => {
  assert.equal(build([], "owner").role, "owner");
});
