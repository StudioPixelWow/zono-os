// ============================================================================
// ZONO — PLATFORM ADMIN operator management (server-only). P5.9. Manages the
// platform_operators registry (ZONO staff) — DISJOINT from organization roles.
// A customer org owner/admin is NEVER a platform operator, and nothing here ever
// reads or writes an organization role. Pattern (P5.0):
//   assertPlatformCapability(cap) → validate → protect → service-role → audit.
// HARD RULES:
//   · Reads gated platform.admins.read; every mutation gated platform.admins.manage
//     (super_admin only in the current matrix — NOT widened).
//   · Last-active-super-admin protection + operator self-protection (cannot
//     demote/suspend yourself into locking out the final super_admin).
//   · Reason required for every mutation; before/after audited. NO secrets.
//   · NEVER creates passwords, NEVER uses auth.admin, NEVER auto-promotes an org
//     owner. A target must already exist as a real user.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { writePlatformAudit } from "./audit";
import { PLATFORM_ROLES, type PlatformRole } from "../capabilities";

export class AdminUsersError extends Error {
  constructor(message: string) { super(message); this.name = "AdminUsersError"; }
}

function isRole(v: string): v is PlatformRole { return (PLATFORM_ROLES as readonly string[]).includes(v); }
function requireReason(reason?: string | null): string {
  const t = (reason ?? "").trim();
  if (t.length < 3) throw new AdminUsersError("נדרש נימוק לפעולה");
  return t;
}

interface RawOperator { user_id: string; platform_role: string; status: string; created_by: string | null; created_at: string }
const OP_COLS = "user_id,platform_role,status,created_by,created_at";

export interface OperatorRow {
  userId: string; name: string | null; role: PlatformRole; status: string;
  createdBy: string | null; createdByName: string | null; createdAt: string;
  lastActionAt: string | null; lastAction: string | null;
}

async function names(db: ReturnType<typeof createServiceRoleClient>, ids: string[]): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>();
  const clean = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!clean.length) return m;
  try { const { data } = await db.from("users").select("id,full_name").in("id", clean); for (const u of ((data ?? []) as { id: string; full_name: string | null }[])) m.set(u.id, u.full_name); } catch { /* degrade */ }
  return m;
}

/** All platform operators + their last privileged action (from the audit log). */
export async function listPlatformOperators(): Promise<OperatorRow[]> {
  const operator = await assertPlatformCapability("platform.admins.read");
  const db = createServiceRoleClient();
  let rows: RawOperator[] = [];
  try { const { data } = await db.from("platform_operators" as never).select(OP_COLS).order("created_at", { ascending: true }).limit(500); rows = ((data ?? []) as RawOperator[]); } catch { rows = []; }
  const nameMap = await names(db, [...rows.map((r) => r.user_id), ...rows.map((r) => r.created_by).filter((x): x is string => !!x)]);
  // Last action per operator (one bounded query; newest per actor in memory).
  const lastByActor = new Map<string, { action: string; at: string }>();
  if (rows.length) {
    try {
      const { data } = await db.from("platform_audit_log" as never).select("actor_id,action,created_at")
        .in("actor_id" as never, rows.map((r) => r.user_id) as never).order("created_at", { ascending: false }).limit(2000);
      for (const a of ((data ?? []) as { actor_id: string; action: string; created_at: string }[])) {
        if (a.actor_id && !lastByActor.has(a.actor_id)) lastByActor.set(a.actor_id, { action: a.action, at: a.created_at });
      }
    } catch { /* last-action degrades to null */ }
  }
  await writePlatformAudit({ operator, capability: "platform.admins.read", action: "admins.list", resourceType: "platform", metadata: { count: rows.length } });
  return rows.map((r) => {
    const la = lastByActor.get(r.user_id);
    return { userId: r.user_id, name: nameMap.get(r.user_id) ?? null, role: (isRole(r.platform_role) ? r.platform_role : "developer") as PlatformRole, status: r.status, createdBy: r.created_by, createdByName: r.created_by ? (nameMap.get(r.created_by) ?? null) : null, createdAt: r.created_at, lastActionAt: la?.at ?? null, lastAction: la?.action ?? null };
  });
}

// ── Super-admin protection helpers ──────────────────────────────────────────
async function loadOperator(db: ReturnType<typeof createServiceRoleClient>, userId: string): Promise<RawOperator> {
  const { data, error } = await db.from("platform_operators" as never).select(OP_COLS).eq("user_id" as never, userId as never).maybeSingle();
  if (error) throw new AdminUsersError("טעינת המפעיל נכשלה");
  const row = (data as RawOperator | null) ?? null;
  if (!row) throw new AdminUsersError("המפעיל לא נמצא");
  return row;
}
async function activeSuperAdminCount(db: ReturnType<typeof createServiceRoleClient>): Promise<number> {
  const { count } = await db.from("platform_operators" as never).select("*", { count: "exact", head: true })
    .eq("platform_role" as never, "super_admin" as never).eq("status" as never, "active" as never);
  return count ?? 0;
}
/** True if removing super_admin power from this user (demote/suspend) would leave
 *  ZERO active super_admins. */
async function isLastActiveSuperAdmin(db: ReturnType<typeof createServiceRoleClient>, target: RawOperator): Promise<boolean> {
  if (target.platform_role !== "super_admin" || target.status !== "active") return false;
  return (await activeSuperAdminCount(db)) <= 1;
}

// ── Mutations (all cap platform.admins.manage) ──────────────────────────────
export async function createPlatformOperator(input: { targetUserId: string; role: string; reason: string }): Promise<void> {
  const operator = await assertPlatformCapability("platform.admins.manage");
  const reason = requireReason(input.reason);
  if (!isRole(input.role)) throw new AdminUsersError("תפקיד פלטפורמה לא תקין");
  const db = createServiceRoleClient();
  // Target must already exist as a real user (never create credentials here).
  const { data: u } = await db.from("users").select("id").eq("id", input.targetUserId).maybeSingle();
  if (!u) throw new AdminUsersError("משתמש היעד אינו קיים במערכת");
  const { data: existing } = await db.from("platform_operators" as never).select("user_id").eq("user_id" as never, input.targetUserId as never).maybeSingle();
  if (existing) throw new AdminUsersError("המשתמש כבר מוגדר כמפעיל פלטפורמה");
  const { error } = await db.from("platform_operators" as never).insert({ user_id: input.targetUserId, platform_role: input.role, status: "active", created_by: operator.userId } as never);
  if (error) throw new AdminUsersError("יצירת המפעיל נכשלה");
  await writePlatformAudit({ operator, capability: "platform.admins.manage", action: "platform.operator.create", resourceType: "platform_operator", resourceId: input.targetUserId, reason, metadata: { before: null, after: input.role } });
}

export async function setOperatorRole(input: { userId: string; role: string; reason: string }): Promise<void> {
  const operator = await assertPlatformCapability("platform.admins.manage");
  const reason = requireReason(input.reason);
  if (!isRole(input.role)) throw new AdminUsersError("תפקיד פלטפורמה לא תקין");
  const db = createServiceRoleClient();
  const target = await loadOperator(db, input.userId);
  if (target.platform_role === input.role) throw new AdminUsersError("אין שינוי בתפקיד");
  // Protection: demoting the final active super_admin (incl. yourself) is blocked.
  if (input.role !== "super_admin" && await isLastActiveSuperAdmin(db, target)) {
    throw new AdminUsersError("לא ניתן להוריד את מנהל-העל הפעיל האחרון");
  }
  const { error } = await db.from("platform_operators" as never).update({ platform_role: input.role, updated_at: new Date().toISOString() } as never).eq("user_id" as never, input.userId as never);
  if (error) throw new AdminUsersError("שינוי התפקיד נכשל");
  await writePlatformAudit({ operator, capability: "platform.admins.manage", action: "platform.operator.role.change", resourceType: "platform_operator", resourceId: input.userId, reason, metadata: { before: target.platform_role, after: input.role, self: input.userId === operator.userId } });
}

export async function setOperatorStatus(input: { userId: string; action: "suspend" | "activate"; reason: string }): Promise<void> {
  const operator = await assertPlatformCapability("platform.admins.manage");
  const reason = requireReason(input.reason);
  const db = createServiceRoleClient();
  const target = await loadOperator(db, input.userId);
  const nextStatus = input.action === "suspend" ? "suspended" : "active";
  if (target.status === nextStatus) throw new AdminUsersError("אין שינוי בסטטוס");
  // Protection: suspending the final active super_admin (incl. yourself) is blocked.
  if (input.action === "suspend" && await isLastActiveSuperAdmin(db, target)) {
    throw new AdminUsersError("לא ניתן להשעות את מנהל-העל הפעיל האחרון");
  }
  const { error } = await db.from("platform_operators" as never).update({ status: nextStatus, updated_at: new Date().toISOString() } as never).eq("user_id" as never, input.userId as never);
  if (error) throw new AdminUsersError("שינוי הסטטוס נכשל");
  await writePlatformAudit({ operator, capability: "platform.admins.manage", action: input.action === "suspend" ? "platform.operator.suspend" : "platform.operator.reactivate", resourceType: "platform_operator", resourceId: input.userId, reason, metadata: { before: target.status, after: nextStatus, self: input.userId === operator.userId } });
}
