// ============================================================================
// ZI Expert™ — permissions (Phase 22, PURE / client-safe).
// ZI must respect permissions: it only explains features the user can access,
// never exposes hidden / enterprise-only capabilities, and never another
// organization's data. This layer reuses the navigation registry's roleMin.
// ============================================================================
import { MODULES, type ModuleEntry } from "@/lib/navigation/registry";
import type { RoleKey } from "./types";

export const ROLE_RANK: Record<RoleKey, number> = {
  viewer: 20,
  agent: 40,
  manager: 60,
  admin: 80,
  owner: 100,
};

export function rankForRole(role: RoleKey | null): number {
  return role ? ROLE_RANK[role] : ROLE_RANK.viewer;
}

/** Modules the given role may access (roleMin gate). */
export function accessibleModules(role: RoleKey | null): ModuleEntry[] {
  const rank = rankForRole(role);
  return MODULES.filter((m) => ROLE_RANK[m.roleMin] <= rank);
}

export function accessibleModuleIds(role: RoleKey | null): string[] {
  return accessibleModules(role).map((m) => m.id);
}

/** Can this role access the module behind a given module id? */
export function canAccessModuleId(role: RoleKey | null, moduleId: string | null): boolean {
  if (!moduleId) return true; // generic / non-module context is always allowed
  const mod = MODULES.find((m) => m.id === moduleId);
  if (!mod) return true; // unknown module → not a gated feature
  return ROLE_RANK[mod.roleMin] <= rankForRole(role);
}

/** Can this role access the module that owns a given route? */
export function canAccessRoute(role: RoleKey | null, route: string | null): boolean {
  if (!route) return true;
  const rank = rankForRole(role);
  // longest-prefix match against registry routes
  let best: ModuleEntry | null = null;
  let bestLen = 0;
  for (const m of MODULES) {
    if (m.route === route) { best = m; break; }
    if (m.route !== "/" && route.startsWith(m.route) && m.route.length > bestLen) { best = m; bestLen = m.route.length; }
  }
  if (!best) return true;
  return ROLE_RANK[best.roleMin] <= rank;
}

/**
 * Guardrail line appended to the prompt so the model never describes a feature
 * the user can't reach. Lists the accessible module labels (names only).
 */
export function permissionScopeLine(role: RoleKey | null): string {
  const labels = accessibleModules(role).map((m) => m.label);
  return `הרשאות המשתמש (${role ?? "viewer"}): ענה אך ורק על יכולות בתוך המודולים שהמשתמש רשאי לגשת אליהם — ${labels.join(", ")}. אל תחשוף או תתאר יכולות שאינן זמינות להרשאה זו, יכולות Enterprise נסתרות, או נתונים של ארגון אחר.`;
}
