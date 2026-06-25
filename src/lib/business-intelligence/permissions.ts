// ============================================================================
// ZONO — Executive Intelligence access (server-only). Managers, office owners
// and enterprise admins only. Org-scoped, never cross-org.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { ExecRole } from "./types";

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };

function toRole(key: string): ExecRole {
  if (key === "owner") return "office_owner";
  if (key === "admin") return "enterprise_admin";
  return "manager";
}

export interface ExecAccess {
  db: ReturnType<typeof createServiceRoleClient>;
  orgId: string;
  userId: string;
  roleKey: string;
  role: ExecRole;
}

export async function getExecAccess(): Promise<ExecAccess> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = createServiceRoleClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data } = await db.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = (data as { key: string } | null)?.key ?? "agent";
  }
  if ((ROLE_RANK[roleKey] ?? 0) < ROLE_RANK.manager!) throw new Error("מודיעין מנהלים זמין למנהלים, בעלי משרד ומנהלי ארגון בלבד.");
  return { db, orgId: profile.org_id, userId: user.id, roleKey, role: toRole(roleKey) };
}
