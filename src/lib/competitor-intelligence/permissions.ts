// ============================================================================
// ZONO — Competitor Intelligence access (server-only). Managers/owners see the
// full org market view; agents see only their own operating areas. Org-scoped,
// never cross-org.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { CompetitorDashboard } from "./types";

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };

function toRole(key: string): CompetitorDashboard["role"] {
  if (key === "owner") return "office_owner";
  if (key === "admin") return "enterprise_admin";
  if (key === "manager") return "manager";
  if (key === "team_leader") return "team_leader";
  return "agent";
}

export interface CompetitorAccess {
  db: ReturnType<typeof createServiceRoleClient>;
  orgId: string;
  userId: string;
  roleKey: string;
  role: CompetitorDashboard["role"];
  /** Managers+ see the whole org market; agents are scoped to own areas. */
  fullMarketView: boolean;
}

export async function getCompetitorAccess(): Promise<CompetitorAccess> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = createServiceRoleClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data } = await db.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = (data as { key: string } | null)?.key ?? "agent";
  }
  const rank = ROLE_RANK[roleKey] ?? 0;
  return { db, orgId: profile.org_id, userId: user.id, roleKey, role: toRole(roleKey), fullMarketView: rank >= ROLE_RANK.manager! };
}

/** Agent operating cities (subset scope). Empty = no restriction list available. */
export async function agentOperatingCities(db: ReturnType<typeof createServiceRoleClient>, userId: string): Promise<string[]> {
  const { data } = await db
    .from("user_operating_localities" as never)
    .select("city_name")
    .eq("user_id", userId)
    .eq("is_active", true);
  return [...new Set(((data ?? []) as unknown as { city_name: string | null }[]).map((r) => (r.city_name ?? "").trim()).filter(Boolean))];
}
