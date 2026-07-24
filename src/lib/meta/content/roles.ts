// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · ROLE → PERMISSION MODEL (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Maps a caller's role to content-prep permissions. Pure + testable. Product
// policy: creators cannot approve their own draft (self-approval off). ZONO
// Support / Read-Only get no write/approve rights here.
// ============================================================================
import type { ApprovalPermissionCtx } from "./approval";

export const APPROVER_ROLES: ReadonlySet<string> = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "reviewer", "approver"]);
export const EDITOR_ROLES: ReadonlySet<string> = new Set(["owner", "admin", "org_admin", "manager", "marketing_manager", "content_creator", "agent", "broker"]);
/** Roles with no content write/approve access (read-only + support). */
export const READONLY_ROLES: ReadonlySet<string> = new Set(["read_only", "readonly", "viewer", "zono_support", "support"]);

export function canEditDrafts(role: string): boolean {
  const r = (role || "").toLowerCase();
  return EDITOR_ROLES.has(r) && !READONLY_ROLES.has(r);
}
export function canApproveDrafts(role: string): boolean {
  const r = (role || "").toLowerCase();
  return APPROVER_ROLES.has(r) && !READONLY_ROLES.has(r);
}

/** Resolve the approval permission context for a role (self-approval off). */
export function resolvePermissions(role: string, isCreator: boolean): Omit<ApprovalPermissionCtx, "hasPendingRequest"> {
  return { canApprove: canApproveDrafts(role), canEdit: canEditDrafts(role), isCreator, allowSelfApproval: false };
}
