// ============================================================================
// ZONO — CANONICAL AGENT-QUANTITY & PROVIDER-QUANTITY MODEL (PURE, server-safe).
// P8.2. THE single source of truth for "how many agents does this org bill for,
// and what quantity would eventually be sent to the provider". No DB / env / clock
// / provider calls live here — everything is derived from authoritative counts so
// it is deterministic, unit-testable, idempotent, and concurrency-safe BY
// CONSTRUCTION (a repeated or concurrent lifecycle action just lands rows that the
// next COUNT reflects exactly; there is no increment/decrement counter to lose).
//
// STRICT SEPARATION (never conflate):
//   • CURRENT BILLABLE QUANTITY  = active agents right now (derived, always known).
//   • EXPECTED PROVIDER QUANTITY = what WOULD be sent to the provider. For ≤10 it
//       equals current billable; for >10 it is UNAVAILABLE (custom review — we do
//       NOT compute 11×197 or auto-sync above the threshold).
//   • LAST SYNCED PROVIDER QUANTITY = what was actually sent. Persisting this needs
//       schema the current `subscriptions` table does NOT have, so in P8.2 it is
//       honestly UNAVAILABLE (NOT_SYNCED) — never faked. (P8.3 migration proposal.)
//
// Not connected to P7 enforcement. No real charge. No recurring billing.
// ============================================================================
import { COMMERCIAL_MODEL, commercialState, committedSeats } from "./model";
import type { BillingState } from "./billing-state";

// ── Availability (honest UNAVAILABLE, mirrors billing-compose) ───────────────
export type QAvailability<T> = { value: T; available: true } | { value: null; available: false; reason: string };
const qsome = <T>(value: T): QAvailability<T> => ({ value, available: true });
const qnone = (reason: string): QAvailability<never> => ({ value: null, available: false, reason });

// ── Provider synchronization status (DESIGN — no real sync in P8.2) ──────────
export type QuantitySyncStatus =
  | "NOT_CONFIGURED"          // no provider configured (env absent)
  | "NOT_SYNCED"              // provider configured, no sync has ever run (P8.2 default)
  | "SYNC_REQUIRED"           // expected != last-synced → a future sync is owed
  | "CUSTOM_REVIEW_REQUIRED"  // >10 agents → sync PAUSED pending commercial intervention
  | "SYNCED";                 // last-synced == expected (only reachable once P8.3 syncs)

// ── Per-billing-state disposition of a quantity change (spec §9) ─────────────
export type QuantityDisposition =
  | "ALLOWED"                 // change accepted and (eventually) provider-synced
  | "CALCULATED"             // change tracked in the expectation; no provider sync now
  | "PROVIDER_SYNC_PENDING"  // change tracked; a provider sync is owed (P8.3)
  | "IGNORED"                // change not acted on (e.g. cancelled/read-only)
  | "CUSTOM_REVIEW_REQUIRED"; // >10 — requires commercial review, never auto-synced

// How each canonical billing state treats a quantity change. Access enforcement
// is NOT connected; no state deletes data. Cancelled IGNORES provider sync.
export const QUANTITY_POLICY: Record<BillingState, QuantityDisposition> = {
  trialing: "CALCULATED",            // trial: track expectation, no charge/sync
  active: "PROVIDER_SYNC_PENDING",   // paid & current: a sync is owed (P8.3)
  payment_due: "CALCULATED",
  payment_failed: "CALCULATED",
  grace: "CALCULATED",
  cancel_pending: "CALCULATED",      // track until period end
  cancelled: "IGNORED",              // read-only; no provider sync; data preserved
  custom_pricing_required: "CUSTOM_REVIEW_REQUIRED",
};

export interface ProviderQuantityState {
  currentBillableQuantity: number;                      // derived, always known
  expectedProviderQuantity: QAvailability<number>;      // ≤10 → some; >10 → UNAVAILABLE
  lastSyncedProviderQuantity: QAvailability<number>;    // P8.2 → UNAVAILABLE (NOT_SYNCED)
  syncStatus: QuantitySyncStatus;
  configured: boolean;
}

export interface OrgBillingQuantity {
  organizationId: string;
  activeUsers: number;
  billableAgents: number;           // = activeUsers (owner incl.; pending/suspended/disabled excluded)
  pendingInvitations: number;       // valid 'pending' invites only
  reservedSeats: number;            // = activeUsers + pendingInvitations (committed seats)
  pricingMode: string;              // standard_per_agent | custom_pricing_required | trial
  unitPriceIls: number;             // 197
  expectedMonthlyIls: number | null; // COMMERCIAL EXPECTATION (agents×197); NULL when custom
  customPricingRequired: boolean;   // >10 active
  provider: ProviderQuantityState;
  disposition: QuantityDisposition; // how the current billing state treats a change
  source: string;                   // provenance of the counts
  isExpectationOnly: true;
  calculatedAt: string;
}

export interface QuantityComputeInput {
  orgId: string;
  activeUsers: number;
  pendingInvitations: number;
  isTrial: boolean;
  billingState: BillingState | null;
  providerConfigured: boolean;
  subscriptionIdPresent: boolean;
  /** What was last sent to the provider. NULL until a real sync persists it. */
  lastSyncedQuantity: number | null;
  source: string;
  calculatedAt: string;
}

/**
 * PURE canonical quantity resolver core. Derives every quantity/pricing/provider
 * field from authoritative counts. Reuses commercialState() so pricing is
 * identical to the P8.1 commercial resolver (no divergent math).
 */
export function computeOrgBillingQuantity(input: QuantityComputeInput): OrgBillingQuantity {
  const cs = commercialState({
    seats: { activeUsers: input.activeUsers, pendingInvites: input.pendingInvitations },
    isTrial: input.isTrial,
  });
  const billableAgents = cs.billableAgents;                 // = activeUsers
  const reservedSeats = committedSeats({ activeUsers: input.activeUsers, pendingInvites: input.pendingInvitations }); // active + pending
  const customPricingRequired = cs.customPricingRequired;

  // EXPECTED provider quantity: ≤10 → current billable; >10 → paused (custom review).
  const expectedProviderQuantity = customPricingRequired
    ? qnone("CUSTOM_PRICING_REQUIRED")
    : qsome(billableAgents);

  // LAST SYNCED provider quantity: needs persistence the schema lacks → UNAVAILABLE.
  const lastSyncedProviderQuantity = input.lastSyncedQuantity == null
    ? qnone("NOT_SYNCED")
    : qsome(input.lastSyncedQuantity);

  const syncStatus: QuantitySyncStatus = customPricingRequired
    ? "CUSTOM_REVIEW_REQUIRED"
    : !input.providerConfigured
      ? "NOT_CONFIGURED"
      : input.lastSyncedQuantity == null
        ? "NOT_SYNCED"
        : input.lastSyncedQuantity !== billableAgents
          ? "SYNC_REQUIRED"
          : "SYNCED";

  const disposition: QuantityDisposition = input.billingState
    ? QUANTITY_POLICY[input.billingState]
    : (customPricingRequired ? "CUSTOM_REVIEW_REQUIRED" : "CALCULATED");

  return {
    organizationId: input.orgId,
    activeUsers: input.activeUsers,
    billableAgents,
    pendingInvitations: input.pendingInvitations,
    reservedSeats,
    pricingMode: cs.pricingMode,
    unitPriceIls: COMMERCIAL_MODEL.pricePerAgentIls,
    expectedMonthlyIls: cs.standardMonthlyIls,
    customPricingRequired,
    provider: {
      currentBillableQuantity: billableAgents,
      expectedProviderQuantity,
      lastSyncedProviderQuantity,
      syncStatus,
      configured: input.providerConfigured,
    },
    disposition,
    source: input.source,
    isExpectationOnly: true,
    calculatedAt: input.calculatedAt,
  };
}

// ── Quantity event model (PURE data; NO email/token/payload/credentials) ─────
export type QuantityEventType =
  | "billing.quantity.changed"
  | "billing.quantity.sync_required"
  | "billing.custom_pricing.required";

export interface QuantityChangeEvent {
  type: QuantityEventType;
  organizationId: string;
  oldQuantity: number;
  newQuantity: number;
  reason: string;
  action: string;   // the logical lifecycle action (e.g. 'invite.accepted')
  at: string;
}

export interface QuantitySnapshot {
  billableAgents: number;
  reservedSeats: number;
  customPricingRequired: boolean;
}

/**
 * PURE derivation of the events a single logical action produces. Emits AT MOST
 * one billing.quantity.changed per real change. If nothing changed (a retry, a
 * duplicate accept/suspend, a no-op), returns [] — so replays are idempotent and
 * never duplicate events. sync_required is only emitted when a provider would be
 * synced (≤10, configured); >10 emits custom_pricing.required instead of sync.
 */
export function deriveQuantityEvents(
  before: QuantitySnapshot,
  after: QuantitySnapshot,
  ctx: { organizationId: string; action: string; at: string; providerConfigured: boolean },
): QuantityChangeEvent[] {
  const changed = before.billableAgents !== after.billableAgents || before.reservedSeats !== after.reservedSeats;
  if (!changed) return []; // idempotent: identical before/after → no event

  const events: QuantityChangeEvent[] = [];
  events.push({
    type: "billing.quantity.changed",
    organizationId: ctx.organizationId,
    oldQuantity: before.billableAgents,
    newQuantity: after.billableAgents,
    reason: "billable/reserved quantity changed",
    action: ctx.action,
    at: ctx.at,
  });

  if (!before.customPricingRequired && after.customPricingRequired) {
    // Crossed 10 → 11+. Provider sync PAUSES; commercial intervention required.
    events.push({
      type: "billing.custom_pricing.required",
      organizationId: ctx.organizationId,
      oldQuantity: before.billableAgents,
      newQuantity: after.billableAgents,
      reason: "active agents exceeded standard threshold (>10) — route to sales; do NOT auto 197×N",
      action: ctx.action,
      at: ctx.at,
    });
  } else if (!after.customPricingRequired && !before.customPricingRequired && ctx.providerConfigured) {
    // ≤10 on both sides and a provider exists → a future provider sync is owed
    // (P8.3 reconciler). A return FROM custom (before.custom=true) is deliberately
    // excluded here — that path is controlled (see the note below).
    events.push({
      type: "billing.quantity.sync_required",
      organizationId: ctx.organizationId,
      oldQuantity: before.billableAgents,
      newQuantity: after.billableAgents,
      reason: "billable quantity changed; provider sync owed (controlled — not auto-sent in P8.2)",
      action: ctx.action,
      at: ctx.at,
    });
  }
  // NOTE: custom→standard return (11→10) intentionally emits ONLY quantity.changed,
  // never an automatic sync_required — provider return from custom is a controlled
  // PRODUCT DECISION (see report §11), so we never silently re-arm provider billing.
  return events;
}
