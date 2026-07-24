// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CAPABILITY contracts. Phase 0.
// ----------------------------------------------------------------------------
// The capability model is the runtime source of truth for what is enabled. It
// speaks CANONICAL capability keys only — raw Meta permission strings never
// appear here (they are mapped in the Graph layer). A capability is a bundle of
// requirements (access mode, business verification, app review, webhook health,
// granted permissions, flags, kill switch) evaluated deterministically.
// ============================================================================
import type { Brand, MetaPlatform, MetaScopeGroup, MetaCapabilityClass } from "../types";
import type { MetaAuthorizationMode, MetaConnectionStatus, MetaConnectionHealth } from "../connection/types";

/** A canonical capability key, e.g. "instagram.content.publish". */
export type MetaCapabilityKey = Brand<string, "MetaCapabilityKey">;

/**
 * The minimum authorization mode a capability requires. `any` means any valid
 * connected mode suffices; `system_user` means org-automation only.
 */
export type MetaAccessMode = "any" | "business_login" | "system_user";

/** The declarative requirement bundle for a capability. */
export interface MetaCapabilityRequirement {
  /** Minimum access mode required to exercise the capability. */
  minAccessMode: MetaAccessMode;
  /** Meta Business Verification must be approved. */
  requiresBusinessVerification: boolean;
  /** Meta App Review must have approved the underlying permissions. */
  requiresAppReview: boolean;
  /** A healthy webhook subscription is required for this capability. */
  requiresWebhook: boolean;
  /** Other canonical capabilities that must also be allowed (dependencies). */
  dependsOn: readonly MetaCapabilityKey[];
}

/** A fully-declared capability in the registry. */
export interface MetaCapability {
  key: MetaCapabilityKey;
  platform: MetaPlatform | "cross";
  scopeGroup: MetaScopeGroup;
  classification: MetaCapabilityClass;
  /** Whether the capability is enabled by default at the platform level. */
  defaultEnabled: boolean;
  /** The kill-switch domain that can globally halt this capability family. */
  killSwitchDomain: MetaKillSwitchDomain;
  requirement: MetaCapabilityRequirement;
  /** Honest, hard limitations (rate ceilings, API gaps) — documentation. */
  limitations: readonly string[];
}

/** Kill-switch domains — a switch here always wins over any grant. */
export type MetaKillSwitchDomain =
  | "connection"
  | "publishing"
  | "comments"
  | "messaging"
  | "analytics"
  | "webhooks"
  | "all";

/** Verification / review states an org's connection may be in. */
export type MetaVerificationState = "approved" | "pending" | "not_started" | "rejected" | "unknown";

/** The runtime state fed to the evaluator (nothing secret). */
export interface MetaCapabilityState {
  /** Platform-wide feature flag for the whole Meta Workspace. */
  globalFeatureEnabled: boolean;
  /** Per-organization feature flag. */
  orgFeatureEnabled: boolean;
  /** A concrete provider is registered and available. */
  providerAvailable: boolean;
  connectionStatus: MetaConnectionStatus;
  connectionHealth: MetaConnectionHealth;
  accessMode: MetaAuthorizationMode;
  /** Canonical capability keys proven GRANTED (not merely configured). */
  grantedCapabilities: readonly string[];
  businessVerification: MetaVerificationState;
  appReview: MetaVerificationState;
  /** Whether the required webhook subscription is currently healthy. */
  webhookHealthy: boolean;
  /** Extended capabilities explicitly enabled for this org (opt-in). */
  extendedEnabled: readonly string[];
  globalKillSwitch: boolean;
  orgKillSwitch: boolean;
}

/** Why a capability was denied (machine-readable). */
export type MetaCapabilityDenyReason =
  | "global_flag_off"
  | "org_flag_off"
  | "provider_unavailable"
  | "not_connected"
  | "connection_unhealthy"
  | "permission_missing"
  | "app_review_required"
  | "business_verification_required"
  | "webhook_unhealthy"
  | "access_mode_insufficient"
  | "dependency_unmet"
  | "extended_not_enabled"
  | "excluded"
  | "kill_switch"
  | "unknown_capability";

/** The deterministic decision returned by the evaluator. */
export interface MetaCapabilityDecision {
  key: string;
  allowed: boolean;
  /** Present only when `allowed === false`. */
  reason: MetaCapabilityDenyReason | null;
  humanReason: string;
  /** Canonical requirement keys still missing (for setup UIs). */
  missing: readonly string[];
  /** Allowed but operating in a reduced/uncertain mode. */
  degraded: boolean;
  /** The exact boolean signals that produced this decision (explainability). */
  signals: Readonly<Record<string, boolean | string>>;
}
