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
  /** Facebook Login for Business configuration id. Permissions are defined in the
   *  Meta App's Login configuration, NOT requested ad-hoc via `scope`. */
  configId: string;
  configured: boolean;
  missing: string[];
}

/** Minimal scope kept ONLY for the legacy fallback path (when no config_id is set).
 *  With Facebook Login for Business, permissions live in the Login configuration
 *  on Meta's side and are NOT requested manually here. */
export const INITIAL_SCOPES = ["public_profile"];

/** Facebook Login for Business configuration id created in the Meta App dashboard.
 *  Used as the default so the authorize URL always carries a valid config_id;
 *  overridable per-deployment via META_LOGIN_CONFIG_ID. */
export const DEFAULT_LOGIN_CONFIG_ID = "1334427291395263";

const isReal = (v: string | undefined) => !!v && v.trim().length > 0;

/** Read + validate Meta OAuth env. `configured` is false (not a throw) when missing. */
export function getMetaOAuthConfig(): MetaOAuthConfig {
  const appId = process.env.META_APP_ID?.trim() ?? "";
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim() ?? "";
  const graphVersion = (process.env.META_GRAPH_VERSION?.trim() || "v21.0");
  const configId = (process.env.META_LOGIN_CONFIG_ID?.trim() || DEFAULT_LOGIN_CONFIG_ID);
  const missing: string[] = [];
  if (!isReal(appId)) missing.push("META_APP_ID");
  if (!isReal(appSecret)) missing.push("META_APP_SECRET");
  if (!isReal(redirectUri)) missing.push("META_OAUTH_REDIRECT_URI");
  if (!isReal(process.env.META_GRAPH_VERSION)) missing.push("META_GRAPH_VERSION");
  return { appId, appSecret, redirectUri, graphVersion, configId, configured: missing.length === 0, missing };
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

/** The Facebook Login dialog URL to redirect the user to.
 *  Uses Facebook Login for Business: passes `config_id` (the Login configuration
 *  holds the granted permissions) instead of requesting legacy `scope` manually.
 *  Falls back to legacy `scope` only if no config_id is available. */
export function buildAuthorizeUrl(cfg: MetaOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    state,
    response_type: "code",
  });
  if (isReal(cfg.configId)) {
    // Facebook Login for Business — permissions come from the Login configuration.
    params.set("config_id", cfg.configId);
  } else {
    // Legacy fallback only.
    params.set("scope", INITIAL_SCOPES.join(","));
  }
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

// ── Page discovery (Phase 19) — read-only; NOTHING here publishes ─────────────

/** Permission required to list the user's managed Pages via GET /me/accounts. */
export const PAGE_DISCOVERY_SCOPES = ["pages_show_list"] as const;

/** A Facebook Page the connected user manages (no publishing — discovery only). */
export interface MetaPage {
  id: string;
  name: string;
  category: string | null;
  /** Page-scoped token, if Meta returns it. Caller MUST encrypt before storing. */
  accessToken: string | null;
  /** e.g. ["MANAGE","CREATE_CONTENT",...] when returned — informational only. */
  tasks: string[];
}

export type PagesErrorType = "expired" | "permission" | "unknown";
export interface FetchPagesResult {
  pages: MetaPage[];
  error?: { type: PagesErrorType; message: string };
}

/**
 * GET /me/accounts — list the Pages the connected user manages.
 * Returns a discriminated result instead of throwing so the caller can map
 * token-expiry vs missing-permission to honest UI states. Never logs tokens.
 */
export async function fetchPages(cfg: MetaOAuthConfig, accessToken: string): Promise<FetchPagesResult> {
  const url = graph(cfg, "/me/accounts") + "?" + new URLSearchParams({
    fields: "id,name,category,access_token,tasks",
    limit: "100",
    access_token: accessToken,
  }).toString();

  let json: {
    data?: Array<{ id?: string; name?: string; category?: string; access_token?: string; tasks?: string[] }>;
    error?: { message?: string; code?: number; type?: string };
  };
  try {
    const res = await fetch(url, { method: "GET" });
    json = await res.json();
  } catch {
    return { pages: [], error: { type: "unknown", message: "network error fetching pages" } };
  }

  if (json.error) {
    const code = json.error.code;
    const msg = json.error.message ?? "graph error";
    // 190 = invalid/expired access token. 102/463/467 are also session/token issues.
    if (code === 190 || code === 102 || code === 463 || code === 467) {
      return { pages: [], error: { type: "expired", message: msg } };
    }
    // 200/10/3 = permission errors; also catch explicit permission wording.
    if (code === 200 || code === 10 || code === 3 || /permission|pages_show_list/i.test(msg)) {
      return { pages: [], error: { type: "permission", message: msg } };
    }
    return { pages: [], error: { type: "unknown", message: msg } };
  }

  const pages: MetaPage[] = (json.data ?? [])
    .filter((p) => !!p.id)
    .map((p) => ({
      id: p.id as string,
      name: p.name ?? "(ללא שם)",
      category: p.category ?? null,
      accessToken: p.access_token ?? null,
      tasks: Array.isArray(p.tasks) ? p.tasks : [],
    }));
  return { pages };
}

/** Map a Graph error object to a typed reason (shared by all read/write helpers). */
function classifyGraphError(error?: { message?: string; code?: number; type?: string }): { type: PagesErrorType; message: string } {
  const code = error?.code;
  const msg = error?.message ?? "graph error";
  if (code === 190 || code === 102 || code === 463 || code === 467) return { type: "expired", message: msg };
  if (code === 200 || code === 10 || code === 3 || /permission|pages_show_list|instagram|leads_retrieval|read_insights/i.test(msg)) {
    return { type: "permission", message: msg };
  }
  return { type: "unknown", message: msg };
}

// ── Instagram discovery (Part D) ──────────────────────────────────────────────
export interface MetaInstagramAccount { igUserId: string; username: string | null; linkedPageId: string }
export interface FetchInstagramResult { account: MetaInstagramAccount | null; error?: { type: PagesErrorType; message: string } }

/** GET /{page-id}?fields=instagram_business_account{id,username} — uses the PAGE token. */
export async function fetchInstagramForPage(cfg: MetaOAuthConfig, pageId: string, pageToken: string): Promise<FetchInstagramResult> {
  const url = graph(cfg, `/${pageId}`) + "?" + new URLSearchParams({
    fields: "instagram_business_account{id,username}", access_token: pageToken,
  }).toString();
  let json: { instagram_business_account?: { id?: string; username?: string }; error?: { message?: string; code?: number } };
  try { json = await (await fetch(url, { method: "GET" })).json(); }
  catch { return { account: null, error: { type: "unknown", message: "network error" } }; }
  if (json.error) return { account: null, error: classifyGraphError(json.error) };
  const ig = json.instagram_business_account;
  if (!ig?.id) return { account: null };
  return { account: { igUserId: ig.id, username: ig.username ?? null, linkedPageId: pageId } };
}

// ── Lead Ads form discovery (Part F) ──────────────────────────────────────────
export interface MetaLeadForm { id: string; name: string; status: string | null; pageId: string }
export interface FetchLeadFormsResult { forms: MetaLeadForm[]; error?: { type: PagesErrorType; message: string } }

/** GET /{page-id}/leadgen_forms — uses the PAGE token. Requires leads_retrieval. */
export async function fetchLeadForms(cfg: MetaOAuthConfig, pageId: string, pageToken: string): Promise<FetchLeadFormsResult> {
  const url = graph(cfg, `/${pageId}/leadgen_forms`) + "?" + new URLSearchParams({
    fields: "id,name,status", limit: "100", access_token: pageToken,
  }).toString();
  let json: { data?: Array<{ id?: string; name?: string; status?: string }>; error?: { message?: string; code?: number } };
  try { json = await (await fetch(url, { method: "GET" })).json(); }
  catch { return { forms: [], error: { type: "unknown", message: "network error" } }; }
  if (json.error) return { forms: [], error: classifyGraphError(json.error) };
  const forms = (json.data ?? []).filter((f) => !!f.id).map((f) => ({
    id: f.id as string, name: f.name ?? "(ללא שם)", status: f.status ?? null, pageId,
  }));
  return { forms };
}

// ── Granted permissions (Parts G/H) ───────────────────────────────────────────
export const META_RELEASE_PERMISSIONS = [
  "pages_show_list", "pages_manage_posts", "pages_read_engagement",
  "read_insights", "instagram_basic", "instagram_content_publish", "leads_retrieval",
] as const;
export type MetaPermission = (typeof META_RELEASE_PERMISSIONS)[number];

export interface FetchPermissionsResult { granted: string[]; error?: { type: PagesErrorType; message: string } }

/** GET /me/permissions — returns the list of granted permission strings (status=granted). */
export async function fetchPermissions(cfg: MetaOAuthConfig, userToken: string): Promise<FetchPermissionsResult> {
  const url = graph(cfg, "/me/permissions") + "?" + new URLSearchParams({ access_token: userToken }).toString();
  let json: { data?: Array<{ permission?: string; status?: string }>; error?: { message?: string; code?: number } };
  try { json = await (await fetch(url, { method: "GET" })).json(); }
  catch { return { granted: [], error: { type: "unknown", message: "network error" } }; }
  if (json.error) return { granted: [], error: classifyGraphError(json.error) };
  const granted = (json.data ?? []).filter((p) => p.status === "granted" && p.permission).map((p) => p.permission as string);
  return { granted };
}

// ── Facebook Page publishing (Part C) — official Graph API, page token ─────────
export type PublishErrorType = "expired" | "permission" | "graph_error";
export interface PublishPageResult {
  ok: boolean;
  externalPostId?: string;
  externalPostUrl?: string | null;
  error?: { type: PublishErrorType; message: string };
}

function mapPublishError(error?: { message?: string; code?: number; type?: string }): { type: PublishErrorType; message: string } {
  const c = classifyGraphError(error);
  if (c.type === "expired") return { type: "expired", message: c.message };
  if (c.type === "permission") return { type: "permission", message: c.message };
  return { type: "graph_error", message: c.message };
}

/**
 * Publish ONE post to a Facebook PAGE (text, or image+caption if imageUrl is a
 * public URL). Uses the page-scoped token. Returns the external post id/url ONLY
 * when the Graph API call truly succeeds — never fakes success.
 */
export async function publishToPage(
  cfg: MetaOAuthConfig, pageId: string, pageToken: string,
  input: { text: string; imageUrl: string | null },
): Promise<PublishPageResult> {
  const isPhoto = !!input.imageUrl && /^https:\/\//i.test(input.imageUrl);
  const endpoint = isPhoto ? `/${pageId}/photos` : `/${pageId}/feed`;
  const body = new URLSearchParams({ access_token: pageToken });
  if (isPhoto) { body.set("url", input.imageUrl as string); if (input.text) body.set("caption", input.text); }
  else { body.set("message", input.text); }

  let json: { id?: string; post_id?: string; error?: { message?: string; code?: number; type?: string } };
  try {
    const res = await fetch(graph(cfg, endpoint), { method: "POST", body });
    json = await res.json();
  } catch {
    return { ok: false, error: { type: "graph_error", message: "network error publishing" } };
  }
  if (json.error || (!json.id && !json.post_id)) {
    return { ok: false, error: mapPublishError(json.error) };
  }
  // /photos returns { id, post_id }; /feed returns { id }. Prefer the feed post id.
  const externalPostId = json.post_id || (json.id as string);
  const externalPostUrl = `https://www.facebook.com/${externalPostId}`;
  return { ok: true, externalPostId, externalPostUrl };
}
