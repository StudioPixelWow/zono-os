// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS PLATFORM OS — Meta OAuth / Embedded
// Signup (server-only).
//
// Per-ORG WhatsApp Business connection. Mirrors the proven Meta OAuth pattern
// (HMAC-signed CSRF state + httpOnly nonce cookie, raw fetch against Graph) and
// requests the WhatsApp scopes (whatsapp_business_messaging / _management). After
// the code→token exchange, discovers the granted WABA(s) via debug_token and
// lists phone numbers, subscribes our app to the WABA for webhooks, and (once a
// live number exists) registers the number. Tokens are RETURNED to the caller,
// which encrypts them before storage — never logged, never sent to the browser.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import type { WaOAuthConfig, WabaSummary, WaPhoneNumber, WaErrorType } from "./types";
import { WA_SCOPES } from "./types";

const isReal = (v: string | undefined) => !!v && v.trim().length > 0;

/** Read + validate the Meta app config for WhatsApp OAuth. Accepts META_ and
 *  FACEBOOK_ aliases (the org already has a Meta app + WhatsApp perms). Never throws. */
export function getWaOAuthConfig(): WaOAuthConfig {
  const env = (...keys: string[]): string => { for (const k of keys) { const v = process.env[k]?.trim(); if (v) return v; } return ""; };
  const appId = env("META_APP_ID", "FACEBOOK_APP_ID", "WHATSAPP_APP_ID", "NEXT_PUBLIC_META_APP_ID");
  const appSecret = env("META_APP_SECRET", "FACEBOOK_APP_SECRET", "WHATSAPP_APP_SECRET");
  const redirectUri = env("WHATSAPP_OAUTH_REDIRECT_URI", "META_WHATSAPP_REDIRECT_URI");
  const graphVersion = env("WHATSAPP_GRAPH_VERSION", "META_GRAPH_VERSION") || "v21.0";
  const configId = env("WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID", "META_WHATSAPP_CONFIG_ID", "WHATSAPP_LOGIN_CONFIG_ID");
  const missing: string[] = [];
  if (!isReal(appId)) missing.push("META_APP_ID");
  if (!isReal(appSecret)) missing.push("META_APP_SECRET");
  if (!isReal(redirectUri)) missing.push("WHATSAPP_OAUTH_REDIRECT_URI");
  const configured = missing.length === 0;
  const enabledFlag = env("WHATSAPP_OAUTH_ENABLED", "META_OAUTH_ENABLED").toLowerCase();
  const enabled = enabledFlag === "true" || enabledFlag === "1";
  return { appId, appSecret, redirectUri, graphVersion, configId, configured, enabled, ready: configured && enabled, missing };
}

const graph = (cfg: WaOAuthConfig, path: string) => `https://graph.facebook.com/${cfg.graphVersion}${path}`;

// ── CSRF signed state + httpOnly nonce ───────────────────────────────────────
interface StatePayload { orgId: string; userId: string; nonce: string; exp: number }
const b64url = (buf: Buffer) => buf.toString("base64url");
const hmac = (data: string, secret: string) => crypto.createHmac("sha256", secret).update(data).digest("base64url");

export function stateSecret(): string {
  return process.env.WHATSAPP_OAUTH_STATE_SECRET?.trim()
    || process.env.ZONO_ENCRYPTION_KEY?.trim()
    || "zono-whatsapp-oauth-state";
}

export function createSignedState(orgId: string, userId: string, secret: string): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload: StatePayload = { orgId, userId, nonce, exp: Date.now() + 10 * 60 * 1000 };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return { state: `${body}.${hmac(body, secret)}`, nonce };
}

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
  } catch { return null; }
}

/** Build the Embedded Signup / Login-for-Business dialog URL. Uses config_id when
 *  present (permissions live in the Login configuration); otherwise falls back to
 *  requesting the WhatsApp scopes directly. */
export function buildAuthorizeUrl(cfg: WaOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    state,
  });
  if (isReal(cfg.configId)) params.set("config_id", cfg.configId);
  else params.set("scope", WA_SCOPES.join(","));
  return `https://www.facebook.com/${cfg.graphVersion}/dialog/oauth?${params.toString()}`;
}

export interface WaTokenResult { accessToken: string; expiresInSec: number | null }

/** Exchange the authorization code for a business access token. */
export async function exchangeCodeForToken(cfg: WaOAuthConfig, code: string): Promise<WaTokenResult> {
  const url = graph(cfg, "/oauth/access_token") + "?" + new URLSearchParams({
    client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: cfg.redirectUri, code,
  }).toString();
  const res = await fetch(url);
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || !json.access_token) throw new Error(json.error?.message || "whatsapp code exchange failed");
  return { accessToken: json.access_token, expiresInSec: json.expires_in ?? null };
}

/** Best-effort long-lived exchange (WhatsApp system-user tokens are long-lived;
 *  this upgrades a short-lived user token when possible). Returns input on failure. */
export async function exchangeForLongLived(cfg: WaOAuthConfig, shortToken: string): Promise<WaTokenResult> {
  const url = graph(cfg, "/oauth/access_token") + "?" + new URLSearchParams({
    grant_type: "fb_exchange_token", client_id: cfg.appId, client_secret: cfg.appSecret, fb_exchange_token: shortToken,
  }).toString();
  try {
    const res = await fetch(url);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !json.access_token) return { accessToken: shortToken, expiresInSec: null };
    return { accessToken: json.access_token, expiresInSec: json.expires_in ?? null };
  } catch { return { accessToken: shortToken, expiresInSec: null }; }
}

function classify(status: number, body: string): WaErrorType {
  if (status === 401) return "auth_expired";
  if (status === 403) return /permission|scope/i.test(body) ? "permission" : "rate_limit";
  if (status === 429) return "rate_limit";
  if (status >= 400 && status < 500) return "invalid";
  return "unknown";
}

/** Discover the WABA ids this token was granted (via debug_token granular scopes). */
export async function fetchGrantedWabaIds(cfg: WaOAuthConfig, token: string): Promise<string[]> {
  const appToken = `${cfg.appId}|${cfg.appSecret}`;
  const url = graph(cfg, "/debug_token") + "?" + new URLSearchParams({ input_token: token, access_token: appToken }).toString();
  try {
    const res = await fetch(url);
    const json = (await res.json()) as { data?: { granular_scopes?: { scope?: string; target_ids?: string[] }[] } };
    const ids = new Set<string>();
    for (const g of json.data?.granular_scopes ?? []) {
      if (g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging") {
        for (const t of g.target_ids ?? []) ids.add(t);
      }
    }
    return [...ids];
  } catch { return []; }
}

/** Read a WABA's basic profile. */
export async function getWaba(cfg: WaOAuthConfig, token: string, wabaId: string): Promise<WabaSummary | null> {
  const url = graph(cfg, `/${wabaId}`) + "?" + new URLSearchParams({ fields: "id,name,currency,timezone_id", access_token: token }).toString();
  try {
    const res = await fetch(url);
    const json = (await res.json()) as { id?: string; name?: string; currency?: string; timezone_id?: string };
    if (!res.ok || !json.id) return null;
    return { id: json.id, name: json.name ?? null, currency: json.currency ?? null, timezone: json.timezone_id ?? null };
  } catch { return null; }
}

/** List the phone numbers under a WABA. */
export async function listPhoneNumbers(cfg: WaOAuthConfig, token: string, wabaId: string): Promise<{ numbers: WaPhoneNumber[]; error?: { type: WaErrorType; message: string } }> {
  const url = graph(cfg, `/${wabaId}/phone_numbers`) + "?" + new URLSearchParams({
    fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type", access_token: token,
  }).toString();
  let body = "";
  try {
    const res = await fetch(url);
    body = await res.text();
    if (!res.ok) return { numbers: [], error: { type: classify(res.status, body), message: body.slice(0, 200) } };
    const json = JSON.parse(body) as { data?: { id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; code_verification_status?: string; platform_type?: string }[] };
    return {
      numbers: (json.data ?? []).filter((p) => !!p.id).map((p) => ({
        id: p.id as string, displayPhoneNumber: p.display_phone_number ?? null, verifiedName: p.verified_name ?? null,
        qualityRating: p.quality_rating ?? null, codeVerificationStatus: p.code_verification_status ?? null, platformType: p.platform_type ?? null,
      })),
    };
  } catch { return { numbers: [], error: { type: "network", message: "network error" } }; }
}

/** Subscribe our app to the WABA so Meta delivers webhooks for it (Part 3). */
export async function subscribeApp(cfg: WaOAuthConfig, token: string, wabaId: string): Promise<boolean> {
  try {
    const res = await fetch(graph(cfg, `/${wabaId}/subscribed_apps`), {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token }),
    });
    const json = (await res.json()) as { success?: boolean };
    return res.ok && json.success !== false;
  } catch { return false; }
}

/** Register a phone number (required before it can send). Needs a 6-digit PIN.
 *  This is the ONE step that requires a live, connected business number — until a
 *  number is connected in the Meta dashboard, this returns a phone-dependent error. */
export async function registerPhoneNumber(cfg: WaOAuthConfig, token: string, phoneNumberId: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(graph(cfg, `/${phoneNumberId}/register`), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || json.success === false) return { ok: false, error: json.error?.message || "register failed" };
    return { ok: true };
  } catch { return { ok: false, error: "network error" }; }
}
