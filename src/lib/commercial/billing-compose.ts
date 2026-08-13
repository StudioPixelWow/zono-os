// ============================================================================
// ZONO — canonical org BILLING-STATE composition (PURE, server-safe). P8.1.
// The DECISION LOGIC of the canonical resolver, with NO DB / env / clock / secret
// access, so it is deterministically unit-testable (P8.1 QA) and identical inputs
// always yield an identical object. `billing.ts` is a thin DB wrapper over this;
// Platform Admin + Customer 360 both surface the object it returns → provably
// consistent by construction.
//
// STRICT SEPARATION: expectedMonthlyIls is a COMMERCIAL EXPECTATION (197 × active
// agents), NEVER revenue. verifiedRevenue is ONLY the sum of payments.verified=true
// (signed-webhook evidence); with no verified payment it is reported UNAVAILABLE —
// never 0, never 197×N. Not connected to P7 enforcement.
// ============================================================================
import { COMMERCIAL_MODEL, type CommercialState } from "./model";
import { canonicalFromSubscriptionStatus, STATE_CONTRACT, type BillingState } from "./billing-state";

export type Availability<T> = { value: T; available: true } | { value: null; available: false; reason: string };
export const some = <T>(value: T): Availability<T> => ({ value, available: true });
export const none = (reason: string): Availability<never> => ({ value: null, available: false, reason });

export interface OrgBillingState {
  organizationId: string;
  commercialModel: "per_agent";
  pricePerAgentIls: number;
  billableAgents: number;
  reservedSeats: number;
  pricingMode: string;
  expectedMonthlyIls: number | null;      // COMMERCIAL EXPECTATION — not revenue
  customPricingRequired: boolean;
  trial: { isTrial: boolean; startsAt: string | null; endsAt: string | null; daysTotal: number; expired: boolean };
  billingState: BillingState;
  customerAccess: string;
  paymentStatus: Availability<string>;
  lastSuccessfulPayment: Availability<{ at: string; amountIls: number }>;
  nextBillingDate: Availability<string>;
  paymentFailures: number;
  provider: { name: "grow"; configured: boolean; subscriptionIdPresent: boolean };
  verifiedRevenue: Availability<{ amountIls: number; count: number }>;   // signed evidence ONLY
  isExpectationOnly: true;
  generatedAt: string;
}

// ── Pure input shapes (safe columns only; no signature/raw_payload/secrets) ──
export interface BillingSubInput {
  status: string | null;
  period_end: string | null;
  trial_ends_at: string | null;
  grow_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
}
export interface BillingPayInput {
  status: string;
  amount_ils: number;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
}

/**
 * PURE canonical composition (no DB, no env, no clock). ALL of the resolver's
 * decision logic lives here so it is deterministically unit-testable (P8.1 QA)
 * and both Platform Admin + Customer 360 get an identical object for identical
 * inputs. The async `getOrgBillingState` (billing.ts) is a thin DB wrapper.
 */
export function composeOrgBillingState(input: {
  orgId: string;
  commercial: CommercialState;
  sub: BillingSubInput | null;
  pays: BillingPayInput[];
  nowMs: number;
  providerConfigured: boolean;
  generatedAt: string;
}): OrgBillingState {
  const { orgId, commercial, sub, pays, nowMs, providerConfigured, generatedAt } = input;
  const trialEndsAt = sub?.trial_ends_at ?? null;
  const trialExpired = !!trialEndsAt && new Date(trialEndsAt).getTime() <= nowMs;

  // Canonical billing state (unknown/absent → payment_due, never silently active).
  let billingState = canonicalFromSubscriptionStatus(sub?.status, {
    customPricing: commercial.customPricingRequired,
    cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
  });
  const verified = pays.filter((p) => p.verified === true && p.status === "paid");
  // Trial expiry with no verified payment → payment_due (DESIGN — no enforcement).
  if (billingState === "trialing" && trialExpired && verified.length === 0) billingState = "payment_due";

  const failures = pays.filter((p) => p.status === "failed").length;
  const latestVerified = verified.slice().sort((a, b) => (b.verified_at ?? b.created_at).localeCompare(a.verified_at ?? a.created_at))[0];
  const latestPay = pays.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const verifiedAmount = verified.reduce((s, p) => s + Number(p.amount_ils || 0), 0);

  return {
    organizationId: orgId,
    commercialModel: "per_agent",
    pricePerAgentIls: commercial.pricePerAgentIls,
    billableAgents: commercial.billableAgents,
    reservedSeats: commercial.reservedSeats,
    pricingMode: commercial.pricingMode,
    expectedMonthlyIls: commercial.standardMonthlyIls,             // expectation only
    customPricingRequired: commercial.customPricingRequired,
    trial: {
      isTrial: billingState === "trialing",
      startsAt: trialEndsAt ? new Date(new Date(trialEndsAt).getTime() - COMMERCIAL_MODEL.trialDays * 86_400_000).toISOString() : null,
      endsAt: trialEndsAt, daysTotal: COMMERCIAL_MODEL.trialDays, expired: trialExpired,
    },
    billingState,
    customerAccess: STATE_CONTRACT[billingState].customerAccess,
    paymentStatus: latestPay ? some(latestPay.status) : none("NO_PAYMENT"),
    lastSuccessfulPayment: latestVerified ? some({ at: latestVerified.verified_at ?? latestVerified.created_at, amountIls: Number(latestVerified.amount_ils) }) : none("NO_VERIFIED_PAYMENT"),
    nextBillingDate: sub?.period_end ? some(sub.period_end) : (trialEndsAt ? some(trialEndsAt) : none("UNAVAILABLE")),
    paymentFailures: failures,
    provider: { name: "grow", configured: providerConfigured, subscriptionIdPresent: !!sub?.grow_subscription_id },
    verifiedRevenue: verified.length ? some({ amountIls: verifiedAmount, count: verified.length }) : none("NO_VERIFIED_PAYMENT"),
    isExpectationOnly: true,
    generatedAt,
  };
}
