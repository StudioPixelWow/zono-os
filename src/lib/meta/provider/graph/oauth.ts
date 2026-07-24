// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH OAUTH + TOKEN INSPECTION. Phase 1.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: all Meta OAuth/token network specifics live here. Builds the
// Login-for-Business dialog URL (config_id bundle), exchanges the code, upgrades
// to a long-lived token, and inspects the token via debug_token — returning ONLY
// canonical data upward (granted CAPABILITY keys, validity, expiry). Raw scope
// strings and access_token never leave this directory.
// ============================================================================
import { graphApiVersion, graphEndpoint, capabilitiesFromGrantedScopes } from "./compat";
import { graphJson, type GraphFetch } from "./client";
import type { GraphDebugTokenData } from "./types";

/** Meta OAuth app configuration (resolved from env by the connection layer). */
export interface GraphOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  /** Facebook Login for Business configuration id (bundles assets + scopes). */
  configId: string | null;
}

/** Build the Login-for-Business consent dialog URL (config_id when present). */
export function buildAuthorizeUrl(cfg: GraphOAuthConfig, state: string): string {
  const params = new URLSearchParams({ client_id: cfg.appId, redirect_uri: cfg.redirectUri, response_type: "code", state });
  if (cfg.configId && cfg.configId.trim()) params.set("config_id", cfg.configId.trim());
  return `https://www.facebook.com/${graphApiVersion()}/dialog/oauth?${params.toString()}`;
}

export interface GraphTokenResult {
  token: string;
  expiresInSec: number | null;
}

/** Exchange the authorization code for a user access token. */
export async function exchangeCodeForToken(cfg: GraphOAuthConfig, code: string, fetchImpl?: GraphFetch): Promise<GraphTokenResult> {
  const url = graphEndpoint("/oauth/access_token") + "?" + new URLSearchParams({
    client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: cfg.redirectUri, code,
  }).toString();
  const json = await graphJson<{ access_token?: string; expires_in?: number }>(url, { fetchImpl });
  if (!json.access_token) throw new Error("code exchange returned no token");
  return { token: json.access_token, expiresInSec: json.expires_in ?? null };
}

/** Upgrade a short-lived token to a long-lived one (best-effort). */
export async function exchangeForLongLived(cfg: GraphOAuthConfig, shortToken: string, fetchImpl?: GraphFetch): Promise<GraphTokenResult> {
  const url = graphEndpoint("/oauth/access_token") + "?" + new URLSearchParams({
    grant_type: "fb_exchange_token", client_id: cfg.appId, client_secret: cfg.appSecret, fb_exchange_token: shortToken,
  }).toString();
  try {
    const json = await graphJson<{ access_token?: string; expires_in?: number }>(url, { fetchImpl });
    if (!json.access_token) return { token: shortToken, expiresInSec: null };
    return { token: json.access_token, expiresInSec: json.expires_in ?? null };
  } catch {
    return { token: shortToken, expiresInSec: null };
  }
}

/** The canonical result of inspecting a token — no raw scope strings escape. */
export interface GraphTokenInspection {
  valid: boolean;
  /** Canonical capability keys the token actually GRANTS (mapped from scopes). */
  grantedCapabilities: readonly string[];
  /** Unix seconds of expiry, or null for a non-expiring token. */
  expiresAt: number | null;
}

/**
 * Inspect a token via debug_token and translate its granted scopes into CANONICAL
 * capability keys. This is the authoritative "what was actually granted" source —
 * requested/configured scopes are never assumed granted.
 */
export async function inspectToken(cfg: GraphOAuthConfig, token: string, fetchImpl?: GraphFetch): Promise<GraphTokenInspection> {
  const appToken = `${cfg.appId}|${cfg.appSecret}`;
  const url = graphEndpoint("/debug_token") + "?" + new URLSearchParams({ input_token: token, access_token: appToken }).toString();
  const json = await graphJson<{ data?: GraphDebugTokenData }>(url, { fetchImpl });
  const data = json.data ?? {};
  const scopes = new Set<string>(data.scopes ?? []);
  for (const g of data.granular_scopes ?? []) if (g.scope) scopes.add(g.scope);
  return {
    valid: data.is_valid !== false,
    grantedCapabilities: capabilitiesFromGrantedScopes([...scopes]),
    expiresAt: typeof data.expires_at === "number" && data.expires_at > 0 ? data.expires_at : null,
  };
}

/** Revoke all granted permissions for a token (disconnect). Best-effort. */
export async function revokePermissions(token: string, fetchImpl?: GraphFetch): Promise<boolean> {
  const url = graphEndpoint("/me/permissions") + "?" + new URLSearchParams({ access_token: token }).toString();
  try {
    const json = await graphJson<{ success?: boolean }>(url, { method: "DELETE", fetchImpl });
    return json.success === true;
  } catch {
    return false;
  }
}
