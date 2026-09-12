// ZONO — QA-scoped billing overrides. Proves the ₪1 price + payment enforcement
// apply ONLY to an explicit QA org allowlist, never to real customers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrgIdList, qaEnforcementActive, isQaOrg, qaUnitPriceIls, qaExpectedMonthlyIls }
  from "../../src/lib/commercial/qa-billing.ts";

const QA = "11111111-1111-1111-1111-111111111111";
const REAL = "99999999-9999-9999-9999-999999999999";

test("empty allowlist ⇒ QA mode off, no org is a QA org (default = production-safe)", () => {
  assert.equal(qaEnforcementActive(""), false);
  assert.equal(qaEnforcementActive(null), false);
  assert.equal(isQaOrg(QA, ""), false);
  assert.equal(parseOrgIdList("").length, 0);
});

test("allowlist scopes QA to listed orgs only; real orgs are never QA", () => {
  const list = `${QA}, ${"22222222-2222-2222-2222-222222222222"}`;
  assert.equal(qaEnforcementActive(list), true);
  assert.equal(isQaOrg(QA, list), true);
  assert.equal(isQaOrg(REAL, list), false);
  assert.equal(isQaOrg(null, list), false);
});

test("parse tolerates commas, spaces, newlines", () => {
  assert.deepEqual(parseOrgIdList(`${QA}\n ${REAL} ,`), [QA, REAL]);
});

test("QA unit price defaults to 1 and never goes below 1 (bad env can't zero a charge)", () => {
  assert.equal(qaUnitPriceIls(undefined), 1);
  assert.equal(qaUnitPriceIls(""), 1);
  assert.equal(qaUnitPriceIls("0"), 1);
  assert.equal(qaUnitPriceIls("-5"), 1);
  assert.equal(qaUnitPriceIls("2"), 2);
});

test("QA expected monthly = agents × QA price (₪1 default)", () => {
  assert.equal(qaExpectedMonthlyIls(1), 1);
  assert.equal(qaExpectedMonthlyIls(3), 3);
  assert.equal(qaExpectedMonthlyIls(3, "2"), 6);
  assert.equal(qaExpectedMonthlyIls(0), 0);
});
