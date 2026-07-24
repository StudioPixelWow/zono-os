// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONNECTION surface + auth-mode model.
// ----------------------------------------------------------------------------
// Pure, transport-neutral helpers over the authorization-mode model. The
// architecture is NOT locked to one token strategy: User OAuth and Facebook
// Login for Business are valid origins; a Business System-User is PREFERRED for
// org-level automation but not mandatory. Token ownership is organization-scoped;
// the authorizing user is audit provenance only. No token exchange happens here.
// ============================================================================
import type { MetaAuthorizationMode } from "./types";

export type * from "./types";

/** Canonical description of an authorization mode (documentation/UX helper). */
export interface MetaAuthorizationModeInfo {
  mode: MetaAuthorizationMode;
  /** Whether this mode is suitable for unattended, org-level automation. */
  supportsOrgAutomation: boolean;
  /** Whether tokens under this mode are long-lived by nature. */
  longLived: boolean;
  label: string;
}

const MODE_INFO: Record<MetaAuthorizationMode, MetaAuthorizationModeInfo> = {
  user_oauth: { mode: "user_oauth", supportsOrgAutomation: false, longLived: false, label: "User OAuth (Facebook Login)" },
  business_login: { mode: "business_login", supportsOrgAutomation: true, longLived: true, label: "Facebook Login for Business" },
  system_user: { mode: "system_user", supportsOrgAutomation: true, longLived: true, label: "Business System-User" },
  unknown: { mode: "unknown", supportsOrgAutomation: false, longLived: false, label: "Unknown" },
};

/** Pure lookup of an authorization mode's canonical properties. */
export function authorizationModeInfo(mode: MetaAuthorizationMode): MetaAuthorizationModeInfo {
  return MODE_INFO[mode] ?? MODE_INFO.unknown;
}

/** The PREFERRED mode for org automation — a recommendation, not a requirement. */
export function preferredOrgAutomationMode(): MetaAuthorizationMode {
  return "system_user";
}
