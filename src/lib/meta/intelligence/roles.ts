// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INTELLIGENCE ROLE GATES (PURE). Phase 4.
// ----------------------------------------------------------------------------
// Pure role predicates shared by the server service + offline QA. Viewing safe
// signals, requesting a rescore, and accepting a suggestion (which may open a
// downstream approval-gated action) are distinct privileges. Accepting NEVER
// executes a provider write — but a read-only/support role still may not create
// downstream actions, so acceptance is gated above pure viewing.
// ============================================================================
const VIEWER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator", "support"]);
const RESCORE_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator"]);
const ACCEPT_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator"]);
const DISMISS_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator"]);

/** May view safe engagement signals + suggestions. */
export const canViewIntelligence = (role: string): boolean => VIEWER_ROLES.has((role || "").toLowerCase());
/** May request a manual rescore. */
export const canRescore = (role: string): boolean => RESCORE_ROLES.has((role || "").toLowerCase());
/** May accept a suggestion (routing into an existing, still-approval-gated workflow). */
export const canAcceptSuggestion = (role: string): boolean => ACCEPT_ROLES.has((role || "").toLowerCase());
/** May dismiss a suggestion. */
export const canDismissSuggestion = (role: string): boolean => DISMISS_ROLES.has((role || "").toLowerCase());
