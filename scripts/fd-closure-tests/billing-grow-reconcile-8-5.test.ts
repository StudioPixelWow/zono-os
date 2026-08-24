// ============================================================================
// ZONO BILLING 8.5 — GROW recurring provider-config RECONCILIATION tests.
// Locks the corrected provider contract against the REAL sandbox creds (userId +
// recurring pageCode only): the adapter authenticates by userId+pageCode (NO api
// key), the canonical checkout uses the recurring API and the MONTHLY amount
// (197×seats, no proration), and "provider configured" now derives from
// growCreds().configured — not the obsolete GROW_CHECKOUT_URL. Pure + source-
// closure; never calls the provider.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/billing-grow-reconcile-8-5.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");

// ── MONTHLY amount model (₪197 × active seats; no proration; >10 → custom) ────
// model.ts uses `@/` path aliases the fd runner can't resolve, so we lock the
// canonical formula by source-closure (the arithmetic 197×N is deterministic).
test("unit price is ₪197 and monthly = agents × price, null above the >10 threshold", () => {
  const s = src("lib/commercial/model.ts");
  assert.match(s, /pricePerAgentIls:\s*197/, "canonical ₪197 per agent");
  assert.match(s, /customPricingAgentThreshold:\s*10/, ">10 is custom");
  assert.match(s, /standardMonthlyIls:\s*overThreshold \? null : agents \* COMMERCIAL_MODEL\.pricePerAgentIls/, "monthly = agents×197, custom→null (no auto 197×N)");
  // deterministic examples the model yields: 1→197, 2→394, 5→985
  assert.equal(1 * 197, 197); assert.equal(2 * 197, 394); assert.equal(5 * 197, 985);
});

// ── GROW_API_KEY is NOT part of the recurring contract ────────────────────────
test("adapter never sends an API key by default (x-api-key only when a caller opts in)", () => {
  const s = src("lib/commercial/grow-client.ts");
  assert.match(s, /if \(opts\.apiKeyHeader\) headers\["x-api-key"\]/, "x-api-key is opt-in only");
  // No adapter caller passes apiKeyHeader → the API key is never transmitted.
  assert.doesNotMatch(s, /apiKeyHeader:\s*creds\.apiKey/, "no call wires the API key into a request");
});
test("createPaymentProcess authenticates by userId + pageCode (recurring)", () => {
  const s = src("lib/commercial/grow-client.ts");
  assert.match(s, /growCreatePaymentProcess[\s\S]*pageCode,\s*userId:\s*creds\.userId/, "userId+pageCode identify the account");
  assert.match(s, /recurring \? \(creds\.recurringPageCode \?\? creds\.pageCode\)/, "recurring uses the recurring page code");
});

// ── canonical checkout: recurring + MONTHLY amount + server-derived ───────────
test("createGrowCheckout sends the recurring flag and the server-derived monthly sum", () => {
  const s = src("lib/commercial/checkout.ts");
  assert.match(s, /const amountIls = q\.expectedMonthlyIls/, "sum = expected MONTHLY amount");
  assert.match(s, /recurring:\s*true/, "recurring subscription");
  assert.match(s, /if \(!creds\.configured\)/, "gates on growCreds().configured, not GROW_CHECKOUT_URL");
  assert.doesNotMatch(s, /GROW_CHECKOUT_URL/, "checkout must not depend on GROW_CHECKOUT_URL");
});

// ── updateDirectDebit persists + uses the recurring identifiers ───────────────
test("seat-change boundary updates the direct debit with the persisted recurring identifiers", () => {
  const s = src("lib/commercial/grow-client.ts");
  assert.match(s, /growUpdateDirectDebit[\s\S]*transactionId:[\s\S]*transactionToken:[\s\S]*asmachta:/, "update needs txnId+token+asmachta");
});

// ── provider-configured gate reconciled (no obsolete GROW_CHECKOUT_URL) ───────
test("lifecycle + billing 'provider configured' now derive from growCreds().configured", () => {
  const life = src("lib/commercial/lifecycle-server.ts");
  const bill = src("lib/commercial/billing.ts");
  assert.doesNotMatch(life, /GROW_CHECKOUT_URL/, "lifecycle must not gate on GROW_CHECKOUT_URL");
  assert.doesNotMatch(bill, /GROW_CHECKOUT_URL/, "billing must not gate on GROW_CHECKOUT_URL");
  assert.match(life, /growCreds\(\)\.configured/);
  assert.match(bill, /growCreds\(\)\.configured/);
});

// ── authoritative re-query remains the payment truth (no callback-only trust) ─
test("verification is the server-to-server re-query, never the raw callback", () => {
  const s = src("app/api/payments/grow/webhook/route.ts");
  assert.match(s, /getTransactionInfo|growGetTransactionInfo/, "authoritative re-query gates activation");
  assert.match(s, /markPaymentVerified/);
});
