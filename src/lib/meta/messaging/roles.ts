// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · MESSAGING ROLE GATES (PURE). Phase 6.
// ----------------------------------------------------------------------------
// Pure role predicates shared by the server service + QA. Viewing DMs, drafting a
// reply, and APPROVING an outbound send are distinct privileges — approval (which
// permits an actual provider write) is the most restricted. Reuses the existing org
// role vocabulary — no new permission system. AI/copilot may DRAFT; only an approver
// may release a send.
// ============================================================================
const VIEWER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator", "support"]);
const DRAFT_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator", "support"]);
const APPROVE_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager"]);
const ASSIGN_ROLES = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager"]);

/** May view DM conversations + (decrypted) messages. */
export const canViewMessaging = (role: string): boolean => VIEWER_ROLES.has((role || "").toLowerCase());
/** May create a reviewable outbound draft (never sends). */
export const canDraftMessage = (role: string): boolean => DRAFT_ROLES.has((role || "").toLowerCase());
/** May APPROVE + release an outbound send (a provider write). */
export const canApproveSendRole = (role: string): boolean => APPROVE_ROLES.has((role || "").toLowerCase());
/** May assign / change conversation state. */
export const canManageConversation = (role: string): boolean => ASSIGN_ROLES.has((role || "").toLowerCase());
