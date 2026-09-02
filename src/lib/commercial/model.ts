// ============================================================================
// ZONO — CANONICAL COMMERCIAL MODEL (PURE, server-safe). P7.4.
// THE single source of truth for ZONO's commercial offer. Supersedes the legacy
// tiered plans (starter/professional/office/enterprise) as the AUTHORITY for
// enforcement + pricing. Legacy plan fields remain in the DB for compatibility
// and history, but they NO LONGER govern effective limits or price.
//
// AUTHORITATIVE DECISION:
//   • Flat per-agent: 197 ₪ / agent / month.
//   • ALL product capabilities open (no feature/area/listing tiering).
//   • 14-day free trial.
//   • Offices with MORE THAN 10 agents → custom pricing / sales conversation
//     (do NOT auto-compute 197×N above the threshold).
//
// This module is also the Phase-8 billing hand-off contract (commercialState()).
// No provider/charging logic here — reconciliation only.
// ============================================================================
import { UNLIMITED } from "@/lib/limits/model";
import type { PlanLimitsLike } from "@/lib/limits/model";

// Unit price is env-overridable ONLY for billing QA/test (e.g. a ₪1 end-to-end
// run) and is fully reversible without a code deploy: set BILLING_UNIT_PRICE_ILS
// to override, remove it to restore ₪197. An invalid/≤0 value falls back to 197,
// so a bad env can never zero-out or break billing.
function resolveUnitPriceIls(): number {
  const raw = process.env.BILLING_UNIT_PRICE_ILS;
  if (!raw) return 197;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 197;
}

export const COMMERCIAL_MODEL = {
  kind: "per_agent" as const,
  pricePerAgentIls: resolveUnitPriceIls(),
  currency: "ILS" as const,
  trialDays: 14,
  /** Offices strictly ABOVE this agent count are custom-priced (sales). */
  customPricingAgentThreshold: 10,
  featuresOpen: true,
};

// ── Canonical effective limits (flat model = all capabilities open) ─────────
// Under the per-agent model there are NO commercial caps on seats / operating
// areas / monitored listings for standard customers: seats scale with billing
// (and route to custom pricing above the threshold), everything else is open.
// The enforcement ENGINE stays fully capable — an explicit org override
// (org_plans.limits, e.g. the Pixel canary 5/30/5, or a future custom-office
// quantity) is still honored and enforced. Absent an override, the default is
// UNLIMITED, so obsolete tiered values (starter=1 seat) can never govern a real
// customer. AI/sync controls are likewise open here (their enforcement remains a
// separate, still-inactive mechanism — untouched by this reconciliation).
export function canonicalDefaultLimits(): PlanLimitsLike {
  return {
    seats: UNLIMITED,
    operatingAreas: UNLIMITED,
    monitoredListings: UNLIMITED,
    aiCallsPerMonth: UNLIMITED,
    syncsPerDay: UNLIMITED,
  } as unknown as PlanLimitsLike;
}

// ── Billable-agent rule (derived from the existing seat/user semantics) ─────
// Seat usage (P6.3) = active users + pending invites. For PRICING:
//   • billable agent  = a user with status 'active' (owner INCLUDED — the owner
//     is an operating user of ZONO). One billable agent = 197 ₪/mo.
//   • reserved seat   = a pending invitation (consumes seat capacity; becomes a
//     billable agent only when accepted → the user turns 'active').
//   • NOT billable    = suspended/disabled users; cancelled/expired/accepted invites.
export interface SeatCounts { activeUsers: number; pendingInvites: number }
export function billableAgents(c: SeatCounts): number { return c.activeUsers; }
export function reservedSeats(c: SeatCounts): number { return c.pendingInvites; }
export function committedSeats(c: SeatCounts): number { return c.activeUsers + c.pendingInvites; }

// ── Commercial state (Phase-8 billing hand-off contract) ────────────────────
export type PricingMode = "standard_per_agent" | "custom_pricing_required" | "trial";
export interface CommercialState {
  model: "per_agent";
  pricePerAgentIls: number;
  billableAgents: number;
  reservedSeats: number;
  featuresOpen: true;
  pricingMode: PricingMode;
  /** Standard monthly EXPECTATION (agents × 197) — only when ≤ threshold and not custom. */
  standardMonthlyIls: number | null;
  customPricingRequired: boolean;
  trial: { isTrial: boolean; endsAt: string | null; daysTotal: number };
  /** true if the estimate is a commercial EXPECTATION, not a verified payment. */
  isExpectationOnly: true;
}

export function commercialState(input: {
  seats: SeatCounts;
  trialEndsAt?: string | null;
  isTrial?: boolean;
}): CommercialState {
  const agents = billableAgents(input.seats);
  const overThreshold = agents > COMMERCIAL_MODEL.customPricingAgentThreshold;
  const isTrial = input.isTrial ?? false;
  const pricingMode: PricingMode = isTrial ? "trial" : overThreshold ? "custom_pricing_required" : "standard_per_agent";
  return {
    model: "per_agent",
    pricePerAgentIls: COMMERCIAL_MODEL.pricePerAgentIls,
    billableAgents: agents,
    reservedSeats: reservedSeats(input.seats),
    featuresOpen: true,
    pricingMode,
    standardMonthlyIls: overThreshold ? null : agents * COMMERCIAL_MODEL.pricePerAgentIls,
    customPricingRequired: overThreshold,
    trial: { isTrial, endsAt: input.trialEndsAt ?? null, daysTotal: COMMERCIAL_MODEL.trialDays },
    isExpectationOnly: true,
  };
}

/** All features are open under the canonical model — the entitlement engine is
 *  retained for future use but resolves OPEN for every standard/trial customer. */
export function featureAccessOpen(): boolean { return COMMERCIAL_MODEL.featuresOpen; }
