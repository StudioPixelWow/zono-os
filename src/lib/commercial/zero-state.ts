// ============================================================================
// ZONO — NEW-OFFICE ZERO-STATE CONTRACT (PURE, server-safe). P9.0.
// THE canonical definition of a brand-new office's deterministic initial state,
// computed from the SAME pure resolvers the live product uses (commercialState,
// computeOrgBillingQuantity, composeOrgBillingState, canonicalDefaultLimits) so
// "zero state" is not a hand-written guess but what the real resolvers produce for
// an owner-only, no-payment, no-provider org. Distinguishes ZERO / NULL /
// UNAVAILABLE / NOT_CONFIGURED / NOT_SYNCED / EMPTY — never conflates them.
//
// A new office: owner active (billable), 14-day trial, per-agent 197 model, all
// features open, UNLIMITED limits (no Pixel inheritance), SHADOW enforcement, and
// EVERY business collection empty. Provider/revenue are honestly UNAVAILABLE — no
// fabricated Grow state, no fabricated verified revenue.
// ============================================================================
import { commercialState, canonicalDefaultLimits, COMMERCIAL_MODEL } from "./model";
import { computeOrgBillingQuantity } from "./quantity";
import { composeOrgBillingState } from "./billing-compose";
import { UNLIMITED } from "@/lib/limits/model";

export type ZeroStateKind =
  | "ZERO"            // a real numeric count that is genuinely 0 (e.g. 0 properties)
  | "NULL"            // no value applicable
  | "UNAVAILABLE"     // a value that cannot be produced yet (e.g. verified revenue)
  | "NOT_CONFIGURED"  // provider/integration not configured
  | "NOT_SYNCED"      // provider configured but never synced
  | "EMPTY";          // an empty collection

/** The business collections that MUST be empty for a brand-new office. */
export const ZERO_STATE_COLLECTIONS = [
  "properties", "leads", "contacts", "deals", "tasks", "meetings",
  "operatingAreas", "invitations",
] as const;
export type ZeroStateCollection = (typeof ZERO_STATE_COLLECTIONS)[number];

export interface NewOfficeZeroState {
  organization: { exists: true; onboardingCompleted: boolean };
  owner: { status: "active"; billable: true };
  commercial: {
    model: "per_agent"; pricePerAgentIls: number; featuresOpen: true;
    billableAgents: number; reservedSeats: number; pricingMode: string;
    expectedMonthlyIls: number; isExpectationOnly: true; customPricingRequired: boolean;
  };
  trial: { isTrial: true; daysTotal: number };
  billing: { billingState: string; customerAccess: string };
  revenue: { verifiedRevenue: ZeroStateKind };            // UNAVAILABLE for a fresh office
  provider: { configured: boolean; syncStatus: ZeroStateKind; lastSyncedQuantity: ZeroStateKind };
  limits: { seats: number; operatingAreas: number; monitoredListings: number }; // all UNLIMITED (-1)
  enforcement: { mode: "SHADOW"; inheritsPixelOverride: false };
  counts: Record<ZeroStateCollection, number>;             // all ZERO
  collectionsKind: ZeroStateKind;                          // EMPTY
}

/**
 * Compute the canonical zero-state for a fresh owner-only office from the real
 * pure resolvers. `providerConfigured` reflects whether Grow env is set (default
 * false → provider NOT_CONFIGURED). No trial dates / payments are required — this
 * is the deterministic shape the resolvers yield at t=0.
 */
export function newOfficeZeroState(opts: { providerConfigured?: boolean; generatedAt?: string } = {}): NewOfficeZeroState {
  const providerConfigured = opts.providerConfigured ?? false;
  const generatedAt = opts.generatedAt ?? "1970-01-01T00:00:00.000Z";

  // Owner-only, on trial, no pending invites.
  const commercial = commercialState({ seats: { activeUsers: 1, pendingInvites: 0 }, isTrial: true });
  const quantity = computeOrgBillingQuantity({
    orgId: "new-office", activeUsers: 1, pendingInvitations: 0, isTrial: true,
    billingState: "trialing", providerConfigured, subscriptionIdPresent: false,
    lastSyncedQuantity: null, source: "zero-state", calculatedAt: generatedAt,
  });
  // Fresh trial subscription, zero payments.
  const billing = composeOrgBillingState({
    orgId: "new-office", commercial,
    sub: { status: "trial", period_end: null, trial_ends_at: null, grow_subscription_id: null, cancel_at_period_end: false },
    pays: [], nowMs: 0, providerConfigured, generatedAt,
  });
  const limits = canonicalDefaultLimits() as unknown as { seats: number; operatingAreas: number; monitoredListings: number };

  const counts = Object.fromEntries(ZERO_STATE_COLLECTIONS.map((c) => [c, 0])) as Record<ZeroStateCollection, number>;

  return {
    organization: { exists: true, onboardingCompleted: true },
    owner: { status: "active", billable: true },
    commercial: {
      model: "per_agent", pricePerAgentIls: COMMERCIAL_MODEL.pricePerAgentIls, featuresOpen: true,
      billableAgents: commercial.billableAgents, reservedSeats: quantity.reservedSeats,
      pricingMode: quantity.pricingMode, expectedMonthlyIls: quantity.expectedMonthlyIls ?? 0,
      isExpectationOnly: true, customPricingRequired: quantity.customPricingRequired,
    },
    trial: { isTrial: true, daysTotal: COMMERCIAL_MODEL.trialDays },
    billing: { billingState: billing.billingState, customerAccess: billing.customerAccess },
    revenue: { verifiedRevenue: billing.verifiedRevenue.available ? "ZERO" : "UNAVAILABLE" },
    provider: {
      configured: providerConfigured,
      syncStatus: providerConfigured ? "NOT_SYNCED" : "NOT_CONFIGURED",
      lastSyncedQuantity: "NOT_SYNCED",
    },
    limits: { seats: limits.seats, operatingAreas: limits.operatingAreas, monitoredListings: limits.monitoredListings },
    enforcement: { mode: "SHADOW", inheritsPixelOverride: false },
    counts,
    collectionsKind: "EMPTY",
  };
}

/** The canonical UNLIMITED sentinel, re-exported for QA clarity. */
export const ZERO_STATE_UNLIMITED = UNLIMITED;
