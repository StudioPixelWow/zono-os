// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — draft secret crypto (server).
//
// The owner's chosen password must survive from the registration step until the
// verified-payment webhook provisions the account — but it must NEVER be stored
// in plaintext (Part 8 · registration draft security). It is encrypted with
// AES-256-GCM under a server-only key (derived from the service-role key, so no
// new env var is required) and decrypted exactly once, inside provisioning.
// ============================================================================
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { supabaseServiceRoleKey } from "@/lib/supabase/env";

function key(): Buffer {
  // Prefer an explicit key; otherwise derive a stable 32-byte key from the
  // service-role secret (always present server-side). Never leaves the server.
  const explicit = process.env.COMMERCIAL_SECRET_KEY;
  const material = explicit && explicit.length >= 16 ? explicit : supabaseServiceRoleKey();
  return scryptSync(material, "zono-commercial-draft-v1", 32);
}

/** Encrypt a secret → "ivHex:tagHex:cipherHex". */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Decrypt "ivHex:tagHex:cipherHex" → the secret. Throws on tamper/format. */
export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("bad ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
