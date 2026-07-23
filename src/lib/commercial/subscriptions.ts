// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — subscription lifecycle (PURE).
//
// The commercial status machine (Part 4). Pure transitions + the platform-access
// rule. No I/O, no scoring. Storage lives in subscriptions.store.ts (server).
// ============================================================================
import type { SubscriptionStatus } from "./types";

/** Statuses that grant platform access. pending_payment / suspended / cancelled
 *  / expired do NOT — activation is a property of a VERIFIED payment, and access
 *  is a property of the subscription status, never a browser redirect. */
const ACCESS: SubscriptionStatus[] = ["active", "trial", "grace_period"];
export function canAccessPlatform(status: SubscriptionStatus): boolean {
  return ACCESS.includes(status);
}

/** Allowed status transitions. Anything not listed is rejected. */
const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial: ["pending_payment", "active", "expired", "cancelled"],
  pending_payment: ["active", "cancelled", "expired"],
  active: ["grace_period", "suspended", "cancelled", "expired"],
  grace_period: ["active", "suspended", "expired", "cancelled"],
  suspended: ["active", "cancelled", "expired"],
  cancelled: ["active"],            // reactivate
  expired: ["active"],              // reactivate via new payment
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return from === to || (TRANSITIONS[from]?.includes(to) ?? false);
}

/** The status a VERIFIED payment moves a subscription to. A verified paid
 *  payment always yields "active"; nothing else does. */
export function statusAfterVerifiedPayment(): SubscriptionStatus {
  return "active";
}

/** The status a FAILED / cancelled / expired payment yields — never active. */
export function statusAfterFailedPayment(current: SubscriptionStatus): SubscriptionStatus {
  // A brand-new registration whose payment failed has no active subscription.
  // An existing subscription whose renewal failed enters grace, then suspended.
  if (current === "active") return "grace_period";
  if (current === "grace_period") return "suspended";
  return "pending_payment";
}
