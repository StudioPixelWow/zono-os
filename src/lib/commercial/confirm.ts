// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — payment confirmation (server).
//
// The ONE server path that turns a Grow callback into an activated account. It
// verifies (already done by the caller), marks the payment paid+verified, then
// provisions — strictly through the canActivate gate. Idempotent and fail-closed.
// ============================================================================
import "server-only";
import { getPayment, markPaymentVerified, getDraftById, setPaymentStatus } from "./store";
import { provisionFromVerifiedPayment } from "./provisioning";
import { canActivate } from "./verification";
import type { PaymentStatus } from "./types";

export interface ConfirmResult { ok: boolean; orgId?: string; reason?: string }

/** Called by the signed webhook AFTER signature verification. Marks the payment
 *  verified and provisions the account. */
export async function confirmVerifiedGrowPayment(input: {
  paymentId: string; providerTxnId: string; signature: string; rawPayload: unknown;
}): Promise<ConfirmResult> {
  const payment = await getPayment(input.paymentId);
  if (!payment) return { ok: false, reason: "payment_not_found" };
  if (payment.orgId) return { ok: true, orgId: payment.orgId };   // already activated (idempotent)

  const verified = await markPaymentVerified(input.paymentId, input.providerTxnId, input.signature, input.rawPayload);
  if (!verified || !canActivate(verified)) return { ok: false, reason: "verification_failed" };

  const draft = verified.draftId ? await getDraftById(verified.draftId) : null;
  if (!draft) return { ok: false, reason: "draft_not_found" };

  return provisionFromVerifiedPayment(verified, draft);
}

/** Record a non-paid terminal payment outcome (failed/cancelled/expired). Never
 *  activates anything — the registration draft is kept for retry. */
export async function recordGrowFailure(paymentId: string, status: Extract<PaymentStatus, "failed" | "cancelled" | "expired">): Promise<void> {
  await setPaymentStatus(paymentId, status);
}
