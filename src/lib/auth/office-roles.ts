// ============================================================================
// ZONO — PURE role-tier predicates for office-scoped capabilities. Manager-tier
// gates office-wide reads/actions (office intelligence, office briefs); owner-tier
// gates the most privileged operations (global knowledge re-seed). Pair with the
// server-derived role from resolveRoleKey(); reuses the existing role vocabulary —
// no new permission system. Pure + client-safe + unit-testable.
// ============================================================================
const OWNER_ROLES = new Set(["owner", "admin", "org_admin"]);
const MANAGER_ROLES = new Set(["owner", "admin", "org_admin", "manager", "office_manager"]);

/** Owner/admin tier — the most privileged org operations. */
export const isOwnerRole = (role: string): boolean => OWNER_ROLES.has((role || "").toLowerCase());
/** Manager tier (includes owner) — office-wide reads/actions. */
export const isManagerRole = (role: string): boolean => MANAGER_ROLES.has((role || "").toLowerCase());
