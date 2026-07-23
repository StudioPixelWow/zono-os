// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS PLATFORM OS — webhook hardening
// (server-only).
//
// Strengthens the EXISTING WhatsApp webhook (the frozen cloud/service already
// parses + persists + dedups by wa_message_id). This adds two production
// guarantees the batch requires:
//   · FAIL-CLOSED signature verification — reject when the app secret is missing
//     or the HMAC does not match (the incumbent verifier accepted when unset).
//   · EXACTLY-ONCE processing — a unique (phone_number_id, event_id) receipt
//     ledger, so a Meta retry is dropped atomically before any side effect.
// Pure signature helpers are reused from cloud/core.ts.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeSignature, parseSignatureHeader, timingSafeEqualHex } from "@/lib/whatsapp/cloud/core";

const RECEIPTS = "whatsapp_webhook_receipts";

/** The app secret used to verify Meta's X-Hub-Signature-256. */
export function webhookAppSecret(): string | null {
  return process.env.WHATSAPP_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || null;
}

/** The verify token Meta echoes on GET subscription. */
export function webhookVerifyToken(): string | null {
  return process.env.WHATSAPP_VERIFY_TOKEN?.trim() || null;
}

/**
 * FAIL-CLOSED signature verification. Returns true ONLY when a configured app
 * secret produces an HMAC matching the X-Hub-Signature-256 header over the RAW
 * body. No secret, no header, or a mismatch → false (reject).
 */
export function verifySignatureStrict(rawBody: string, header: string | null): boolean {
  const secret = webhookAppSecret();
  if (!secret) return false;                       // fail closed — never accept unverified
  const provided = parseSignatureHeader(header);
  if (!provided) return false;
  const expected = computeSignature(secret, rawBody);
  return timingSafeEqualHex(provided, expected);
}

/**
 * Record a webhook event exactly once. Returns true the FIRST time
 * (phone_number_id, event_id) is seen, false on any replay — atomically, via the
 * unique constraint. Callers process the event only when this returns true.
 */
export async function recordReceiptOnce(phoneNumberId: string | null, eventId: string, kind: "message" | "status"): Promise<boolean> {
  const db = createServiceRoleClient();
  const { error } = await db.from(RECEIPTS as never).insert({
    phone_number_id: phoneNumberId, event_id: eventId, event_kind: kind,
  } as never);
  return !error;                                   // unique violation ⇒ already processed
}
