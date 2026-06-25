// ============================================================================
// ZONO — Commercial Launch Platform™ pure surface (client-safe). Launch /
// operations primitives only. Server-only services import from ./server.
// ============================================================================
export * from "./types";
export {
  ENTITLEMENTS, PLANS, PLAN_ORDER, planDefinition, defaultLimits, planAllows, upgradeFor, checkLimit,
  type EntitlementKey, type LimitCheck,
} from "./plans";
export {
  ONBOARDING_STEPS, ONBOARDING_STEP_KEYS, emptyProgress, computeOnboarding, markStep,
} from "./onboarding";
export { computeProductionScore } from "./production-score";
export { DIAGNOSTIC_CHECKS, rollupDiagnostics, buildDiagnosticsReport, configCheck } from "./diagnostics";
export { VERSION_HISTORY, generateReleaseNotes, currentVersion } from "./release-notes";
export { resolveBetaContext, isBetaActive, betaActiveFor } from "./beta";
export { FEEDBACK_TYPES, shortBrowser, buildFeedbackContext, validateFeedback } from "./feedback";
export { USAGE_CATEGORIES, sanitizeUsageEvent, aggregateByName, type SanitizedUsageEvent } from "./usage";
