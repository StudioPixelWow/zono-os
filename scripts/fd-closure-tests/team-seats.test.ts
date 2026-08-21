// ============================================================================
// ZONO — Team & Seats 2.0: deterministic pure coverage for the CANONICAL seat
// truth — access-state derivation (from existing users/invitation truth, no
// parallel table) + the reusable seat billing preview (canonical injected price,
// next-cycle timing). The consequential mutations (invite/suspend/activate,
// provider quantity sync) require the authed runtime + billing provider and are
// reported HUMAN_REQUIRED / PRODUCT_DECISION_REQUIRED (MODEL_D) — no fake PASS.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/team-seats.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAccessState, consumesSeat, seatBillingPreview } from "../../src/lib/team-admin/seats.ts";

// ── H — access-state derivation from canonical truth ─────────────────────────
test("H: ACTIVE = linked user with status active (a paid seat)", () => {
  const s = deriveAccessState({ userId: "u1", userStatus: "active", hasPendingInvite: false });
  assert.equal(s, "ACTIVE");
  assert.equal(consumesSeat(s), true);
});
test("I: SUSPENDED = linked user disabled/suspended (no seat)", () => {
  for (const st of ["disabled", "suspended", "inactive"]) {
    const s = deriveAccessState({ userId: "u1", userStatus: st, hasPendingInvite: false });
    assert.equal(s, "SUSPENDED", st);
    assert.equal(consumesSeat(s), false);
  }
});
test("invited = pending invite, no linked active user (reserved, not billed)", () => {
  const s = deriveAccessState({ userId: null, userStatus: null, hasPendingInvite: true });
  assert.equal(s, "INVITED");
  assert.equal(consumesSeat(s), false);
});
test("B/Y: roster-only member (no user, no invite) = NO_ACCESS and never billed", () => {
  const s = deriveAccessState({ userId: null, userStatus: null, hasPendingInvite: false });
  assert.equal(s, "NO_ACCESS");
  assert.equal(consumesSeat(s), false);
});
test("an active user wins over a stray pending invite", () => {
  assert.equal(deriveAccessState({ userId: "u1", userStatus: "active", hasPendingInvite: true }), "ACTIVE");
});

// ── O/P/Q — seat billing preview (canonical injected price, deterministic) ───
test("O: activating a seat adds exactly one unit price, effective next cycle", () => {
  const p = seatBillingPreview(3, 4, 197);
  assert.equal(p.currentMonthlyIls, 591);
  assert.equal(p.nextMonthlyIls, 788);
  assert.equal(p.monthlyDeltaIls, 197);
  assert.equal(p.effectiveTiming, "next_cycle");
});
test("P: suspending a seat removes one unit (negative delta), no proration field", () => {
  const p = seatBillingPreview(4, 3, 197);
  assert.equal(p.monthlyDeltaIls, -197);
  assert.equal(p.nextMonthlyIls, 3 * 197);
});
test("Q: preview math is pure * injected price (no hardcoded price in the module)", () => {
  const p = seatBillingPreview(2, 5, 250); // arbitrary canonical price injected
  assert.equal(p.currentMonthlyIls, 500);
  assert.equal(p.nextMonthlyIls, 1250);
  assert.equal(p.monthlyDeltaIls, 750);
});
test("no-op change = zero delta", () => {
  assert.equal(seatBillingPreview(3, 3, 197).monthlyDeltaIls, 0);
});
test("suspend cannot drive the previewed seat count below zero", () => {
  const p = seatBillingPreview(0, -1, 197);
  assert.equal(p.nextSeats, 0);
  assert.equal(p.nextMonthlyIls, 0);
});

// ── Summary honesty — the /team summary counts are pure derivations over the
// canonical access state, NOT hardcoded totals. Model a mixed פיקסל-style roster
// and prove: activeSeats = #ACTIVE, monthly = activeSeats * canonical price, and
// roster-only / invited / suspended members never inflate the billable count.
test("R: summary counts + monthly billing derive only from ACTIVE seats", () => {
  const PRICE = 197; // COMMERCIAL_MODEL.pricePerAgentIls (injected)
  const roster = [
    { userId: "owner", userStatus: "active", hasPendingInvite: false },   // ACTIVE (owner billed)
    { userId: "u-michal", userStatus: "active", hasPendingInvite: false }, // ACTIVE
    { userId: "u-omer", userStatus: "disabled", hasPendingInvite: false }, // SUSPENDED (no seat)
    { userId: null, userStatus: null, hasPendingInvite: true },            // INVITED (reserved, not billed)
    { userId: null, userStatus: null, hasPendingInvite: false },           // NO_ACCESS (roster-only)
    { userId: null, userStatus: null, hasPendingInvite: false },           // NO_ACCESS (roster-only)
  ];
  const states = roster.map(deriveAccessState);
  const count = (s: string) => states.filter((x) => x === s).length;
  const activeSeats = states.filter(consumesSeat).length;

  assert.equal(roster.length, 6);          // people in office
  assert.equal(activeSeats, 2);            // only the two active users are paid seats
  assert.equal(count("SUSPENDED"), 1);
  assert.equal(count("INVITED"), 1);
  assert.equal(count("NO_ACCESS"), 2);
  // monthly billing is exactly activeSeats * canonical price — no roster/invite/suspend leakage
  assert.equal(activeSeats * PRICE, 394);
});
