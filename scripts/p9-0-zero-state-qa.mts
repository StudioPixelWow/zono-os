// P9.0 — NEW-OFFICE ZERO-STATE QA (PURE; no DB, no provider, no network, no writes).
// Proves the canonical zero-state a brand-new office resolves to, straight from the
// real pure resolvers — plus the invite/accept quantity journey, the >10 boundary,
// and the honest (non-fabricated) provider/revenue state. No Grow, no seed data.
import { newOfficeZeroState, ZERO_STATE_UNLIMITED, ZERO_STATE_COLLECTIONS } from "../src/lib/commercial/zero-state.ts";
import { computeOrgBillingQuantity } from "../src/lib/commercial/quantity.ts";
import { composeOrgBillingState } from "../src/lib/commercial/billing-compose.ts";
import { commercialState } from "../src/lib/commercial/model.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };
const AT = "2026-08-14T00:00:00.000Z";

console.log("P9.0 · canonical NEW_OFFICE_ZERO_STATE (owner-only, trial, no provider)");
const z = newOfficeZeroState();
ok(z.owner.status === "active" && z.owner.billable === true, "owner = active + billable");
ok(z.commercial.model === "per_agent" && z.commercial.pricePerAgentIls === 197 && z.commercial.featuresOpen === true, "model per_agent, 197, features open");
ok(z.commercial.billableAgents === 1 && z.commercial.reservedSeats === 1, "billable 1, reserved 1 (owner)");
ok(z.commercial.expectedMonthlyIls === 197 && z.commercial.isExpectationOnly === true, "expected monthly 197 — EXPECTATION only");
ok(z.trial.isTrial === true && z.trial.daysTotal === 14, "14-day trial");
ok(z.billing.billingState === "trialing" && z.billing.customerAccess === "full", "billing state trialing, full access");

console.log("\nP9.0 · honest provider/revenue (NO fabricated Grow / verified revenue)");
ok(z.revenue.verifiedRevenue === "UNAVAILABLE", "verified revenue UNAVAILABLE (never 0, never faked)");
ok(z.provider.configured === false && z.provider.syncStatus === "NOT_CONFIGURED", "no Grow env → provider NOT_CONFIGURED");
ok(z.provider.lastSyncedQuantity === "NOT_SYNCED", "last-synced provider quantity NOT_SYNCED");
const zc = newOfficeZeroState({ providerConfigured: true });
ok(zc.provider.syncStatus === "NOT_SYNCED", "provider configured but no sync → NOT_SYNCED (not NOT_CONFIGURED, not SYNCED)");

console.log("\nP9.0 · limits UNLIMITED (no Pixel inheritance, no obsolete Starter caps)");
ok(z.limits.seats === ZERO_STATE_UNLIMITED && z.limits.operatingAreas === ZERO_STATE_UNLIMITED && z.limits.monitoredListings === ZERO_STATE_UNLIMITED, "seats/areas/listings all UNLIMITED (-1)");
ok(z.enforcement.mode === "SHADOW" && z.enforcement.inheritsPixelOverride === false, "enforcement SHADOW, no Pixel override inherited");

console.log("\nP9.0 · every business collection is EMPTY / ZERO (distinct from NULL/UNAVAILABLE)");
ok(z.collectionsKind === "EMPTY", "collections kind = EMPTY");
ok(ZERO_STATE_COLLECTIONS.every((c) => z.counts[c] === 0), "properties/leads/contacts/deals/tasks/meetings/operatingAreas/invitations all ZERO");
ok(z.counts.properties === 0 && z.counts.operatingAreas === 0 && z.counts.invitations === 0, "explicit: 0 properties, 0 areas, 0 invitations");

console.log("\nP9.0 · invite → accept quantity journey (owner + 3 agents)");
const q = (active: number, pending: number) => computeOrgBillingQuantity({ orgId: "o", activeUsers: active, pendingInvitations: pending, isTrial: true, billingState: "trialing", providerConfigured: false, subscriptionIdPresent: false, lastSyncedQuantity: null, source: "qa", calculatedAt: AT });
{
  const ownerOnly = q(1, 0);
  ok(ownerOnly.billableAgents === 1 && ownerOnly.pendingInvitations === 0 && ownerOnly.reservedSeats === 1, "owner only → active1 pending0 reserved1 billable1");
  const invited = q(1, 3);
  ok(invited.billableAgents === 1 && invited.pendingInvitations === 3 && invited.reservedSeats === 4, "after 3 invites → active1 pending3 reserved4 billable1");
  const accepted = q(4, 0);
  ok(accepted.billableAgents === 4 && accepted.pendingInvitations === 0 && accepted.reservedSeats === 4 && accepted.expectedMonthlyIls === 788, "after all accept → active4 reserved4 billable4 expected 788");
}

console.log("\nP9.0 · pricing thresholds (≤10 standard, >10 custom)");
ok(q(10, 0).expectedMonthlyIls === 1970 && q(10, 0).customPricingRequired === false, "10 agents → 1970, standard");
{
  const c = q(11, 0);
  ok(c.customPricingRequired === true && c.expectedMonthlyIls === null, "11 agents → custom pricing required, expected NULL (no 197×11)");
}

console.log("\nP9.0 · Platform Admin == Customer 360 (one resolver → identical zero-state)");
{
  const a = newOfficeZeroState();
  const b = newOfficeZeroState();
  ok(JSON.stringify(a) === JSON.stringify(b), "deterministic zero-state (PA and C360 render identical)");
}

console.log("\nP9.0 · trial retry does not change the resolved shape (idempotent semantics)");
{
  // A re-run of onboarding must not restart the clock; the resolved commercial/quantity
  // shape for owner-only-trial is invariant regardless of how many times it's computed.
  const one = commercialState({ seats: { activeUsers: 1, pendingInvites: 0 }, isTrial: true });
  const two = commercialState({ seats: { activeUsers: 1, pendingInvites: 0 }, isTrial: true });
  ok(JSON.stringify(one) === JSON.stringify(two), "commercial state stable across recomputation");
  const s = composeOrgBillingState({ orgId: "o", commercial: one, sub: { status: "trial", period_end: null, trial_ends_at: null, grow_subscription_id: null, cancel_at_period_end: false }, pays: [], nowMs: 0, providerConfigured: false, generatedAt: AT });
  ok(s.verifiedRevenue.available === false && s.billingState === "trialing", "fresh trial → trialing + no verified revenue");
}

console.log("");
console.log(fail === 0 ? "ALL P9.0 ZERO-STATE QA PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
