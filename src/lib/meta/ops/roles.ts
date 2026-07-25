// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · OPS ROLE GATE (PURE).
// ----------------------------------------------------------------------------
// The Ops Console is a privileged, READ-ONLY operational surface (queue health,
// dead-letter visibility, webhook freshness). Viewing it is restricted to org
// admins/owners. Reuses the existing org role vocabulary — no new permission
// system. Pure predicate shared by the server action + offline QA.
// ============================================================================
const OPS_VIEWER_ROLES = new Set(["owner", "admin", "org_admin"]);

/** May view the Meta Ops Console (read-only operational health). */
export const canViewOps = (role: string): boolean => OPS_VIEWER_ROLES.has((role || "").toLowerCase());
