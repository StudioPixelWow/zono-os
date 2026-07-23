// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — OAuth handshake (server-only).
//
// Per-user Google OAuth (confidential server-side client). Implements ONLY the
// handshake: config, least-privilege scopes, PKCE (S256) + HMAC-signed CSRF
// state, authorize URL, code→token exchange, refresh, and revoke. Tokens are
// RETURNED to the caller, which encrypts them before storage — they are NEVER
// logged and NEVER returned to the browser (Part 7).
//
// House style mirrors src/lib/distribution/meta-oauth.ts (raw fetch, signed
// state + httpOnly nonce cookie) and ADDS PKCE as the spec requires.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import type { GoogleOAuthConfig, GoogleTokenSet, GoogleUserInfo } from "./types";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

/** Least-privilege scopes (Part 7). Calendar events R/W + calendar list read,
 *  Gmail read/send/modify, Contacts READ-ONLY, plus OIDC identity. Google Meet
 *  links are created THROUGH the Calendar scope (conferenceData) — no extra
 *  scope. Nothing broader than the six features requires is requested. */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",   // create/update/delete events + Meet
  "https://www.googleapis.com/auth/calendar.readonly",  // list calendars + read events
  "https://www.googleapis.com/auth/gmail.readonly",     // read threads/messages
  "https://www.googleapis.com/auth/gmail.send",         // send + reply
  "https://www.googleapis.com/auth/gmail.modify",       // mark read/unread
  "https://www.googleapis.com/auth/contacts.readonly",  // contacts (READ ONLY)
] as const;

const isReal = (v: string | undefined) => !!v && v.trim().length > 0;

/** Read + validate Google OAuth env. Never throws. `ready` (configured &&
 *  enabled) is the ONLY state in which we redirect the user to Google. */
export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const env = (...keys: string[]): string => { for (const k of keys) { const v = process.env[k]?.trim(); if (v) return v; } return ""; };
  const clientId = env("GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET");
  const redirectUri = env("GOOGLE_OAUTH_REDIRECT_URI", "GOOGLE_REDIRECT_URI");
  const missing: string[] = [];
  if (!isReal(clientId)) missing.push("GOOGLE_CLIENT_ID");
  if (!isReal(clientSecret)) missing.push("GOOGLE_CLIENT_SECRET");
  if (!isReal(redirectUri)) missing.push("GOOGLE_OAUTH_REDIRECT_URI");
  const configured = missing.length === 0;
  const enabledFlag = env("GOOGLE_OAUTH_ENABLED", "GOOGLE_OAUTH_LIVE").toLowerCase();
  const enabled = enabledFlag === "true" || enabledFlag === "1";
  return { clientId, clientSecret, redirectUri, configured, enabled, ready: configured && enabled, missing };
}

// ── PKCE (S256) ───────────────────────────────────────────────────────────────
export interface PkcePair { verifier: string; challenge: string }

/** Generate a PKCE verifier + S256 challenge. The verifier is stored in an
 *  httpOnly cookie and NEVER leaves the server except at token exchange. */
export function createPkcePair(): PkcePair {
  const verifier = crypto.randomBytes(32).toString("base64url");           // 43+ chars, unreserved
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ── CSRF state (HMAC-signed; paired with an httpOnly nonce cookie) ────────────
interface StatePayload { orgId: string; userId: string; nonce: string; exp: number }

function b64url(buf: Buffer): string { return buf.toString("base64url"); }
function hmac(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSignedState(orgId: string, userId: string, secret: string): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload: StatePayload = { orgId, userId, nonce, exp: Date.now() + 10 * 60 * 1000 };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = hmac(body, secret);
  return { state: `${body}.${sig}`, nonce };
}

/** Verify signature + expiry + nonce match. Never throws on bad input. */
export function verifySignedState(state: string, cookieNonce: string, secret: string): StatePayload | null {
  try {
    const [body, sig] = state.split(".");
    if (!body || !sig) return null;
    const expected = hmac(body, secret);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (!payload.nonce || payload.nonce !== cookieNonce) return null;
    if (!payload.orgId || !payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}

/** The state-signing secret. Reuses the encryption key material (server-only). */
export function stateSecret(): string {
  return process.env.GOOGLE_OAUTH_STATE_SECRET?.trim()
    || process.env.ZONO_ENCRYPTION_KEY?.trim()
    || "zono-google-oauth-state";
}

/** Build the Google consent URL. offline access + prompt=consent guarantees a
 *  refresh token; PKCE S256 + signed state harden the handshake. */
export function buildAuthorizeUrl(cfg: GoogleOAuthConfig, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",                 // → refresh token
    include_granted_scopes: "true",
    prompt: "consent",                      // force refresh token issuance on reconnect
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchange the authorization code (+ PKCE verifier) for a token set. */
export async function exchangeCodeForToken(cfg: GoogleOAuthConfig, code: string, verifier: string): Promise<GoogleTokenSet> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const json = (await res.json()) as {
    access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    // error/error_description are safe to surface — they never contain a token.
    throw new Error([json.error, json.error_description].filter(Boolean).join(": ") || `google code exchange failed (http ${res.status})`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresInSec: json.expires_in ?? null,
    scope: json.scope ?? null,
    idToken: json.id_token ?? null,
  };
}

/** Refresh an access token (token rotation — a rotated refresh token is stored
 *  by the caller when Google returns one). */
export async function refreshAccessToken(cfg: GoogleOAuthConfig, refreshToken: string): Promise<GoogleTokenSet> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const json = (await res.json()) as {
    access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const err = new Error(json.error_description || json.error || "google token refresh failed") as Error & { code?: string };
    err.code = json.error || "refresh_failed";     // "invalid_grant" ⇒ revoked/expired
    throw err;
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,       // usually absent; store if present (rotation)
    expiresInSec: json.expires_in ?? null,
    scope: json.scope ?? null,
    idToken: null,
  };
}

/** Revoke a token at Google (Part 7 — token revocation on disconnect). Best
 *  effort: a 200 or an already-invalid token both count as revoked. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok || res.status === 400;            // 400 = already invalid → effectively revoked
  } catch {
    return false;
  }
}

/** Fetch the connected account identity (sub/email/name only). */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(USERINFO_ENDPOINT, { headers: { authorization: `Bearer ${accessToken}` } });
  const json = (await res.json()) as { sub?: string; email?: string; name?: string; error?: string; error_description?: string };
  if (!res.ok || !json.sub) throw new Error([json.error, json.error_description].filter(Boolean).join(": ") || `google userinfo failed (http ${res.status})`);
  return { sub: json.sub, email: json.email ?? null, name: json.name ?? null };
}
