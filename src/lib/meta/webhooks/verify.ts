// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · WEBHOOK VERIFICATION (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Trusted Meta webhook verification, done BEFORE any trusted field is parsed.
// The subscription challenge is answered only when the verify token matches; a
// signed delivery is accepted only when the HMAC-SHA256 over the EXACT raw bytes
// matches, compared in CONSTANT TIME. Oversized bodies, wrong content types, and
// malformed signature headers are rejected safely. The raw body is never logged;
// the app secret and the signature value are never returned or stored. These
// functions are pure (secret + bytes + now in → verdict out) so QA drives them
// offline. Replay is additionally defended by deterministic dedup downstream.
// ============================================================================
import { createHmac, timingSafeEqual } from "node:crypto";

/** Bounded max webhook body (defends against unbounded parsing / abuse). */
export const MAX_WEBHOOK_BODY_BYTES = 1_048_576; // 1 MiB
/** Freshness window when a trusted provider timestamp is available (ms). */
export const MAX_WEBHOOK_AGE_MS = 10 * 60_000;

export type VerifyReason =
  | "valid" | "bad_signature" | "missing_signature" | "malformed_signature"
  | "oversized" | "bad_content_type" | "stale" | "empty_body";

export interface SignatureVerification { ok: boolean; reason: VerifyReason }

/** Subscription verification challenge (GET hub.* params). */
export function verifyChallenge(params: { mode: string | null; verifyToken: string | null; challenge: string | null }, expectedToken: string | null): { ok: boolean; challenge: string | null } {
  if (!expectedToken) return { ok: false, challenge: null };
  if (params.mode === "subscribe" && params.verifyToken && constantTimeEqualStr(params.verifyToken, expectedToken)) {
    return { ok: true, challenge: params.challenge ?? "" };
  }
  return { ok: false, challenge: null };
}

/** Constant-time string comparison (length-guarded). */
export function constantTimeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8"), bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try { return timingSafeEqual(ba, bb); } catch { return false; }
}

/** Parse a `sha256=<hex>` header into its hex digest (null if malformed). */
export function parseSignatureHeader(header: string | null): string | null {
  if (!header) return null;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Verify a signed delivery over the EXACT raw bytes. `rawBody` must be the
 * untouched request body (string or Buffer). Never logs the body/secret/signature.
 */
export function verifySignature(rawBody: string | Buffer, signatureHeader: string | null, appSecret: string, opts?: { contentType?: string | null; providerTimestampMs?: number | null; nowMs?: number }): SignatureVerification {
  const bytes = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  if (opts?.contentType != null && !/application\/json/i.test(opts.contentType)) return { ok: false, reason: "bad_content_type" };
  if (bytes.length === 0) return { ok: false, reason: "empty_body" };
  if (bytes.length > MAX_WEBHOOK_BODY_BYTES) return { ok: false, reason: "oversized" };
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };
  const provided = parseSignatureHeader(signatureHeader);
  if (!provided) return { ok: false, reason: "malformed_signature" };
  if (opts?.providerTimestampMs != null && opts.nowMs != null && Math.abs(opts.nowMs - opts.providerTimestampMs) > MAX_WEBHOOK_AGE_MS) return { ok: false, reason: "stale" };
  const expected = createHmac("sha256", appSecret).update(bytes).digest("hex");
  const a = Buffer.from(provided, "hex"), b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return { ok: false, reason: "bad_signature" };
  let ok = false;
  try { ok = timingSafeEqual(a, b); } catch { ok = false; }
  return ok ? { ok: true, reason: "valid" } : { ok: false, reason: "bad_signature" };
}

/** Dual-secret verification (secret rotation): accept if EITHER secret matches. */
export function verifySignatureDualSecret(rawBody: string | Buffer, signatureHeader: string | null, secrets: readonly string[], opts?: { contentType?: string | null; providerTimestampMs?: number | null; nowMs?: number }): SignatureVerification {
  let last: SignatureVerification = { ok: false, reason: "missing_signature" };
  for (const s of secrets.filter(Boolean)) {
    last = verifySignature(rawBody, signatureHeader, s, opts);
    if (last.ok) return last;
  }
  return last;
}
