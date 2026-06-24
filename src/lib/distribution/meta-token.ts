// ============================================================================
// ZONO — Shared Meta TOKEN service (Phase 19, server-only).
// ----------------------------------------------------------------------------
// Single safe entry point to obtain the connected Facebook user access token.
//   - loads the canonical connection (distribution_provider_connections, facebook)
//   - decrypts access_token_encrypted SERVER-SIDE only
//   - returns a discriminated result with clear error reasons
// The token NEVER leaves the server, is NEVER logged, and is NEVER returned to a
// client. Callers receive { ok, token } only on the server.
// ============================================================================
import "server-only";
import { decryptSecret, isEncryptionConfigured } from "@/lib/security/crypto";
import { getMetaOAuthConfig, type MetaOAuthConfig } from "./meta-oauth";
import { providerConnectionRepository } from "./provider-connections";

export type MetaTokenErrorReason = "not_connected" | "expired" | "missing_permission" | "graph_error" | "config";

export type MetaTokenResult =
  | { ok: true; token: string; cfg: MetaOAuthConfig }
  | { ok: false; reason: MetaTokenErrorReason; message: string };

/** Load + decrypt the connected Facebook user token. Never logs/returns the token to client. */
export async function loadConnectedMetaToken(): Promise<MetaTokenResult> {
  const cfg = getMetaOAuthConfig();
  if (!cfg.configured) return { ok: false, reason: "config", message: "הגדרות Meta חסרות." };
  if (!isEncryptionConfigured()) return { ok: false, reason: "config", message: "הצפנה אינה מוגדרת בשרת." };

  const conn = await providerConnectionRepository.getProviderConnection("facebook");
  if (!conn || conn.status !== "connected" || !conn.access_token_encrypted) {
    return { ok: false, reason: "not_connected", message: "Meta אינו מחובר. חבר תחילה את חשבון Meta." };
  }
  // Honest expiry check against the stored expiry timestamp (if present).
  if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired", message: "תוקף החיבור פג. יש להתחבר מחדש ל-Meta." };
  }
  try {
    const token = decryptSecret(conn.access_token_encrypted);
    return { ok: true, token, cfg };
  } catch {
    return { ok: false, reason: "config", message: "פענוח הטוקן נכשל." };
  }
}
