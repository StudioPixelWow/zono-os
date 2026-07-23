// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — payment verification (PURE + crypto).
//
// THE most important rule in this batch, isolated and testable:
//   A ZONO account is NEVER activated because the browser returned from Grow.
//   Activation requires a payment that is BOTH status="paid" AND verified=true,
//   and `verified` is set only inside the signed webhook after an HMAC check.
//
// Mirrors the frozen WhatsApp Cloud webhook verification (HMAC-SHA256 over the
// RAW body + timing-safe compare + idempotency key) so the Grow webhook is
// verified the same proven way.
// ============================================================================
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Payment } from "./types";

/**
 * THE activation gate. Returns true ONLY for a verified, paid payment. Every
 * provisioning path funnels through this; a client redirect can never satisfy
 * it because `verified` is a server-set flag.
 */
export function canActivate(payment: Pick<Payment, "status" | "verified">): boolean {
  return payment.status === "paid" && payment.verified === true;
}

/** Compute the expected HMAC-SHA256 signature over the raw request body. */
export function computeSignature(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** Parse a `sha256=<hex>` (or bare hex) signature header. */
export function parseSignatureHeader(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^(?:sha256=)?([a-f0-9]{64})$/i);
  return m ? m[1].toLowerCase() : null;
}

/** Constant-time hex comparison. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); }
  catch { return false; }
}

/**
 * Verify a Grow webhook: the provided signature must match the HMAC of the raw
 * body under the shared secret. Returns false on any missing/malformed input —
 * fail closed, so an unverifiable callback NEVER verifies a payment.
 */
export function verifyWebhookSignature(secret: string | undefined | null, rawBody: string, header: string | null): boolean {
  if (!secret) return false;              // no secret configured ⇒ cannot verify ⇒ never activate
  const provided = parseSignatureHeader(header);
  if (!provided) return false;
  return timingSafeEqualHex(computeSignature(secret, rawBody), provided);
}

/** Idempotency / replay-protection key for a Grow transaction. */
export const paymentIdempotencyKey = (provider: string, txnId: string): string => `${provider}:${txnId}`;
