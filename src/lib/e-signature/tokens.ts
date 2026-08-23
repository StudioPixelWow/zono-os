// ============================================================================
// ZONO — Internal Remote E-Signature: secure signing-link tokens.
// The raw token is a cryptographically-random 256-bit value that appears ONLY in
// the outbound signing URL. We persist sha256(token) and look up by that hash, so
// a DB read never exposes a usable token. Comparison is timing-safe.
// ============================================================================
import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/** Generate a new signing token: { raw } goes in the URL, { hash } is persisted. */
export function generateSigningToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** sha256 hex of a raw token. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Timing-safe equality of two hex hashes (defends against token-guessing timing). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/** sha256 hex of arbitrary content (document / signed-artifact hashing). */
export function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
