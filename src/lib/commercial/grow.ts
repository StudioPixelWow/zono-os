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

export interface GrowRedirect { url: string; simulated: boolean }

/** Build the redirect to Grow's hosted payment page (or the internal pending
 *  page until Grow is configured). The paymentId is echoed back so the signed
 *  webhook can match the callback to our payment row. */
export function buildGrowRedirect(input: { paymentId: string; amountIls: number; planTier: PlanTier; email: string | null }): GrowRedirect {
  const base = process.env.GROW_CHECKOUT_URL;                 // supplied later
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const statusUrl = `${appUrl}/register/status?payment=${encodeURIComponent(input.paymentId)}`;

  if (!base) {
    // Grow not configured — stay on the internal pending status page. No real
    // charge, no activation.
    return { url: `/register/status?payment=${encodeURIComponent(input.paymentId)}`, simulated: true };
  }

  const u = new URL(base);
  u.searchParams.set("sum", String(input.amountIls));
  u.searchParams.set("description", `ZONO · ${input.planTier}`);
  u.searchParams.set("pageField[email]", input.email ?? "");
  u.searchParams.set("cField1", input.paymentId);             // echoed in the webhook payload
  u.searchParams.set("successUrl", statusUrl);
  u.searchParams.set("cancelUrl", `${statusUrl}&cancelled=1`);
  return { url: u.toString(), simulated: false };
}

/** The shared secret Grow signs its webhook with (server-only env). */
export const growWebhookSecret = (): string | undefined => process.env.GROW_WEBHOOK_SECRET;
