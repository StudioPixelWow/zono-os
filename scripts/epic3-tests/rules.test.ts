// Epic 3 pure-logic unit tests. Run with:
//   node --experimental-strip-types --test scripts/epic3-tests/rules.test.ts
// No test-runner dependency (Node built-in node:test). Covers the extracted,
// I/O-free rules that back offers, commissions and person identity.
import { test } from "node:test";
import assert from "node:assert/strict";

import { OFFER_OPEN_STATUSES, offerNextAction, offerActionAllowed } from "../../src/lib/offers/rules.ts";
import { computeVatNet, derivePaymentStatus, num, round } from "../../src/lib/commissions/rules.ts";
import { normPhone, normEmail } from "../../src/lib/people/identity.ts";

test("offers: open statuses are draft/submitted/countered", () => {
  assert.deepEqual([...OFFER_OPEN_STATUSES].sort(), ["countered", "draft", "submitted"]);
});

test("offers: next action depends on status + responder", () => {
  assert.equal(offerNextAction("draft", null), "הגש הצעה");
  assert.equal(offerNextAction("submitted", "seller"), "ממתין לתשובת מוכר");
  assert.equal(offerNextAction("countered", "buyer"), "נדרשת תשובת קונה");
  assert.equal(offerNextAction("accepted", null), "המר לעסקה");
  assert.equal(offerNextAction("expired", null), "פג תוקף");
});

test("offers: action allowed only from permitted statuses", () => {
  assert.equal(offerActionAllowed("draft", ["draft"]), true);
  assert.equal(offerActionAllowed("accepted", ["submitted", "countered"]), false);
  assert.equal(offerActionAllowed("submitted", ["submitted", "countered"]), true);
});

test("commissions: num guards non-finite/negative to 0 and rounds", () => {
  assert.equal(num(1234.6), 1235);
  assert.equal(num(-5), 0);
  assert.equal(num(null), 0);
  assert.equal(num(undefined), 0);
  assert.equal(round(2.5), 3);
});

test("commissions: VAT/net computed from gross + adjustments", () => {
  assert.deepEqual(computeVatNet(50000, 18, 0), { gross_amount: 50000, vat_amount: 9000, net_amount: 50000 });
  assert.deepEqual(computeVatNet(50000, 17, -2000), { gross_amount: 50000, vat_amount: 8500, net_amount: 48000 });
  // negative adjustment can't push net below zero
  assert.equal(computeVatNet(1000, 18, -5000).net_amount, 0);
});

test("commissions: payment status derivation", () => {
  assert.equal(derivePaymentStatus(1000, 1000, "pending"), "paid");
  assert.equal(derivePaymentStatus(1000, 1500, "pending"), "paid");
  assert.equal(derivePaymentStatus(1000, 400, "pending"), "partial");
  assert.equal(derivePaymentStatus(1000, 0, "overdue"), "overdue");
  assert.equal(derivePaymentStatus(1000, 0, "pending"), "pending");
});

test("people: phone normalization unifies IL formats", () => {
  const a = normPhone("050-123-4567");
  const b = normPhone("+972 50 123 4567");
  const c = normPhone("00972501234567".replace("00", "+"));
  assert.equal(a, "501234567");
  assert.equal(b, "501234567");
  assert.equal(a, b);
  assert.equal(c, "501234567");
  assert.equal(normPhone("123"), null);
  assert.equal(normPhone(null), null);
});

test("people: email normalization lowercases + validates", () => {
  assert.equal(normEmail("  Foo@Bar.COM "), "foo@bar.com");
  assert.equal(normEmail("not-an-email"), null);
  assert.equal(normEmail(null), null);
});
