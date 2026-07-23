// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — token store + lifecycle (server-only).
//
// The ONE place Google tokens live. Reads/writes google_connections through the
// SERVICE ROLE only. Tokens are encrypted at rest (AES-256-GCM, reused from
// src/lib/security/crypto) and decrypted here, in memory, only to make an API
// call. A valid access token is produced on demand: refresh + rotate when
// expired; on invalid_grant the connection flips to `revoked`/`expired` and NO
// call proceeds. Nothing here is ever logged or returned to the browser (Part 7).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "@/lib/security/crypto";
import { getGoogleOAuthConfig, refreshAccessToken } from "./oauth";
import type { GoogleConnection, GoogleConnectionPublic, GoogleConnectionStatus, GoogleHealth } from "./types";

const TABLE = "google_connections";

interface Row {
  id: string; org_id: string; user_id: string; google_sub: string | null; email: string | null;
  display_name: string | null; scopes: string[] | null; access_token_encrypted: string | null;
  refresh_token_encrypted: string | null; token_expires_at: string | null; status: string;
  last_sync_at: string | null; last_error: string | null; metadata: Record<string, unknown> | null;
}

function toConnection(r: Row): GoogleConnection {
  return {
    id: r.id, orgId: r.org_id, userId: r.user_id, googleSub: r.google_sub, email: r.email,
    displayName: r.display_name, scopes: r.scopes ?? [], accessTokenEncrypted: r.access_token_encrypted,
    refreshTokenEncrypted: r.refresh_token_encrypted, tokenExpiresAt: r.token_expires_at,
    status: (r.status as GoogleConnectionStatus) ?? "disconnected", lastSyncAt: r.last_sync_at,
    lastError: r.last_error, metadata: r.metadata ?? {},
  };
}

/** The current session's identity (org + auth user). Null when unauthenticated. */
export async function currentIdentity(): Promise<{ orgId: string; userId: string } | null> {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id };
}

/** Load the connection for a specific (org,user). Service-role. */
export async function getConnectionFor(orgId: string, userId: string): Promise<GoogleConnection | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from(TABLE as never).select("*").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  return data ? toConnection(data as unknown as Row) : null;
}

/** Load the current session user's connection. */
export async function getMyConnection(): Promise<GoogleConnection | null> {
  const id = await currentIdentity();
  if (!id) return null;
  return getConnectionFor(id.orgId, id.userId);
}

/** Persist a freshly-authorized connection (called from the OAuth callback with
 *  a verified org/user). Encrypts tokens before write. Upsert on (org,user). */
export async function upsertConnectionTokens(input: {
  orgId: string; userId: string; googleSub: string | null; email: string | null; displayName: string | null;
  scopes: string[]; accessToken: string; refreshToken: string | null; expiresInSec: number | null;
}): Promise<void> {
  if (!isEncryptionConfigured()) throw new Error("ZONO_ENCRYPTION_KEY not configured — refusing to store tokens in plaintext.");
  const db = createServiceRoleClient();
  const expiresAt = input.expiresInSec ? new Date(Date.now() + input.expiresInSec * 1000).toISOString() : null;
  // Preserve an existing refresh token if Google didn't return a new one.
  const existing = await getConnectionFor(input.orgId, input.userId);
  const refreshEnc = input.refreshToken ? encryptSecret(input.refreshToken) : existing?.refreshTokenEncrypted ?? null;
  await db.from(TABLE as never).upsert({
    org_id: input.orgId, user_id: input.userId, google_sub: input.googleSub, email: input.email,
    display_name: input.displayName, scopes: input.scopes, access_token_encrypted: encryptSecret(input.accessToken),
    refresh_token_encrypted: refreshEnc, token_expires_at: expiresAt, status: "connected", last_error: null,
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "org_id,user_id" } as never);
}

/** Update just the connection status/health fields. Service-role. */
export async function setConnectionStatus(connectionId: string, status: GoogleConnectionStatus, lastError?: string | null): Promise<void> {
  const db = createServiceRoleClient();
  await db.from(TABLE as never).update({ status, last_error: lastError ?? null } as never).eq("id", connectionId);
}

/** Stamp a successful sync. */
export async function markSynced(connectionId: string): Promise<void> {
  const db = createServiceRoleClient();
  await db.from(TABLE as never).update({ status: "connected", last_sync_at: new Date().toISOString(), last_error: null } as never).eq("id", connectionId);
}

/** Clear tokens on disconnect (keeps the row as an audit trail, status disconnected). */
export async function clearConnectionTokens(connectionId: string, status: GoogleConnectionStatus = "disconnected"): Promise<void> {
  const db = createServiceRoleClient();
  await db.from(TABLE as never).update({
    access_token_encrypted: null, refresh_token_encrypted: null, token_expires_at: null, status,
  } as never).eq("id", connectionId);
}

/** Decrypt the refresh token (server-only, in-memory). */
export function decryptRefreshToken(conn: GoogleConnection): string | null {
  if (!conn.refreshTokenEncrypted) return null;
  try { return decryptSecret(conn.refreshTokenEncrypted); } catch { return null; }
}

const EXPIRY_SKEW_MS = 60_000;   // refresh 60s before actual expiry

/**
 * Produce a VALID access token for a connection, refreshing + rotating when
 * needed. Returns null (and flips the connection state) when the connection
 * cannot make live calls — callers then degrade honestly to empty results.
 */
export async function getValidAccessToken(conn: GoogleConnection): Promise<string | null> {
  const cfg = getGoogleOAuthConfig();
  if (!cfg.configured) return null;

  const notExpired = conn.tokenExpiresAt && (Date.parse(conn.tokenExpiresAt) - EXPIRY_SKEW_MS > Date.now());
  if (conn.accessTokenEncrypted && notExpired && (conn.status === "connected" || conn.status === "syncing")) {
    try { return decryptSecret(conn.accessTokenEncrypted); } catch { /* fall through to refresh */ }
  }

  const refresh = decryptRefreshToken(conn);
  if (!refresh) { await setConnectionStatus(conn.id, "expired", "no refresh token"); return null; }

  try {
    const t = await refreshAccessToken(cfg, refresh);
    const db = createServiceRoleClient();
    const expiresAt = t.expiresInSec ? new Date(Date.now() + t.expiresInSec * 1000).toISOString() : null;
    await db.from(TABLE as never).update({
      access_token_encrypted: encryptSecret(t.accessToken),
      // token rotation: only overwrite the refresh token if Google issued a new one
      ...(t.refreshToken ? { refresh_token_encrypted: encryptSecret(t.refreshToken) } : {}),
      token_expires_at: expiresAt, status: "connected", last_error: null,
    } as never).eq("id", conn.id);
    return t.accessToken;
  } catch (e) {
    const code = (e as { code?: string }).code;
    // invalid_grant ⇒ user revoked access or the refresh token is dead.
    const next: GoogleConnectionStatus = code === "invalid_grant" ? "revoked" : "expired";
    await setConnectionStatus(conn.id, next, "refresh failed");
    return null;
  }
}

// ── Health projection (Part 1/8) ──────────────────────────────────────────────
export function healthFor(status: GoogleConnectionStatus | null): GoogleHealth {
  switch (status) {
    case "connected": return "healthy";
    case "syncing": return "syncing";
    case "permission_missing": return "permission_missing";
    case "expired":
    case "revoked": return "needs_reconnect";
    default: return "not_connected";
  }
}

/** The browser-safe projection — NEVER includes any token field. */
export function toPublic(conn: GoogleConnection | null): GoogleConnectionPublic {
  if (!conn) {
    return { connected: false, status: "disconnected", email: null, displayName: null, scopes: [], lastSyncAt: null, tokenExpiresAt: null, health: "not_connected" };
  }
  return {
    connected: conn.status === "connected" || conn.status === "syncing",
    status: conn.status, email: conn.email, displayName: conn.displayName, scopes: conn.scopes,
    lastSyncAt: conn.lastSyncAt, tokenExpiresAt: conn.tokenExpiresAt, health: healthFor(conn.status),
  };
}
