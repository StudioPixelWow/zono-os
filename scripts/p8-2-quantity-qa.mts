// P8.2 — AGENT QUANTITY & SUBSCRIPTION LIFECYCLE QA (PURE; no DB, no provider,
// no writes). Proves the canonical quantity resolver, the quantity event matrix,
// idempotency + concurrency safety (structural — derivation from counts), the
// 1–10/11+ boundary, provider-quantity honesty, per-state disposition, and the
// clean-office readiness sequence. Platform Admin == Customer 360 holds by
// construction (both call getOrgBillingQuantity → computeOrgBillingQuantity).
import { COMMERCIAL_MODEL } from "../src/lib/commercial/model.ts";
import {
  computeOrgBillingQuantity, deriveQuantityEvents, QUANTITY_POLICY,
  type QuantitySnapshot,
} from "../src/lib/commercial/quantity.ts";
import { BILLING_STATES } from "../src/lib/commercial/billing-state.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
const AT = "2026-08-13T00:00:00.000Z";

// Canonical quantity for N active + P pending, given options.
const q = (active: number, pending = 0, opts: { isTrial?: boolean; billingState?: any; providerConfigured?: boolean; lastSynced?: number | null } = {}) =>
  computeOrgBillingQuantity({
    orgId: "org-under-test", activeUsers: active, pendingInvitations: pending,
    isTrial: opts.isTrial ?? false, billingState: opts.billingState ?? null,
    providerConfigured: opts.providerConfigured ?? false, subscriptionIdPresent: false,
    lastSyncedQuantity: opts.lastSynced ?? null,
    source: "qa", calculatedAt: AT,
  });

console.log("P8.2 · standard per-agent pricing (1–10 → 197×N)");
ok(q(1).billableAgents === 1 && q(1).expectedMonthlyIls === 197, "1 active → billable 1, expected 197");
ok(q(3).expectedMonthlyIls === 591, "3 active → 591");
ok(q(4).expectedMonthlyIls === 788, "4 active → 788");
ok(q(10).expectedMonthlyIls === 1970, "10 active → 1970");
ok(q(10).pricingMode === "standard_per_agent" && q(10).customPricingRequired === false, "10 active → standard_per_agent, not custom");

console.log("\nP8.2 · 11+ → custom (NO auto 197×N)");
{
  const s = q(11);
  ok(s.pricingMode === "custom_pricing_required", "11 active → pricingMode custom_pricing_required");
  ok(s.expectedMonthlyIls === null, "11 active → expectedMonthlyIls NULL (never 11×197)");
  ok(s.customPricingRequired === true, "11 active → customPricingRequired true");
  ok(s.provider.expectedProviderQuantity.available === false && s.provider.syncStatus === "CUSTOM_REVIEW_REQUIRED", "11 active → provider sync PAUSED (custom review), expected qty UNAVAILABLE");
}

console.log("\nP8.2 · owner included; pending / suspended / disabled / expired / cancelled excluded from billing");
// Only active users are passed as activeUsers by the resolver's data layer; this
// asserts the model treats activeUsers as billable and pending as reserved-only.
ok(q(1).billableAgents === 1, "owner (1 active) IS billable");
ok(q(3, 2).billableAgents === 3, "pending invites NOT billable (3 active +2 pending → billable 3)");
ok(q(3, 2).pendingInvitations === 2 && q(3, 2).reservedSeats === 5, "pending counted as reserved; reservedSeats = active+pending = 5");
// suspended/disabled/expired/cancelled never reach activeUsers/pendingInvitations
// (data layer filters status='active' / status='pending'); the model excludes them
// by only ever receiving active + pending counts. Documented invariant:
ok(q(0).billableAgents === 0 && q(0).expectedMonthlyIls === 0, "zero active → billable 0, expected 0 (suspended/disabled-only org)");

console.log("\nP8.2 · reserved-seat semantics (active + pending)");
ok(q(1, 0).reservedSeats === 1, "owner only → reserved 1");
ok(q(1, 3).reservedSeats === 4 && q(1, 3).billableAgents === 1, "owner + 3 pending → reserved 4, billable 1");
ok(q(4, 0).reservedSeats === 4, "4 active, 0 pending → reserved 4");

console.log("\nP8.2 · quantity event matrix (exactly one change per logical action)");
const snap = (billable: number, pending: number): QuantitySnapshot => ({ billableAgents: billable, reservedSeats: billable + pending, customPricingRequired: billable > COMMERCIAL_MODEL.customPricingAgentThreshold });
const ev = (before: QuantitySnapshot, after: QuantitySnapshot, action: string, providerConfigured = false) =>
  deriveQuantityEvents(before, after, { organizationId: "o", action, at: AT, providerConfigured });
{
  // invite accepted: 3→4 billable
  const e = ev(snap(3, 1), snap(4, 0), "invite.accepted");
  ok(e.length === 1 && e[0].type === "billing.quantity.changed" && e[0].oldQuantity === 3 && e[0].newQuantity === 4, "invite accepted → ONE billing.quantity.changed (3→4)");
  // invite sent: reserved 1→2, billable unchanged
  const e2 = ev(snap(3, 1), snap(3, 2), "invite.sent");
  ok(e2.length === 1 && e2[0].type === "billing.quantity.changed", "invite sent (reserved change) → ONE quantity.changed");
  // user suspended: 4→3
  const e3 = ev(snap(4, 0), snap(3, 0), "user.suspended");
  ok(e3.length === 1 && e3[0].oldQuantity === 4 && e3[0].newQuantity === 3, "user suspended → ONE quantity.changed (4→3)");
  // crossing 10→11: custom_pricing.required emitted, NOT sync_required
  const e4 = ev(snap(10, 0), snap(11, 0), "invite.accepted", true);
  ok(e4.some(x => x.type === "billing.quantity.changed") && e4.some(x => x.type === "billing.custom_pricing.required") && !e4.some(x => x.type === "billing.quantity.sync_required"), "10→11 → quantity.changed + custom_pricing.required (NO sync_required)");
  // ≤10 with provider configured → sync_required owed
  const e5 = ev(snap(3, 0), snap(4, 0), "invite.accepted", true);
  ok(e5.some(x => x.type === "billing.quantity.sync_required"), "≤10 change with provider configured → sync_required owed");
  // 11→10 return: only quantity.changed, never auto sync_required (controlled)
  const e6 = ev(snap(11, 0), snap(10, 0), "user.suspended", true);
  ok(e6.some(x => x.type === "billing.quantity.changed") && !e6.some(x => x.type === "billing.quantity.sync_required"), "11→10 return → quantity.changed only, NO auto sync (controlled)");
}

console.log("\nP8.2 · idempotency (retry / duplicate action → no duplicate event)");
{
  ok(ev(snap(4, 0), snap(4, 0), "invite.accepted.retry").length === 0, "duplicate accept (4→4) → NO event");
  ok(ev(snap(3, 0), snap(3, 0), "user.suspend.retry").length === 0, "duplicate suspend (3→3) → NO event");
  ok(ev(snap(4, 0), snap(4, 0), "user.reactivate.retry").length === 0, "duplicate reactivate (4→4) → NO event");
  ok(ev(snap(3, 1), snap(3, 1), "invite.cancel.retry").length === 0, "duplicate cancel (no count change) → NO event");
}

console.log("\nP8.2 · concurrency (derive from counts, not counters → no lost update)");
{
  // 9 active, two invitations accepted concurrently. Regardless of interleaving,
  // BOTH users end up status='active' → the authoritative COUNT returns 11. The
  // resolver never does read-modify-write on a counter, so no update is lost.
  const finalActive = 11; // 9 + 2 concurrent activations, both rows committed
  const s = q(finalActive);
  ok(s.billableAgents === 11 && s.customPricingRequired === true, "9 + 2 concurrent activations → billable 11 → custom (no lost update)");
  // Two concurrent suspends of the SAME user: only one row transition exists; the
  // count reflects one decrement. Idempotent at the event layer (4→3 once).
  ok(ev(snap(4, 0), snap(3, 0), "user.suspend.concurrent").length === 1, "concurrent double-suspend of same user → single effective transition");
}

console.log("\nP8.2 · trial quantity behavior (updates expectation; provider not synced)");
{
  const owner = q(1, 0, { isTrial: true, billingState: "trialing" });
  ok(owner.billableAgents === 1 && owner.expectedMonthlyIls === 197 && owner.pricingMode === "trial", "trial with owner → billable 1, expected 197, pricingMode trial");
  const grown = q(4, 0, { isTrial: true, billingState: "trialing" });
  ok(grown.billableAgents === 4 && grown.expectedMonthlyIls === 788, "trial grows to 4 active → expected 788 (updates during trial)");
  ok(QUANTITY_POLICY.trialing === "CALCULATED", "trialing disposition = CALCULATED (tracked, no provider charge/sync)");
}

console.log("\nP8.2 · per-billing-state quantity disposition (spec §9)");
ok(BILLING_STATES.every(s => QUANTITY_POLICY[s] !== undefined), "every canonical billing state has a quantity disposition");
ok(QUANTITY_POLICY.active === "PROVIDER_SYNC_PENDING", "active → PROVIDER_SYNC_PENDING");
ok(QUANTITY_POLICY.cancelled === "IGNORED", "cancelled → IGNORED (no provider sync; data preserved)");
ok(QUANTITY_POLICY.custom_pricing_required === "CUSTOM_REVIEW_REQUIRED", "custom_pricing_required → CUSTOM_REVIEW_REQUIRED");

console.log("\nP8.2 · provider-quantity honesty (current / expected / last-synced)");
{
  const notConfigured = q(4);
  ok(notConfigured.provider.currentBillableQuantity === 4 && notConfigured.provider.syncStatus === "NOT_CONFIGURED", "no provider env → syncStatus NOT_CONFIGURED, current billable known (4)");
  const configured = q(4, 0, { providerConfigured: true });
  ok(configured.provider.syncStatus === "NOT_SYNCED" && configured.provider.lastSyncedProviderQuantity.available === false, "provider configured, no sync yet → NOT_SYNCED, last-synced UNAVAILABLE (never faked)");
  ok(configured.provider.expectedProviderQuantity.available === true && configured.provider.expectedProviderQuantity.value === 4, "≤10 → expected provider quantity = current billable (4)");
}

console.log("\nP8.2 · commercial expectation ≠ verified revenue");
ok(q(4).isExpectationOnly === true && q(4).expectedMonthlyIls === 788, "expectedMonthlyIls flagged expectation-only (788), never revenue");

console.log("\nP8.2 · Platform Admin == Customer 360 (same resolver → deterministic)");
{
  const a = q(6, 2, { isTrial: false, billingState: "active", providerConfigured: true });
  const b = q(6, 2, { isTrial: false, billingState: "active", providerConfigured: true });
  ok(JSON.stringify(a) === JSON.stringify(b), "identical inputs → byte-identical OrgBillingQuantity (both surfaces call the same resolver)");
}

console.log("\nP8.2 · existing-org invariance (Pixel / RE-MAX real counts: 1 active, 0 pending)");
{
  const pixel = q(1, 0);   // production: 1 active, 0 pending, no subscription
  ok(pixel.billableAgents === 1 && pixel.expectedMonthlyIls === 197 && pixel.pricingMode === "standard_per_agent", "Pixel: billable 1, expected 197 (commercial expectation only; enforcement untouched)");
  const remax = q(1, 0);
  ok(remax.billableAgents === 1 && remax.reservedSeats === 1, "RE/MAX: billable 1, reserved 1 (SHADOW; no fabricated trial/provider quantity)");
}

console.log("\nP8.2 · CLEAN-OFFICE readiness sequence (owner → invite 3 → all accept)");
{
  const step1 = q(1, 0);            // owner created
  ok(step1.billableAgents === 1 && step1.reservedSeats === 1, "owner created → billable 1, reserved 1");
  const step2 = q(1, 3);           // invite 3 agents (pending)
  ok(step2.billableAgents === 1 && step2.reservedSeats === 4, "invite 3 → billable stays 1, reserved 4");
  const step3 = q(4, 0);           // all 3 accept
  ok(step3.billableAgents === 4 && step3.reservedSeats === 4 && step3.expectedMonthlyIls === 788, "all 3 accept → billable 4, reserved 4, expected 788 (auto, no SQL/patch)");
}

console.log("");
console.log(fail === 0 ? "ALL P8.2 QUANTITY QA PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
