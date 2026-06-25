// ============================================================================
// ZONO — Analytics Core: role-rank helpers (pure, client-safe). One source of
// truth for the role hierarchy used by every intelligence module's access gate.
// ============================================================================
export type RoleKey = "owner" | "admin" | "manager" | "team_leader" | "agent" | "viewer";

export const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 };

export const RANK = { owner: 100, admin: 80, manager: 60, team_leader: 50, agent: 40, viewer: 20 } as const;

export function roleRank(key: string | null | undefined): number {
  return ROLE_RANK[key ?? "viewer"] ?? 0;
}

export function hasMinRole(key: string | null | undefined, min: RoleKey): boolean {
  return roleRank(key) >= ROLE_RANK[min]!;
}

export const isManagerPlus = (key: string | null | undefined): boolean => hasMinRole(key, "manager");
export const isAgentPlus = (key: string | null | undefined): boolean => hasMinRole(key, "agent");

/** Map an org role key to an executive role label. */
export type ExecRoleLabel = "manager" | "office_owner" | "enterprise_admin" | "team_leader" | "agent";
export function toExecRole(key: string): ExecRoleLabel {
  if (key === "owner") return "office_owner";
  if (key === "admin") return "enterprise_admin";
  if (key === "manager") return "manager";
  if (key === "team_leader") return "team_leader";
  return "agent";
}
