// ============================================================================
// ZONO — Morning auto-invoicing policy: deterministic proof (pure).
// Run: node --experimental-strip-types --test scripts/morning-tests/morning-policy.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getMorningDocumentPolicy, amountsReconcile, classifyMorningFailure,
  MORNING_DOC_TYPE, MORNING_PAYMENT_TYPE, MORNING_DOC_TYPE_HE,
} from "../../src/lib/accounting/morning-policy.ts";

// ── Document policy ──────────────────────────────────────────────────────────
test("default document type is 320 (tax-invoice+receipt) with a config blocker", () => {
  const p = getMorningDocumentPolicy({ paymentConfirmed: true });
  assert.equal(p.documentType, MORNING_DOC_TYPE.TAX_INVOICE_RECEIPT);
  assert.equal(p.documentType, 320);
  assert.ok(p.configBlocker, "must flag that the default was assumed");
});

test("explicit configured document type is honored and clears the blocker", () => {
  const p = getMorningDocumentPolicy({ configuredDocType: MORNING_DOC_TYPE.RECEIPT, paymentConfirmed: true });
  assert.equal(p.documentType, 400);
  assert.equal(p.documentTypeHe, MORNING_DOC_TYPE_HE[400]);
  assert.equal(p.configBlocker, null);
});

test("an unknown configured type falls back to the safe default (never issues a bad code)", () => {
  const p = getMorningDocumentPolicy({ configuredDocType: 9999, paymentConfirmed: true });
  assert.equal(p.documentType, 320);
});

test("GROW payment maps to credit-card (3); vat default 0; configurable vat honored", () => {
  const p = getMorningDocumentPolicy({ paymentConfirmed: true });
  assert.equal(p.paymentType, MORNING_PAYMENT_TYPE.CREDIT_CARD);
  assert.equal(p.paymentType, 3);
  assert.equal(p.vatType, 0);
  assert.equal(getMorningDocumentPolicy({ configuredVatType: 1, paymentConfirmed: true }).vatType, 1);
});

// ── Reconciliation (accounting safety) ───────────────────────────────────────
test("amounts reconcile on exact match and within a 1-agora tolerance", () => {
  assert.equal(amountsReconcile(197, 197), true);
  assert.equal(amountsReconcile(197.00, 197.009), true);
});
test("amount MISMATCH does not reconcile (L)", () => {
  assert.equal(amountsReconcile(197, 199), false);
  assert.equal(amountsReconcile(197, 0), false);
  assert.equal(amountsReconcile(197, NaN), false);
});

// ── Retry classification ─────────────────────────────────────────────────────
test("transient failures: network(0), 429, 5xx (F/G)", () => {
  assert.equal(classifyMorningFailure(0), "transient");
  assert.equal(classifyMorningFailure(429), "transient");
  assert.equal(classifyMorningFailure(500), "transient");
  assert.equal(classifyMorningFailure(503), "transient");
});
test("permanent failures: 400 validation, 401 auth (H/I)", () => {
  assert.equal(classifyMorningFailure(400), "permanent");
  assert.equal(classifyMorningFailure(401), "permanent");
  assert.equal(classifyMorningFailure(422), "permanent");
});
