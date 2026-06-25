// ============================================================================
// ZONO — platform admin access control (server-only). The Health Center,
// feature flags and audit trail are admin/owner only, strictly org-scoped.
// No cross-org leakage. Mirrors the office-intelligence access pattern.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };
const MIN_RANK = ROLE_RANK.admin; // admins and owners only

export interface PlatformAccess {
  db: ReturnType<typeof createServiceRoleClient>;
  orgId: string;
  userId: string;
  roleKey: string;
  actorLabel: string;
}

/** Assert the current user may use platform admin tools. Throws for non-admins. */
export async function assertPlatformAdminAccess(): Promise<PlatformAccess> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = createServiceRoleClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data } = await db.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = (data as { key: string } | null)?.key ?? "agent";
  }
  if ((ROLE_RANK[roleKey] ?? 0) < MIN_RANK) {
    throw new Error("מרכז הפלטפורמה זמין למנהלי מערכת בלבד.");
  }
  return {
    db,
    orgId: profile.org_id,
    userId: user.id,
    roleKey,
    actorLabel: profile.full_name ?? user.email ?? "מנהל מערכת",
  };
}

/** Non-throwing variant — returns null when the user is not a platform admin. */
export async function tryPlatformAdminAccess(): Promise<PlatformAccess | null> {
  try { return await assertPlatformAdminAccess(); } catch { return null; }
}
