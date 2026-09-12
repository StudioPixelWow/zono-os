import { test } from "node:test";
import assert from "node:assert/strict";
import { isOrgEnforced, paymentGateDecision, isPathAllowedWhenUnpaid, billingEnforcementCutoff } from "../../src/lib/commercial/access-gate-core.ts";

const CUTOFF = Date.parse("2026-09-01T00:00:00Z");

test("enforcement OFF when no cutoff env → no org enforced (safe default)", () => {
  assert.equal(billingEnforcementCutoff(""), null);
  assert.equal(isOrgEnforced("2027-01-01T00:00:00Z", null), false);
});
test("orgs created AFTER the cutoff are enforced; BEFORE are grandfathered", () => {
  assert.equal(isOrgEnforced("2026-09-15T00:00:00Z", CUTOFF), true);
  assert.equal(isOrgEnforced("2026-08-15T00:00:00Z", CUTOFF), false);
});
test("unknown org age is never enforced (never lock out)", () => {
  assert.equal(isOrgEnforced(null, CUTOFF), false);
});
test("gate blocks only enforced + unpaid", () => {
  assert.equal(paymentGateDecision(true, false).blocked, true);   // enforced, unpaid → blocked
  assert.equal(paymentGateDecision(true, true).blocked, false);   // enforced, paid → allowed
  assert.equal(paymentGateDecision(false, false).blocked, false); // grandfathered → allowed
});
test("unpaid user may reach billing / account / pay / support / logout", () => {
  for (const p of ["/payment-required", "/settings/plan", "/settings/billing", "/account", "/billing/status", "/logout", "/support"]) {
    assert.equal(isPathAllowedWhenUnpaid(p), true, p);
  }
});
test("unpaid user is blocked from the product surfaces", () => {
  for (const p of ["/today/plan", "/claim", "/properties", "/leads", "/market-intelligence/map", "/automation"]) {
    assert.equal(isPathAllowedWhenUnpaid(p), false, p);
  }
});
// Launch Part 7 — DIRECT URL ATTACK: every product surface an unpaid user might
// type into the address bar must resolve to Payment Required (blocked), including
// the office-intelligence + my-office surfaces added this launch cycle.
test("direct-URL attack: /today, /claim, /properties, CRM, Maps, Office Intelligence, AI, Reports all blocked when unpaid", () => {
  for (const p of [
    "/today", "/claim", "/properties", "/leads", "/crm",
    "/market-intelligence/map", "/maps",
    "/brokerage-data", "/brokerage-data/offices", "/brokerage-data/my-office", "/brokerage-data/offices/abc",
    "/ai", "/reports", "/broker-intelligence", "/competition-radar",
  ]) {
    assert.equal(isPathAllowedWhenUnpaid(p), false, `${p} must be blocked for an unpaid user`);
  }
});
test("query string does not smuggle a blocked path past the allowlist", () => {
  assert.equal(isPathAllowedWhenUnpaid("/today?x=/account"), false);
});
