import { test } from "node:test";
import assert from "node:assert/strict";
import { checkChargeAcceptable } from "../../src/lib/commercial/amount-verify.ts";

test("exact expected amount is accepted", () => {
  assert.equal(checkChargeAcceptable({ expectedIls: 197, chargedSum: 197 }).ok, true);
});
test("₪1 rounding tolerance is accepted", () => {
  assert.equal(checkChargeAcceptable({ expectedIls: 197, chargedSum: 197.5 }).ok, true);
});
test("underpayment is rejected (tampered checkout)", () => {
  const r = checkChargeAcceptable({ expectedIls: 197, chargedSum: 1 });
  assert.equal(r.ok, false); assert.equal(r.reason, "amount_mismatch");
});
test("overpayment beyond tolerance is rejected", () => {
  const r = checkChargeAcceptable({ expectedIls: 197, chargedSum: 250 });
  assert.equal(r.ok, false); assert.equal(r.reason, "amount_mismatch");
});
test("₪1 sandbox test price matches ₪1 expected", () => {
  assert.equal(checkChargeAcceptable({ expectedIls: 1, chargedSum: 1 }).ok, true);
});
test("non-ILS currency is rejected", () => {
  const r = checkChargeAcceptable({ expectedIls: 197, chargedSum: 197, currency: "USD" });
  assert.equal(r.ok, false); assert.equal(r.reason, "bad_currency");
});
test("ILS / NIS currency accepted; unset currency defaults acceptable", () => {
  assert.equal(checkChargeAcceptable({ expectedIls: 197, chargedSum: 197, currency: "ILS" }).ok, true);
  assert.equal(checkChargeAcceptable({ expectedIls: 197, chargedSum: 197, currency: "NIS" }).ok, true);
  assert.equal(checkChargeAcceptable({ expectedIls: 197, chargedSum: 197, currency: null }).ok, true);
});
test("missing/zero amounts are rejected (never activate on no price)", () => {
  assert.equal(checkChargeAcceptable({ expectedIls: 0, chargedSum: 197 }).ok, false);
  assert.equal(checkChargeAcceptable({ expectedIls: 197, chargedSum: 0 }).ok, false);
  assert.equal(checkChargeAcceptable({ expectedIls: null, chargedSum: null }).ok, false);
});
