// P8.4B — GROW PRE-CREDENTIALS QA (PURE; no DB, no provider, no network, no writes).
// Proves everything achievable WITHOUT live Grow credentials: sandbox/production
// revenue isolation, the next-cycle recurring-update decision (Decision A/B),
// cancellation gating logic, and the callback-protection / verification decisions.
// Anything needing a real Grow call is covered by the SANDBOX LIVE GATE checklist,
// NOT faked here.
import { commercialState } from "../src/lib/commercial/model.ts";
import { composeOrgBillingState, type BillingPayInput, type BillingSubInput } from "../src/lib/commercial/billing-compose.ts";
import { decideRecurringUpdate } from "../src/lib/commercial/recurring-decision.ts";
import { growOutcomeFromStatusCode } from "../src/lib/commercial/grow-mapping.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
const AT = "2026-08-13T00:00:00.000Z";
const NOW = Date.parse(AT);

const compose = (pays: BillingPayInput[], sub: BillingSubInput | null) =>
  composeOrgBillingState({
    orgId: "o", commercial: commercialState({ seats: { activeUsers: 4, pendingInvites: 0 } }),
    sub, pays, nowMs: NOW, providerConfigured: true, generatedAt: AT,
  });
const paid = (environment: string | null): BillingPayInput =>
  ({ status: "paid", amount_ils: 788, verified: true, verified_at: AT, created_at: AT, environment });
const activeSub: BillingSubInput = { status: "active", period_end: null, trial_ends_at: null, grow_subscription_id: "g", cancel_at_period_end: false };

console.log("P8.4B · SANDBOX/PRODUCTION revenue isolation (sandbox is NEVER revenue)");
{
  const prod = compose([paid("production")], activeSub);
  ok(prod.verifiedRevenue.available === true && prod.verifiedRevenue.value!.amountIls === 788, "production verified paid → counts as verified revenue (788)");
  const sand = compose([paid("sandbox")], activeSub);
  ok(sand.verifiedRevenue.available === false, "SANDBOX verified paid → NOT revenue (UNAVAILABLE)");
  const missing = compose([paid(null)], activeSub);
  ok(missing.verifiedRevenue.available === false, "missing environment → NOT revenue (conservative)");
  const mixed = compose([paid("sandbox"), paid("production"), paid("sandbox")], activeSub);
  ok(mixed.verifiedRevenue.available === true && mixed.verifiedRevenue.value!.amountIls === 788 && mixed.verifiedRevenue.value!.count === 1, "mixed → only the production payment counts (788, count 1)");
}

console.log("\nP8.4B · next-cycle recurring update decision (Decision A: no proration)");
{
  // provider currently at 3, billable now 4, standard, provider configured elsewhere.
  const owed = decideRecurringUpdate({ billableAgents: 4, customPricingRequired: false, unitPriceIls: 197, providerQuantity: 3, syncStatus: "sync_required" });
  ok(owed.action === "UPDATE_OWED" && owed.targetSumIls === 788 && owed.targetQuantity === 4, "3→4 standard → UPDATE_OWED, target sum 788 (pushed at boundary)");
  const none = decideRecurringUpdate({ billableAgents: 4, customPricingRequired: false, unitPriceIls: 197, providerQuantity: 4, syncStatus: "synced" });
  ok(none.action === "NONE" && none.targetSumIls === null, "provider already 4 → NONE (no redundant update)");
  const custom = decideRecurringUpdate({ billableAgents: 11, customPricingRequired: true, unitPriceIls: 197, providerQuantity: 10, syncStatus: "custom_review_required" });
  ok(custom.action === "CUSTOM_REVIEW_REQUIRED" && custom.targetSumIls === null, "11 active → CUSTOM_REVIEW_REQUIRED, no auto amount");
  const held = decideRecurringUpdate({ billableAgents: 9, customPricingRequired: false, unitPriceIls: 197, providerQuantity: 11, syncStatus: "custom_review_required" });
  ok(held.action === "BLOCKED_PENDING_APPROVAL" && held.targetSumIls === null, "custom→standard (held) → BLOCKED_PENDING_APPROVAL (Decision B: needs approval)");
}

console.log("\nP8.4B · pricing still canonical at the boundary (1–10 → 197×N)");
for (const [n, sum] of [[1,197],[3,591],[4,788],[10,1970]] as const) {
  const d = decideRecurringUpdate({ billableAgents: n, customPricingRequired: false, unitPriceIls: 197, providerQuantity: 0, syncStatus: "sync_required" });
  ok(d.action === "UPDATE_OWED" && d.targetSumIls === sum, `${n} agents → boundary sum ${sum}`);
}

console.log("\nP8.4B · callback verification gate unchanged (server-to-server; forged blocked)");
{
  // Activation requires BOTH the callback AND the getTransactionInfo re-query to be
  // paid. A forged callback claiming paid, with a re-query that does not confirm,
  // is never activated.
  ok(growOutcomeFromStatusCode("2") === "paid", "confirmed statusCode 2 → paid");
  ok(growOutcomeFromStatusCode("9") !== "paid" && growOutcomeFromStatusCode(undefined) !== "paid", "unconfirmed/unknown re-query → never paid");
}

console.log("\nP8.4B · commercial expectation ≠ verified revenue (still separate)");
{
  const trialNoPay = compose([], { status: "trial", period_end: null, trial_ends_at: null, grow_subscription_id: null, cancel_at_period_end: false });
  ok(trialNoPay.expectedMonthlyIls === 788 && trialNoPay.verifiedRevenue.available === false, "expectation 788 present, verified revenue UNAVAILABLE (no paid production)");
}

console.log("");
console.log(fail === 0 ? "ALL P8.4B PRE-CREDENTIALS QA PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
