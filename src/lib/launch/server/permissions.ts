// ============================================================================
// ZONO — launch platform access control (server-only). Member context for
// feedback/onboarding/usage; admin gate for plan/beta/diagnostics/support.
// Strictly org-scoped, mirrors the platform/office access pattern.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };

export interface LaunchContext {
  db: ReturnType<typeof createServiceRoleClient>;
  orgId: string;
  userId: string;
  roleKey: string;
  roleRank: number;
  actorLabel: string;
  email: string | null;
}

/** Any authenticated org member. Throws when unauthenticated / no org. */
export async function getLaunchContext(): Promise<LaunchContext> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = createServiceRoleClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data } = await db.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = (data as { key: string } | null)?.key ?? "agent";
  }
  return {
    db, orgId: profile.org_id, userId: user.id, roleKey,
    roleRank: ROLE_RANK[roleKey] ?? 0,
    actorLabel: profile.full_name ?? user.email ?? "משתמש",
    email: user.email ?? null,
  };
}

/** Admin/owner only. Throws for everyone else. */
export async function assertLaunchAdminAccess(): Promise<LaunchContext> {
  const ctx = await getLaunchContext();
  if (ctx.roleRank < ROLE_RANK.admin) throw new Error("פעולה זו זמינה למנהלי מערכת בלבד.");
  return ctx;
}

/** Manager+ (for onboarding writes / feedback triage). */
export async function assertLaunchManagerAccess(): Promise<LaunchContext> {
  const ctx = await getLaunchContext();
  if (ctx.roleRank < ROLE_RANK.manager) throw new Error("פעולה זו זמינה למנהלים בלבד.");
  return ctx;
}
