// ============================================================================
// ZONO — PURE role predicate for managing SHARED provider connections.
// Connecting or disconnecting an org's Meta/Facebook/WhatsApp integration mutates
// a shared, org-level resource (every agent depends on it), so it is restricted to
// owner/manager/admin — an individual agent must not be able to tear down the
// office's integration. Pure + client-safe; pair with the server-derived role from
// resolveRoleKey(). Reuses the existing role vocabulary — no new permission system.
// ============================================================================
const MANAGE_CONNECTION_ROLES = new Set(["owner", "admin", "org_admin", "manager", "office_manager"]);

/** May connect/disconnect the org's shared provider integrations. */
export const canManageConnections = (role: string): boolean =>
  MANAGE_CONNECTION_ROLES.has((role || "").toLowerCase());
