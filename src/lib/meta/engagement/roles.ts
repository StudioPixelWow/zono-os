// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · ENGAGEMENT ROLE GATES (PURE). Phase 1.
// ----------------------------------------------------------------------------
// Pure role predicates, extracted so the server service and offline QA share one
// source of truth. Requesting a moderation action (reply/hide/delete) and
// APPROVING one are distinct privileges — a content creator may draft/request but
// never approves their own action; approval + outbound send always requires a
// privileged actor (reusing the content-approval / outbound-safety posture).
// ============================================================================
const MODERATOR_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator"]);
const APPROVER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager"]);
const VIEWER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator", "support"]);

/** May view comments + threads. */
export const canViewComments = (role: string): boolean => VIEWER_ROLES.has((role || "").toLowerCase());
/** May request a moderation action (still requires approval before execution). */
export const canRequestModeration = (role: string): boolean => MODERATOR_ROLES.has((role || "").toLowerCase());
/** May approve a pending moderation action for execution. */
export const canApproveModeration = (role: string): boolean => APPROVER_ROLES.has((role || "").toLowerCase());
