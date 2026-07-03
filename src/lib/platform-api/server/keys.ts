// ============================================================================
// 🔌 Platform API — key generation + verification (server-only). 31.0. Part 5.
// Plaintext format: zk_<publicId>_<secret>. Only the sha256 of <secret> is
// stored; the plaintext is returned once at creation. Constant-time compare.
// ============================================================================
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface GeneratedKey { publicId: string; secret: string; plaintext: string; secretHash: string; prefix: string }

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function generateApiKey(): GeneratedKey {
  const publicId = randomBytes(6).toString("hex");   // 12 chars
  const secret = randomBytes(24).toString("hex");    // 48 chars
  const plaintext = `zk_${publicId}_${secret}`;
  return { publicId, secret, plaintext, secretHash: sha256(secret), prefix: `zk_${publicId}` };
}

/** Parse a bearer token → { publicId, secret } or null. */
export function parseBearer(token: string | null | undefined): { publicId: string; secret: string } | null {
  if (!token) return null;
  const t = token.replace(/^Bearer\s+/i, "").trim();
  const m = /^zk_([0-9a-f]{6,})_([0-9a-f]{16,})$/i.exec(t);
  return m ? { publicId: m[1], secret: m[2] } : null;
}

export function verifySecret(secret: string, storedHash: string): boolean {
  const a = Buffer.from(sha256(secret), "utf8");
  const b = Buffer.from(storedHash, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const hashSecret = sha256;
