// ============================================================================
// ZONO — symmetric encryption for at-rest secrets (server-only).
// AES-256-GCM. Key derived (sha256) from ZONO_ENCRYPTION_KEY so any sufficiently
// long secret works. Ciphertext format: "v1:<base64(iv|authTag|ciphertext)>".
// Used to encrypt OAuth access tokens before writing them to the database.
// Never log plaintext or the key.
// ============================================================================
import "server-only";
import crypto from "node:crypto";

const PREFIX = "v1:";

export function isEncryptionConfigured(): boolean {
  const k = process.env.ZONO_ENCRYPTION_KEY;
  return !!k && k.trim().length >= 16;
}

function key(): Buffer {
  const raw = process.env.ZONO_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 16) {
    throw new Error("ZONO_ENCRYPTION_KEY is missing or too short (need ≥16 chars).");
  }
  // Derive a stable 32-byte key from whatever secret is provided.
  return crypto.createHash("sha256").update(raw.trim()).digest();
}

/** Encrypt a UTF-8 string. Returns "v1:<base64>". Throws if key not configured. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt a "v1:<base64>" string back to UTF-8. Throws on tamper/format error. */
export function decryptSecret(payload: string): string {
  if (!payload.startsWith(PREFIX)) throw new Error("Unrecognized ciphertext format.");
  const buf = Buffer.from(payload.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
