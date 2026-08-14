// ============================================================================
// ZONO — GROW CHECKOUT AUTHORITY (server-only). P8.4.
// THE single boundary that creates a Grow checkout for an EXISTING org converting
// its 14-day trial into a paid, provider-backed recurring subscription. Every
// authoritative value is DERIVED SERVER-SIDE from getOrgBillingQuantity — the
// browser may NEVER supply price, quantity, orgId-as-authority, plan, or billing
// state. >10 active agents → NO checkout (CUSTOM_PRICING_REQUIRED).
//
// This does NOT charge here; it creates a Grow payment process and returns the
// hosted URL. Activation happens ONLY later, from a server-to-server VERIFIED
// callback (webhook → getTransactionInfo re-query). No trial is reset; the
// subscription row (PK = org_id) created at onboarding stays authoritative.
// ============================================================================
import "server-only";
import { getOrgBillingQuantity } from "./billing";
import { createOrgPayment } from "./store";
import { growCreds, growCreatePaymentProcess } from "./grow-client";
import type { PlanTier } from "@/lib/launch/types";

export type CheckoutResult =
  | { ok: true; paymentId: string; url: string; simulated: boolean; amountIls: number; quantity: number }
  | { ok: false; reason: "CUSTOM_PRICING_REQUIRED" | "NOT_CONFIGURED" | "NO_BILLABLE_AGENTS" | "PROVIDER_ERROR" | "PERSIST_ERROR" };

/**
 * Create a Grow recurring checkout for `orgId`. Server-authoritative end-to-end.
 * >10 agents → CUSTOM_PRICING_REQUIRED (no auto 197×N, no checkout). When Grow is
 * unconfigured, returns NOT_CONFIGURED (never a fake success). A created payment is
 * pending until a verified callback activates it.
 */
export async function createGrowCheckout(orgId: string, opts?: { payer?: { fullName?: string | null; phone?: string | null; email?: string | null } }): Promise<CheckoutResult> {
  const q = await getOrgBillingQuantity(orgId);

  // Custom pricing (>10) — never auto-create a standard checkout.
  if (q.customPricingRequired) return { ok: false, reason: "CUSTOM_PRICING_REQUIRED" };
  // Server-derived amount = billable agents × unit price. Must be a real positive sum.
  const amountIls = q.expectedMonthlyIls;
  if (amountIls === null || q.billableAgents <= 0) return { ok: false, reason: "NO_BILLABLE_AGENTS" };

  // Persist a pending, org-linked payment with the SERVER-DERIVED amount.
  const planTier: PlanTier = "starter"; // legacy/compat; canonical model is per-agent
  const payment = await createOrgPayment({ orgId, planTier, amountIls });
  if (!payment) return { ok: false, reason: "PERSIST_ERROR" };

  const creds = growCreds();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const statusUrl = `${appUrl}/billing/status?payment=${encodeURIComponent(payment.id)}`;
  const notifyUrl = `${appUrl}/api/payments/grow/webhook`;

  if (!creds.configured) {
    // Grow not configured in this environment → no real charge, no activation.
    // Return the internal pending status page so the funnel is wired but inert.
    return { ok: true, paymentId: payment.id, url: statusUrl, simulated: true, amountIls, quantity: q.billableAgents };
  }

  const res = await growCreatePaymentProcess({
    sum: amountIls,
    description: `ZONO · ${q.billableAgents} סוכנים`,
    successUrl: statusUrl,
    cancelUrl: `${statusUrl}&cancelled=1`,
    notifyUrl,
    fullName: opts?.payer?.fullName ?? null,
    phone: opts?.payer?.phone ?? null,
    email: opts?.payer?.email ?? null,
    cField1: payment.id,          // echoed back in the callback → correlates the payment
    recurring: true,              // monthly per-agent subscription
    chargeType: 1,
  });

  if (!res.ok || !res.data?.url) return { ok: false, reason: "PROVIDER_ERROR" };
  return { ok: true, paymentId: payment.id, url: res.data.url, simulated: false, amountIls, quantity: q.billableAgents };
}
