// ============================================================================
// ZONO — PLATFORM SECURITY model (P5.9). PURE, client-safe. Labels + the
// deterministic sensitive-action classification + secret-stripping used by the
// Security Center. No auth power here.
// ============================================================================
import { PLATFORM_ROLES, PLATFORM_CAPABILITIES, roleHasCapability, type PlatformRole, type PlatformCapability } from "@/lib/platform-admin/capabilities";

export const ROLE_LABEL: Record<PlatformRole, string> = {
  super_admin: "מנהל-על", operations: "תפעול", support: "תמיכה", billing_admin: "מנהל חיוב", developer: "מפתח",
};

// Human labels for the capability matrix (fallback = the raw key).
export const CAPABILITY_LABEL: Record<string, string> = {
  "platform.customers.read": "לקוחות — צפייה", "platform.customers.manage": "לקוחות — ניהול",
  "platform.users.read": "משתמשים — צפייה", "platform.users.manage": "משתמשים — ניהול",
  "platform.billing.read": "חיוב — צפייה", "platform.billing.manage": "חיוב — ניהול",
  "platform.flags.read": "דגלים — צפייה", "platform.flags.manage": "דגלים — ניהול",
  "platform.entitlements.read": "זכאויות — צפייה", "platform.entitlements.manage": "זכאויות — ניהול",
  "platform.usage.read": "שימוש — צפייה", "platform.ai.read": "AI — צפייה",
  "platform.integrations.read": "אינטגרציות — צפייה", "platform.integrations.manage": "אינטגרציות — ניהול",
  "platform.ops.read": "תפעול — צפייה", "platform.ops.replay": "תפעול — ניתוב מחדש",
  "platform.support.read": "תמיכה — צפייה", "platform.support.manage": "תמיכה — ניהול", "platform.support.impersonate": "מצב תמיכה (צפייה כמשתמש)",
  "platform.audit.read": "יומן ביקורת — צפייה", "platform.admins.read": "מנהלי פלטפורמה — צפייה", "platform.admins.manage": "מנהלי פלטפורמה — ניהול",
};
export function capabilityLabel(cap: string): string { return CAPABILITY_LABEL[cap] ?? cap; }

// ── Capability matrix (READ-ONLY; sourced from the authoritative registry) ──
// The SAME roleHasCapability() that assertPlatformCapability() uses — no second
// permission model. Role→capability is CODE-DEFINED (no dynamic editor).
export interface MatrixCell { role: PlatformRole; allowed: boolean }
export interface MatrixRow { capability: PlatformCapability; label: string; cells: MatrixCell[] }
export function buildCapabilityMatrix(): { roles: PlatformRole[]; rows: MatrixRow[] } {
  return {
    roles: [...PLATFORM_ROLES],
    rows: PLATFORM_CAPABILITIES.map((cap) => ({
      capability: cap, label: capabilityLabel(cap),
      cells: PLATFORM_ROLES.map((role) => ({ role, allowed: roleHasCapability(role, cap) })),
    })),
  };
}

// ── Sensitive-action classification (deterministic) ─────────────────────────
const SENSITIVE_PREFIXES = [
  "platform.operator.", "platform.session.", "platform.security.",
  "support.impersonation.start", "support.impersonation.denied",
  "customer360.effective_access", "flags.", "entitlements.",
  "support.ticket.assign", "support.ticket.status.change", "support.ticket.priority.change",
];
export function isSensitiveAction(action: string): boolean {
  return SENSITIVE_PREFIXES.some((p) => action === p || action.startsWith(p));
}
export function isDeniedAction(action: string): boolean { return action.endsWith(".denied"); }

export const ACTION_LABEL: Record<string, string> = {
  "platform.operator.create": "מפעיל נוצר", "platform.operator.role.change": "שינוי תפקיד מפעיל",
  "platform.operator.suspend": "מפעיל הושעה", "platform.operator.reactivate": "מפעיל הופעל",
  "support.impersonation.start": "מצב תמיכה — התחלה", "support.impersonation.end": "מצב תמיכה — סיום",
  "support.impersonation.expired": "מצב תמיכה — פג", "support.impersonation.denied": "מצב תמיכה — נדחה",
  "support.ticket.create": "פנייה נוצרה", "support.ticket.status.change": "שינוי סטטוס פנייה",
};
export function actionLabel(action: string): string { return ACTION_LABEL[action] ?? action; }

// ── Secret stripping for audit diffs (defense-in-depth) ─────────────────────
const SECRET_KEY_RE = /token|secret|password|passwd|cookie|authorization|service.?role|signature|refresh|api.?key|private.?key|credential/i;
export function stripSecrets(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) { out[k] = "•••"; continue; }
    out[k] = (v && typeof v === "object") ? "{…}" : v;
  }
  return out;
}
