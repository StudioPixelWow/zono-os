// ============================================================================
// ZONO — Functional Defects Closure: notification cross-source collapse (D11/D12).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/notification-collapse.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseNotifications, type CollapsibleNotif } from "../../src/lib/notifications/collapse.ts";

const item = (over: Partial<CollapsibleNotif> & { key: string }): CollapsibleNotif => ({
  category: "opportunity", score: 50, read: false, pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z", entityType: null, entityId: null, ...over,
});

test("P: same entity+category from 3 sources → ONE row (highest-priority source, max score, unread-if-any)", () => {
  const out = collapseNotifications([
    item({ key: "opp:1", entityType: "property", entityId: "P1", category: "opportunity", score: 60, read: true }),
    item({ key: "radar:2", entityType: "property", entityId: "P1", category: "opportunity", score: 80, read: false }),
    item({ key: "notif:3", entityType: "property", entityId: "P1", category: "opportunity", score: 40, read: true }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "notif:3"); // kernel (rank 5) wins
  assert.equal(out[0].score, 80);      // max across sources
  assert.equal(out[0].read, false);    // unread if ANY contributor unread
});

test("Q: distinct CATEGORIES on the same entity stay distinct", () => {
  const out = collapseNotifications([
    item({ key: "opp:1", entityType: "property", entityId: "P1", category: "opportunity" }),
    item({ key: "attention:2", entityType: "property", entityId: "P1", category: "warning" }),
  ]);
  assert.equal(out.length, 2);
});

test("Q: same category on DIFFERENT entities stay distinct", () => {
  const out = collapseNotifications([
    item({ key: "opp:1", entityType: "property", entityId: "P1", category: "opportunity" }),
    item({ key: "opp:2", entityType: "property", entityId: "P2", category: "opportunity" }),
  ]);
  assert.equal(out.length, 2);
});

test("entity-less rows (forecast/competitor) never collapse", () => {
  const out = collapseNotifications([
    item({ key: "fc:1", category: "opportunity", entityId: null }),
    item({ key: "comp:2", category: "warning", entityId: null }),
    item({ key: "fc:3", category: "opportunity", entityId: null }),
  ]);
  assert.equal(out.length, 3);
});

test("pinned survives a collapse even if the winner was not pinned", () => {
  const out = collapseNotifications([
    item({ key: "opp:1", entityType: "buyer", entityId: "B1", category: "opportunity", pinned: true, read: true }),
    item({ key: "notif:2", entityType: "buyer", entityId: "B1", category: "opportunity", pinned: false, read: true }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].pinned, true);
});

test("order is stable — first occurrence keeps its slot", () => {
  const out = collapseNotifications([
    item({ key: "attention:1", entityType: "deal", entityId: "D1", category: "warning" }),
    item({ key: "opp:2", entityType: "deal", entityId: "D2", category: "opportunity" }),
    item({ key: "notif:3", entityType: "deal", entityId: "D1", category: "warning" }),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].entityId, "D1"); // D1 slot retained at index 0
  assert.equal(out[0].key, "notif:3"); // but the higher-rank source is the survivor
  assert.equal(out[1].entityId, "D2");
});
