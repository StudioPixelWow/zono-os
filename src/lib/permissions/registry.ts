/**
 * Centralized permission registry. Single source of truth mapping resources ×
 * actions → the minimum role rank required. Mirrors the database RLS
 * (has_min_role) so the app and UI share one model instead of hardcoding checks
 * in many places. Client-safe (pure data).
 */
export interface RoleDef { key: string; label: string; rank: number; seeded: boolean }

export const ROLES: RoleDef[] = [
  { key: "owner", label: "בעלים", rank: 100, seeded: true },
  { key: "admin", label: "מנהל מערכת", rank: 80, seeded: true },
  { key: "manager", label: "מנהל", rank: 60, seeded: true },
  { key: "branch_manager", label: "מנהל סניף", rank: 60, seeded: false },
  { key: "agent", label: "סוכן", rank: 40, seeded: true },
  { key: "assistant", label: "אסיסטנט", rank: 30, seeded: false },
  { key: "viewer", label: "צופה", rank: 20, seeded: true },
];

export const ACTIONS = ["view", "edit", "delete", "approve", "assign", "recompute", "admin"] as const;
export type PermAction = (typeof ACTIONS)[number];
export const ACTION_LABEL: Record<PermAction, string> = {
  view: "צפייה", edit: "עריכה", delete: "מחיקה", approve: "אישור", assign: "שיוך", recompute: "חישוב", admin: "ניהול",
};

const N = 999; // not applicable
export interface ResourceRule { resource: string; label: string; min: Record<PermAction, number> }

/** Min role rank per action. 999 = action not applicable to the resource. */
export const RESOURCES: ResourceRule[] = [
  { resource: "properties", label: "נכסים", min: { view: 20, edit: 40, delete: 60, approve: 60, assign: 60, recompute: N, admin: N } },
  { resource: "buyers", label: "קונים", min: { view: 20, edit: 40, delete: 60, approve: N, assign: 60, recompute: N, admin: N } },
  { resource: "sellers", label: "מוכרים", min: { view: 20, edit: 40, delete: 60, approve: N, assign: 60, recompute: N, admin: N } },
  { resource: "deals", label: "עסקאות", min: { view: 40, edit: 40, delete: 60, approve: 60, assign: 60, recompute: 60, admin: N } },
  { resource: "leads_routing", label: "ניתוב לידים", min: { view: 60, edit: 60, delete: N, approve: N, assign: 60, recompute: 60, admin: N } },
  { resource: "intelligence", label: "מנועי מודיעין", min: { view: 40, edit: N, delete: N, approve: N, assign: N, recompute: 60, admin: N } },
  { resource: "transactions", label: "עסקאות שוק / כיסוי", min: { view: 40, edit: 40, delete: 60, approve: N, assign: N, recompute: 60, admin: N } },
  { resource: "operating_areas", label: "אזורי פעילות", min: { view: 40, edit: 40, delete: N, approve: N, assign: 60, recompute: 40, admin: N } },
  { resource: "external_listings", label: "נכסים חיצוניים", min: { view: 40, edit: 40, delete: 60, approve: 60, assign: N, recompute: 60, admin: N } },
  { resource: "system_engines", label: "מרכז חישוב", min: { view: 60, edit: N, delete: N, approve: N, assign: N, recompute: 60, admin: 80 } },
  { resource: "data_quality", label: "איכות דאטה", min: { view: 60, edit: N, delete: N, approve: N, assign: N, recompute: N, admin: N } },
  { resource: "configuration", label: "תצורה", min: { view: 60, edit: N, delete: N, approve: N, assign: N, recompute: N, admin: 80 } },
  { resource: "permissions", label: "הרשאות", min: { view: 60, edit: N, delete: N, approve: N, assign: N, recompute: N, admin: 100 } },
  { resource: "audit_log", label: "יומן ביקורת", min: { view: 60, edit: N, delete: N, approve: N, assign: N, recompute: N, admin: N } },
];

/** Can a role rank perform an action on a resource? */
export function can(rank: number, resource: string, action: PermAction): boolean {
  const rule = RESOURCES.find((r) => r.resource === resource);
  if (!rule) return false;
  const min = rule.min[action];
  return min !== N && rank >= min;
}

export const NOT_APPLICABLE = N;
