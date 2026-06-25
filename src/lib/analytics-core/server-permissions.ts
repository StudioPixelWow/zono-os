// ============================================================================
// ZONO — Analytics Core: server-only permission helpers. Consolidates the
// org-context + role-gate pattern repeated across intelligence modules. Always
// org-scoped — never cross-org. New code should adopt these; existing module
// gates remain valid until they converge (see Phase 19.5 report).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { ROLE_RANK, toExecRole, type RoleKey, type ExecRoleLabel } from "./permissions";

export interface OrgContext {
  db: ReturnType<typeof createServiceRoleClient>;
  orgId: string;
  userId: string;
  roleKey: string;
  execRole: ExecRoleLabel;
}

/** Resolve the current org context (db + org + role). Throws if unauthenticated. */
export async function getCurrentOrgContext(): Promise<OrgContext> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = createServiceRoleClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data } = await db.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = (data as { key: string } | null)?.key ?? "agent";
  }
  return { db, orgId: profile.org_id, userId: user.id, roleKey, execRole: toExecRole(roleKey) };
}

/** Any authenticated org member. */
export async function assertOrgAccess(): Promise<OrgContext> {
  return getCurrentOrgContext();
}

/** Require at least the given role; default manager. */
export async function assertMinRole(min: RoleKey = "manager", message?: string): Promise<OrgContext> {
  const ctx = await getCurrentOrgContext();
  if ((ROLE_RANK[ctx.roleKey] ?? 0) < ROLE_RANK[min]!) throw new Error(message ?? "אין הרשאה מספקת.");
  return ctx;
}

export const assertManagerAccess = (message?: string): Promise<OrgContext> => assertMinRole("manager", message ?? "זמין למנהלים בלבד.");
export const assertAgentAccess = (message?: string): Promise<OrgContext> => assertMinRole("agent", message);
