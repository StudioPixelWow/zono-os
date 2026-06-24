// ============================================================================
// ZONO — Meta (Facebook) OAuth handshake (server-only).
// Implements ONLY the connection handshake: authorize URL, CSRF state sign/verify,
// code→token exchange, short→long-lived token exchange, identity fetch.
// No publishing, no WhatsApp send, no Lead Ads, no analytics. Minimal initial
// scope (connection discovery only). Tokens are returned to the caller, which
// encrypts them before storage — they are never logged or returned to the client.
// ============================================================================
import "server-only";
import crypto from "node:crypto";

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  configured: boolean;
  missing: string[];
}

/** Minimal scope needed just to establish the connection + read basic identity.
 *  Publishing / Pages / IG / Lead Ads / analytics scopes are requested in later
 *  phases (each behind its own Meta App Review). */
export const INITIAL_SCOPES = ["public_profile"];

const isReal = (v: string | undefined) => !!v && v.trim().length > 0;

/** Read + validate Meta OAuth env. `configured` is false (not a throw) when missing. */
export function getMetaOAuthConfig(): MetaOAuthConfig {
  const appId = process.env.META_APP_ID?.trim() ?? "";
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim() ?? "";
  const graphVersion = (process.env.META_GRAPH_VERSION?.trim() || "v21.0");
  const missing: string[] = [];
  if (!isReal(appId)) missing.push("META_APP_ID");
  if (!isReal(appSecret)) missing.push("META_APP_SECRET");
  if (!isReal(redirectUri)) missing.push("META_OAUTH_REDIRECT_URI");
  if (!isReal(process.env.META_GRAPH_VERSION)) missing.push("META_GRAPH_VERSION");
  return { appId, appSecret, redirectUri, graphVersion, configured: missing.length === 0, missing };
}

const graph = (cfg: MetaOAuthConfig, path: string) => `https://graph.facebook.com/${cfg.graphVersion}${path}`;

// ── CSRF state (HMAC-signed, no DB needed; paired with an httpOnly cookie) ────
interface StatePayload { orgId: string; userId: string; nonce: string; exp: number }

function b64url(buf: Buffer): string { return buf.toString("base64url"); }
function hmac(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

/** Build a signed state string + the nonce to store in an httpOnly cookie. */
export function createSignedState(orgId: string, userId: string, secret: string): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload: StatePayload = { orgId, userId, nonce, exp: Date.now() + 10 * 60 * 1000 };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = hmac(body, secret);
  return { state: `${body}.${sig}`, nonce };
}

/** Verify signature + expiry + nonce match. Returns payload or null (never throws on bad input). */
export function verifySignedState(state: string, cookieNonce: string, secret: string): StatePayload | null {
  try {
    const [body, sig] = state.split(".");
    if (!body || !sig) return null;
    const expected = hmac(body, secret);
    // constant-time compare
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

/** The Facebook Login dialog URL to redirect the user to. */
export function buildAuthorizeUrl(cfg: MetaOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    state,
    scope: INITIAL_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/${cfg.graphVersion}/dialog/oauth?${params.toString()}`;
}

export interface TokenResult { accessToken: string; expiresInSec: number | null }

/** Exchange the authorization code for a (short-lived) user access token. */
export async function exchangeCodeForToken(cfg: MetaOAuthConfig, code: string): Promise<TokenResult> {
  const url = graph(cfg, "/oauth/access_token") + "?" + new URLSearchParams({
    client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: cfg.redirectUri, code,
  }).toString();
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || !json.access_token) throw new Error(json.error?.message || "code exchange failed");
  return { accessToken: json.access_token, expiresInSec: json.expires_in ?? null };
}

/** Exchange a short-lived token for a long-lived one (best-effort; returns input on failure). */
export async function exchangeForLongLived(cfg: MetaOAuthConfig, shortToken: string): Promise<TokenResult> {
  const url = graph(cfg, "/oauth/access_token") + "?" + new URLSearchParams({
    grant_type: "fb_exchange_token", client_id: cfg.appId, client_secret: cfg.appSecret, fb_exchange_token: shortToken,
  }).toString();
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) return { accessToken: shortToken, expiresInSec: null };
  return { accessToken: json.access_token, expiresInSec: json.expires_in ?? null };
}

export interface MetaIdentity { id: string; name: string }

/** Fetch the connected user's basic identity (id + name only). */
export async function fetchIdentity(cfg: MetaOAuthConfig, accessToken: string): Promise<MetaIdentity> {
  const url = graph(cfg, "/me") + "?" + new URLSearchParams({ fields: "id,name", access_token: accessToken }).toString();
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json()) as { id?: string; name?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message || "identity fetch failed");
  return { id: json.id, name: json.name ?? "Meta user" };
}
