// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHT ROLE GATES (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Pure role predicate for viewing insights, extracted so the server service and
// offline QA share one source of truth. Insights are read-only analytics; there is
// no write action, so a single view gate suffices (capability + org scope are
// enforced separately in the service).
// ============================================================================
const VIEWER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator", "support"]);
export const canViewInsights = (role: string): boolean => VIEWER_ROLES.has((role || "").toLowerCase());
