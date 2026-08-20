// ============================================================================
// ZONO — Functional Defects Closure: support detail canonical primary next action.
// primaryNextAction is deterministic and derives ONLY from status + assignment
// (no new state, no migration). This proves the "who is this blocked on / what to
// do next" signal shown on the ticket detail page.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/support-next-action.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { primaryNextAction } from "../../src/lib/platform-admin/support/model.ts";

test("waiting_customer → blocked on customer", () => {
  const r = primaryNextAction({ status: "waiting_customer", assigned_operator_id: "op1" });
  assert.equal(r.blockedOn, "customer");
});

test("open + unassigned → blocked on us (needs assignment)", () => {
  const r = primaryNextAction({ status: "open", assigned_operator_id: null });
  assert.equal(r.blockedOn, "us");
  assert.match(r.label, /לשייך/);
});

test("open + assigned → blocked on us (respond)", () => {
  const r = primaryNextAction({ status: "open", assigned_operator_id: "op1" });
  assert.equal(r.blockedOn, "us");
  assert.match(r.label, /לענות/);
});

test("in_progress → blocked on us", () => {
  assert.equal(primaryNextAction({ status: "in_progress", assigned_operator_id: "op1" }).blockedOn, "us");
});

test("resolved and closed → no action needed", () => {
  assert.equal(primaryNextAction({ status: "resolved", assigned_operator_id: "op1" }).blockedOn, "none");
  assert.equal(primaryNextAction({ status: "closed", assigned_operator_id: null }).blockedOn, "none");
});

test("every status yields a non-empty label and a valid tone", () => {
  const tones = new Set(["brand", "warning", "neutral", "success"]);
  for (const status of ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const) {
    const r = primaryNextAction({ status, assigned_operator_id: null });
    assert.ok(r.label.length > 0);
    assert.ok(tones.has(r.tone));
  }
});
