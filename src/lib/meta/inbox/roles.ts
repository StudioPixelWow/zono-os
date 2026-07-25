// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INBOX ROLE GATES (PURE). Phase 3.
// ----------------------------------------------------------------------------
// Pure role predicates, extracted so the server service and offline QA share one
// source of truth. Viewing the inbox and managing local inbox state (read/archive/
// assign/label/snooze) are distinct privileges. Inbox actions never touch Meta, so
// no capability-to-Meta write is involved — only role + org scope.
// ============================================================================
const VIEWER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator", "support"]);
const MANAGER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator"]);
const ASSIGNER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager"]);

/** May view inbox conversations. */
export const canViewInbox = (role: string): boolean => VIEWER_ROLES.has((role || "").toLowerCase());
/** May apply local state (read/archive/resolve/snooze/label) to a conversation. */
export const canManageInbox = (role: string): boolean => MANAGER_ROLES.has((role || "").toLowerCase());
/** May assign a conversation to a user. */
export const canAssignInbox = (role: string): boolean => ASSIGNER_ROLES.has((role || "").toLowerCase());
