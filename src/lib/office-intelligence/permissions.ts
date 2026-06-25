// ============================================================================
// ZONO — Office Intelligence access control (server-only). Role-aware, strictly
// org-scoped, no cross-org leakage. Agents are blocked; manager/owner allowed.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { OfficeRole } from "./types";

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };
const MIN_RANK = ROLE_RANK.manager; // managers and above

/** Map the org role key → an OfficeRole label. */
function toOfficeRole(key: string): OfficeRole {
  if (key === "owner") return "office_owner";
  if (key === "admin") return "enterprise_admin";
  if (key === "manager") return "manager";
  if (key === "team_leader") return "team_leader";
  return "agent";
}

export interface OfficeAccess { db: ReturnType<typeof createServiceRoleClient>; orgId: string; userId: string; role: OfficeRole; roleKey: string; managerName: string }

/**
 * Assert the current user may view Office Intelligence for their org. Throws for
 * agents/viewers. Returns the org-scoped context (never cross-org).
 */
export async function assertOfficeIntelligenceAccess(): Promise<OfficeAccess> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = createServiceRoleClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data } = await db.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = (data as { key: string } | null)?.key ?? "agent";
  }
  if ((ROLE_RANK[roleKey] ?? 0) < MIN_RANK) {
    throw new Error("מרכז מודיעין המשרד זמין למנהלים בלבד.");
  }
  return { db, orgId: profile.org_id, userId: user.id, role: toOfficeRole(roleKey), roleKey, managerName: profile.full_name ?? "מנהל/ת" };
}

/** Non-throwing capability check (for conditional UI / nav). */
export async function canAccessOfficeIntelligence(): Promise<boolean> {
  try { await assertOfficeIntelligenceAccess(); return true; } catch { return false; }
}
