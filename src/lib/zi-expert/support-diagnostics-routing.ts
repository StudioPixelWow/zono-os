// ============================================================================
// ZI Expert™ — SUPPORT → DIAGNOSTICS ROUTING, pure (Phase ZI-CS P4, dep-light).
// The glue between the support-intent classifier (P1) and the EXISTING ZI
// diagnostics engine (runZIDiagnostics / inferIssueType). Given a classification,
// decides (a) whether ZI should run a live diagnostic BEFORE answering/escalating,
// and (b) which IssueType to inspect. Keeps ZI's "troubleshoot, don't just
// explain" behaviour (directive §9) grounded in the categories we already detect.
// No I/O → unit-runnable. IssueType values mirror diagnostic-types.ts exactly.
// ============================================================================
import type { SupportCategory, SupportClassification } from "./support-intent";

// Must stay in sync with IssueType in ./diagnostic-types.ts (compile-checked at
// the call site where the real IssueType is imported; kept as a string union here
// so this module has zero import weight and stays standalone-testable).
export type DiagnosticIssue =
  | "property_radar_empty" | "map_empty" | "buyer_matching_zero" | "seller_intelligence_empty"
  | "journey_not_running" | "ai_unavailable" | "provider_sync_failed" | "cron_not_running"
  | "realtime_not_arriving" | "feature_unavailable" | "permission_denied" | "credits_exhausted"
  | "reports_not_generating" | "notifications_missing" | "general";

// Map a support category to the diagnostic that best inspects it. Only categories
// with a MEANINGFUL live check map to a concrete issue; the rest → null (ZI just
// answers/escalates, no diagnostic theatre).
const CATEGORY_TO_ISSUE: Partial<Record<SupportCategory, DiagnosticIssue>> = {
  FACEBOOK: "provider_sync_failed",
  WHATSAPP: "provider_sync_failed",
  GOOGLE: "provider_sync_failed",
  INTEGRATION: "provider_sync_failed",
  SYNC: "realtime_not_arriving",
  LEAD: "realtime_not_arriving",
  PERMISSIONS: "permission_denied",
  AI_FEATURE: "ai_unavailable",
  BILLING: "credits_exhausted",
  SUBSCRIPTION: "credits_exhausted",
  PROPERTY: "property_radar_empty",
  BUYER: "buyer_matching_zero",
  SELLER: "seller_intelligence_empty",
  DATA: "reports_not_generating",
};

/** The diagnostic IssueType to inspect for a category, or null when none fits. */
export function issueForCategory(category: SupportCategory): DiagnosticIssue | null {
  return CATEGORY_TO_ISSUE[category] ?? null;
}

/**
 * Should ZI run a live diagnostic for this turn before answering/escalating?
 * Yes when it's a SUPPORT-lane turn that reports something wrong (requiresAction)
 * AND the category maps to a real check. PRODUCT-lane (recommendation) asks and
 * pure how-to questions never trigger diagnostics.
 */
export function shouldRunDiagnostics(c: SupportClassification): boolean {
  if (c.lane !== "SUPPORT") return false;
  if (!c.requiresAction) return false;
  return issueForCategory(c.category) !== null;
}

/** Convenience: the issue to run, or null when diagnostics shouldn't run. */
export function diagnosticPlan(c: SupportClassification): DiagnosticIssue | null {
  return shouldRunDiagnostics(c) ? issueForCategory(c.category) : null;
}
