// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CAPABILITY EVALUATOR. Phase 0.
// ----------------------------------------------------------------------------
// A PURE, deterministic evaluator. Given a capability key + runtime state it
// returns an allow/deny decision with an explainable signal set. Invariants:
//   • A kill switch ALWAYS wins.
//   • Excluded capabilities ALWAYS deny.
//   • Extended capabilities deny until explicitly enabled.
//   • Configured scopes are NEVER treated as granted scopes.
//   • A healthy token is NEVER treated as proof of App Review.
//   • Meta approval is NEVER inferred.
// No network, no secret, no Graph literal.
// ============================================================================
import type { MetaCapabilityDecision, MetaCapabilityDenyReason, MetaCapabilityState } from "./types";
import { getMetaCapability, EXCLUDED_CAPABILITY_KEYS } from "./registry";

/** Access-mode ordering for the `minAccessMode` gate. */
const MODE_RANK: Record<string, number> = { unknown: 0, user_oauth: 1, business_login: 2, system_user: 3 };
const MIN_MODE_RANK: Record<string, number> = { any: 1, business_login: 2, system_user: 3 };

function deny(key: string, reason: MetaCapabilityDenyReason, humanReason: string, signals: Record<string, boolean | string>, missing: string[] = []): MetaCapabilityDecision {
  return { key, allowed: false, reason, humanReason, missing, degraded: false, signals };
}

/**
 * Evaluate a single capability. `depth` guards against dependency cycles. The
 * evaluation short-circuits on the FIRST failing gate, in a fixed priority order,
 * so the reported reason is deterministic.
 */
export function evaluateMetaCapability(key: string, state: MetaCapabilityState, depth = 0): MetaCapabilityDecision {
  const def = getMetaCapability(key);
  const signals: Record<string, boolean | string> = {
    globalFeatureEnabled: state.globalFeatureEnabled,
    orgFeatureEnabled: state.orgFeatureEnabled,
    providerAvailable: state.providerAvailable,
    connectionStatus: state.connectionStatus,
    connectionHealth: state.connectionHealth,
    accessMode: state.accessMode,
    businessVerification: state.businessVerification,
    appReview: state.appReview,
    webhookHealthy: state.webhookHealthy,
    globalKillSwitch: state.globalKillSwitch,
    orgKillSwitch: state.orgKillSwitch,
  };

  // 0) Unknown capability — deny before anything else.
  if (!def) return deny(key, "unknown_capability", `unknown capability: ${key}`, signals);

  // 1) Excluded — permanently denied, regardless of any grant.
  if (def.classification === "excluded" || EXCLUDED_CAPABILITY_KEYS.has(key)) {
    return deny(key, "excluded", `capability is permanently out of scope: ${key}`, signals);
  }

  // 2) Kill switch ALWAYS wins (global or org, for this domain or "all").
  const domain = def.killSwitchDomain;
  if (state.globalKillSwitch || state.orgKillSwitch) {
    // A domain-scoped switch would be modeled per-domain in later phases; in
    // Phase 0 the switch is global-per-org and halts everything.
    return deny(key, "kill_switch", `kill switch engaged (domain=${domain})`, signals);
  }

  // 3) Feature flags.
  if (!state.globalFeatureEnabled) return deny(key, "global_flag_off", "Meta Workspace is globally disabled", signals);
  if (!state.orgFeatureEnabled) return deny(key, "org_flag_off", "Meta Workspace is disabled for this organization", signals);

  // 4) Provider availability.
  if (!state.providerAvailable) return deny(key, "provider_unavailable", "no Meta provider is available", signals);

  // 5) Extended capabilities must be explicitly enabled for the org.
  if (def.classification === "extended" && !state.extendedEnabled.includes(key)) {
    return deny(key, "extended_not_enabled", `extended capability not enabled: ${key}`, signals);
  }

  // 6) Connection must be present.
  if (state.connectionStatus !== "connected") {
    return deny(key, "not_connected", `connection is not active (status=${state.connectionStatus})`, signals);
  }

  // 7) Connection health — unhealthy denies; degraded is allowed-but-degraded.
  if (state.connectionHealth === "unhealthy") {
    return deny(key, "connection_unhealthy", "connection is unhealthy", signals);
  }

  // 8) Dependencies must themselves be allowed (recursive, cycle-guarded).
  if (depth < 16) {
    for (const dep of def.requirement.dependsOn) {
      const depDecision = evaluateMetaCapability(String(dep), state, depth + 1);
      if (!depDecision.allowed) {
        return deny(key, "dependency_unmet", `required capability not available: ${String(dep)}`, signals, [String(dep)]);
      }
    }
  }

  // 9) Access mode floor.
  const need = MIN_MODE_RANK[def.requirement.minAccessMode] ?? 1;
  const have = MODE_RANK[state.accessMode] ?? 0;
  if (have < need) {
    return deny(key, "access_mode_insufficient", `requires a stronger authorization mode (${def.requirement.minAccessMode})`, signals);
  }

  // 10) Granted permission — configured is NEVER treated as granted.
  if (!state.grantedCapabilities.includes(key)) {
    return deny(key, "permission_missing", `required Meta permission not granted for: ${key}`, signals, [key]);
  }

  // 11) App Review — a healthy token is NEVER proof of review.
  if (def.requirement.requiresAppReview && state.appReview !== "approved") {
    return deny(key, "app_review_required", `Meta App Review is required for: ${key}`, signals, ["app_review"]);
  }

  // 12) Business Verification.
  if (def.requirement.requiresBusinessVerification && state.businessVerification !== "approved") {
    return deny(key, "business_verification_required", `Meta Business Verification is required for: ${key}`, signals, ["business_verification"]);
  }

  // 13) Webhook health where required.
  if (def.requirement.requiresWebhook && !state.webhookHealthy) {
    return deny(key, "webhook_unhealthy", `a healthy webhook subscription is required for: ${key}`, signals, ["webhook"]);
  }

  // Allowed. Degraded when the connection is degraded (but usable).
  return {
    key,
    allowed: true,
    reason: null,
    humanReason: state.connectionHealth === "degraded" ? "allowed (connection degraded)" : "allowed",
    missing: [],
    degraded: state.connectionHealth === "degraded",
    signals,
  };
}

/** Convenience: evaluate several capabilities at once (deterministic order). */
export function evaluateMetaCapabilities(keys: readonly string[], state: MetaCapabilityState): readonly MetaCapabilityDecision[] {
  return [...keys].map((k) => evaluateMetaCapability(k, state));
}
