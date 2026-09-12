// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — Grow payment client (server).
//
// The payment page is NOT hosted by ZONO — the user is redirected to Grow. The
// Grow checkout URL + secret are SUPPLIED LATER (env). Until then this returns
// the internal pending status page, so the funnel is fully wired end-to-end and
// simply cannot complete a real payment yet — and therefore cannot activate
// anything. The webhook (verification.ts) is the only path that flips a payment
// to verified.
// ============================================================================
import "server-only";
import type { PlanTier } from "@/lib/launch/types";
import { growCreds, growCreatePaymentProcess } from "./grow-client";

export interface GrowRedirect { url: string; simulated: boolean }

/**
 * Create the Grow checkout for a /register draft and return the hosted URL.
 * SERVER-TO-SERVER: the price (`sum`) is sent directly to Grow's API and never
 * placed in a browser-followed URL, so the amount the user is charged cannot be
 * tampered with in transit. The paymentId is echoed (cField1) so the authoritative
 * webhook re-query can correlate the callback to our payment row; the webhook is
 * still the only path that activates anything, and it independently re-verifies
 * the charged amount against this server-computed price.
 */
export async function buildGrowRedirect(input: { paymentId: string; amountIls: number; planTier: PlanTier; email: string | null }): Promise<GrowRedirect> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const statusUrl = `${appUrl}/register/status?payment=${encodeURIComponent(input.paymentId)}`;
  const notifyUrl = `${appUrl}/api/payments/grow/webhook`;
  const pendingUrl = `/register/status?payment=${encodeURIComponent(input.paymentId)}`;

  // Grow not configured in this environment → stay on the internal pending page.
  // No real charge, no activation, no fake success.
  if (!growCreds().configured) return { url: pendingUrl, simulated: true };

  const res = await growCreatePaymentProcess({
    sum: input.amountIls,                     // server-computed; sent server-to-server only
    description: `ZONO · ${input.planTier}`,
    successUrl: statusUrl,
    cancelUrl: `${statusUrl}&cancelled=1`,
    notifyUrl,
    email: input.email,
    cField1: input.paymentId,                 // echoed back in the callback → correlates the payment
  });
  if (!res.ok || !res.data?.url) return { url: `${pendingUrl}&error=provider`, simulated: true };
  return { url: res.data.url, simulated: false };
}

/** The shared secret Grow signs its webhook with (server-only env). */
export const growWebhookSecret = (): string | undefined => process.env.GROW_WEBHOOK_SECRET;
