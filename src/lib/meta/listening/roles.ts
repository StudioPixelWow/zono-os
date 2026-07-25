// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING ROLE GATES (PURE). Phase 5.
// ----------------------------------------------------------------------------
// Pure role predicates shared by the server service + QA. Configuring sources
// (create/enable/disable/refresh) is the privileged action; viewing the safe feed
// and changing a local mention status / projecting to the inbox are broader. Read-
// only/support may view only. Reuses the existing org role vocabulary — no new
// permission system.
// ============================================================================
const VIEWER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator", "support"]);
const CONFIG_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager"]);
const REFRESH_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager"]);
const STATUS_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator"]);

/** May view the safe listening feed. */
export const canViewListening = (role: string): boolean => VIEWER_ROLES.has((role || "").toLowerCase());
/** May create / enable / disable a listening source. */
export const canConfigureListening = (role: string): boolean => CONFIG_ROLES.has((role || "").toLowerCase());
/** May schedule a refresh. */
export const canRefreshListening = (role: string): boolean => REFRESH_ROLES.has((role || "").toLowerCase());
/** May change a local mention status / project it to the inbox. */
export const canChangeMentionStatus = (role: string): boolean => STATUS_ROLES.has((role || "").toLowerCase());
