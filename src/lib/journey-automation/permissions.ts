// ============================================================================
// ZONO — Journey Automation access (server-only). Org-scoped. Authoring +
// running journeys requires manager+; agents can view. Never cross-org.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };

export interface JourneyAccess {
  db: ReturnType<typeof createServiceRoleClient>;
  orgId: string;
  userId: string;
  roleKey: string;
  canManage: boolean;
}

export async function getJourneyAccess(): Promise<JourneyAccess> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = createServiceRoleClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data } = await db.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = (data as { key: string } | null)?.key ?? "agent";
  }
  return { db, orgId: profile.org_id, userId: user.id, roleKey, canManage: (ROLE_RANK[roleKey] ?? 0) >= ROLE_RANK.manager! };
}

export function assertManage(access: JourneyAccess): void {
  if (!access.canManage) throw new Error("ניהול אוטומציות זמין למנהלים בלבד.");
}
