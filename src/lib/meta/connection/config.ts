// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONNECTION CONFIG. Phase 1.
// ----------------------------------------------------------------------------
// Resolves the Meta app OAuth config from the environment (reusing the Business
// WhatsApp env aliases where sensible) and the operator feature flags / kill
// switches. Pure reads of process.env — no secret is logged. The app secret is
// only ever handed to the sealed Graph layer for token exchange.
// ============================================================================
import type { GraphOAuthConfig } from "../provider/graph";
import type { MetaAuthorizationMode } from "./types";

export interface MetaConnectionConfig extends GraphOAuthConfig {
  /** Preferred authorization mode for new connections (org automation). */
  mode: MetaAuthorizationMode;
  configured: boolean;
  enabled: boolean;
  ready: boolean;
  missing: readonly string[];
}

const env = (...keys: string[]): string => {
  for (const k of keys) { const v = process.env[k]?.trim(); if (v) return v; }
  return "";
};
const isReal = (v: string) => v.length > 0;
const flag = (v: string) => v.toLowerCase() === "true" || v === "1";

/** Resolve the Meta Workspace OAuth config. Never throws. */
export function getMetaConnectionConfig(): MetaConnectionConfig {
  const appId = env("META_APP_ID", "FACEBOOK_APP_ID", "NEXT_PUBLIC_META_APP_ID");
  const appSecret = env("META_APP_SECRET", "FACEBOOK_APP_SECRET");
  const redirectUri = env("META_WORKSPACE_OAUTH_REDIRECT_URI", "META_OAUTH_REDIRECT_URI");
  const configId = env("META_WORKSPACE_LOGIN_CONFIG_ID", "META_LOGIN_CONFIG_ID") || null;
  const modeRaw = env("META_WORKSPACE_AUTH_MODE").toLowerCase();
  const mode: MetaAuthorizationMode =
    modeRaw === "system_user" ? "system_user" : modeRaw === "user_oauth" ? "user_oauth" : "business_login";

  const missing: string[] = [];
  if (!isReal(appId)) missing.push("META_APP_ID");
  if (!isReal(appSecret)) missing.push("META_APP_SECRET");
  if (!isReal(redirectUri)) missing.push("META_WORKSPACE_OAUTH_REDIRECT_URI");

  const configured = missing.length === 0;
  const enabled = flag(env("META_WORKSPACE_ENABLED", "META_OAUTH_ENABLED"));
  return { appId, appSecret, redirectUri, configId, mode, configured, enabled, ready: configured && enabled, missing };
}

/** Operator feature flags + kill switches for capability gating. */
export interface MetaOperatorFlags {
  globalFeatureEnabled: boolean;
  globalKillSwitch: boolean;
}

/** Resolve platform-wide flags (org-level flags come from the org record). */
export function getMetaOperatorFlags(): MetaOperatorFlags {
  return {
    globalFeatureEnabled: flag(env("META_WORKSPACE_ENABLED", "META_OAUTH_ENABLED")),
    globalKillSwitch: flag(env("META_WORKSPACE_KILL_SWITCH")),
  };
}
