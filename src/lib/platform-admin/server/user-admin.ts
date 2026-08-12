// ============================================================================
// ZONO — PLATFORM ADMIN user administration (server-only). P5.3.
// ----------------------------------------------------------------------------
// Cross-org user directory (read) + audited service-role MUTATIONS (invite,
// resend, activate/suspend, change org role). This is the ONLY place platform
// user writes happen. Every mutation:
//   1. verifies a PLATFORM capability first (never an org role);
//   2. resolves the target strictly WITHIN the target orgId (tenancy — a user
//      or role that does not belong to orgId is rejected, so no crafted request
//      can reach another tenant);
//   3. enforces owner / self-escalation protections;
//   4. writes via service-role and records a platform audit event;
//   5. returns minimal, secret-free data (NEVER the invite token in audit).
//
// Capability model (NO widening in P5.3): reads require platform.users.read
// (every operator); ALL mutations require platform.users.manage (super_admin
// only, per capabilities.ts). Org ROLES only — a platform role can never be
// assigned here because role_key must exist in the target org's `roles` table.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { writePlatformAudit } from "./audit";

/** Expected, safe-to-surface validation failure (not an auth error). */
export class UserAdminError extends Error {
  constructor(message: string) { super(message); this.name = "UserAdminError"; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Directory (read) ────────────────────────────────────────────────────────
export interface PlatformUserRow {
  id: string; name: string | null; orgId: string; orgName: string | null;
  roleKey: string | null; roleName: string | null; status: string | null;
  lastSeenAt: string | null; createdAt: string | null;
}

/**
 * Cross-org user directory (minimal, NO email/phone). Single bounded query with
 * embedded org + role (no N+1). Cap: platform.users.read. Audited once as
 * users.directory (raw search text is never logged).
 */
export async function listPlatformUsers(opts: { search?: string; status?: string; limit?: number } = {}): Promise<PlatformUserRow[]> {
  const operator = await assertPlatformCapability("platform.users.read");
  const capped = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const db = createServiceRoleClient();
  let b = db.from("users" as never)
    .select("id,full_name,status,last_seen_at,created_at,org_id,organizations:org_id(name),roles:role_id(key,name)")
    .order("created_at", { ascending: false })
    .limit(capped);
  if (opts.status) b = (b as { eq: (c: string, v: string) => typeof b }).eq("status", opts.status);
  const s = (opts.search ?? "").trim();
  if (s) {
    const safe = s.replace(/[\\%_]/g, (m) => `\\${m}`);
    b = (b as { ilike: (c: string, v: string) => typeof b }).ilike("full_name", `%${safe}%`);
  }
  const { data } = await b;
  const rows = (data ?? []) as {
    id: string; full_name: string | null; status: string | null; last_seen_at: string | null; created_at: string | null;
    org_id: string; organizations: { name: string | null } | null; roles: { key: string | null; name: string | null } | null;
  }[];
  await writePlatformAudit({ operator, capability: "platform.users.read", action: "users.directory", resourceType: "user", metadata: { count: rows.length, status: opts.status ?? "all", q_len: s.length } });
  return rows.map((r) => ({
    id: r.id, name: r.full_name ?? null, orgId: r.org_id, orgName: r.organizations?.name ?? null,
    roleKey: r.roles?.key ?? null, roleName: r.roles?.name ?? null, status: r.status ?? null,
    lastSeenAt: r.last_seen_at ?? null, createdAt: r.created_at ?? null,
  }));
}

// ── Org roles (read; for the role picker) ───────────────────────────────────
export interface OrgRoleOption { key: string; name: string; rank: number }
const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, branch_manager: 55, team_leader: 50, agent: 40, assistant: 30, viewer: 20 };

/** Roles that belong to ONE org (authoritative set for role changes). Cap: users.read. */
export async function listOrgRolesForPlatform(orgId: string): Promise<OrgRoleOption[]> {
  await assertPlatformCapability("platform.users.read");
  const db = createServiceRoleClient();
  const { data } = await db.from("roles" as never)
    .select("key,name")
    .eq("org_id" as never, orgId as never)
    .limit(50);
  const rows = (data ?? []) as { key: string; name: string }[];
  return rows.map((r) => ({ key: r.key, name: r.name, rank: ROLE_RANK[r.key] ?? 0 }))
    .sort((a, b) => b.rank - a.rank);
}

// ── Org invitations (read; email is PII → gated to users.manage) ────────────
export interface OrgInvitationRow { id: string; email: string; roleKey: string; status: string; expiresAt: string | null; createdAt: string | null }

/**
 * Pending/accepted/expired invitations for ONE org. Returns the invitee `email`
 * (operationally necessary for resend) — so this is gated behind
 * platform.users.manage, NOT plain users.read. The invite `token` is NEVER
 * selected.
 */
export async function listOrgInvitationsForPlatform(orgId: string): Promise<OrgInvitationRow[]> {
  await assertPlatformCapability("platform.users.manage");
  const db = createServiceRoleClient();
  const { data } = await db.from("org_invitations" as never)
    .select("id,email,role_key,status,expires_at,created_at")
    .eq("org_id" as never, orgId as never)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as { id: string; email: string; role_key: string; status: string; expires_at: string | null; created_at: string | null }[];
  return rows.map((r) => ({ id: r.id, email: r.email, roleKey: r.role_key, status: r.status, expiresAt: r.expires_at ?? null, createdAt: r.created_at ?? null }));
}

// ── Seat usage (read; display-only, no fabrication) ─────────────────────────
export interface OrgSeatUsage {
  activeUsers: number | null; invitedUsers: number | null; pendingInvites: number | null;
  seatLimit: number | null; seatLimitDefined: boolean; remaining: number | null;
}

async function countUsers(db: ReturnType<typeof createServiceRoleClient>, orgId: string, status?: string): Promise<number | null> {
  try {
    let q = db.from("users" as never).select("*", { count: "exact", head: true }).eq("org_id" as never, orgId as never);
    if (status) q = (q as { eq: (c: string, v: string) => typeof q }).eq("status", status);
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  } catch { return null; }
}

/**
 * Seat usage for ONE org. `seatLimit` is populated ONLY from an authoritative
 * `org_plans.limits.seats` value; otherwise `seatLimitDefined:false` and no
 * limit is fabricated (P5.3 does NOT invent a billing seat model). Cap: users.read.
 */
export async function getOrgSeatUsage(orgId: string): Promise<OrgSeatUsage> {
  await assertPlatformCapability("platform.users.read");
  const db = createServiceRoleClient();
  const [activeUsers, invitedUsers, pendingInvites, limitRow] = await Promise.all([
    countUsers(db, orgId, "active"),
    countUsers(db, orgId, "invited"),
    (async () => { try { const { count, error } = await db.from("org_invitations" as never).select("*", { count: "exact", head: true }).eq("org_id" as never, orgId as never).eq("status" as never, "pending" as never); return error ? null : (count ?? 0); } catch { return null; } })(),
    (async () => { try { const { data } = await db.from("org_plans" as never).select("limits").eq("org_id" as never, orgId as never).maybeSingle(); return (data as { limits: Record<string, unknown> | null } | null)?.limits ?? null; } catch { return null; } })(),
  ]);
  let seatLimit: number | null = null;
  if (limitRow && typeof limitRow.seats === "number" && limitRow.seats >= 0) seatLimit = limitRow.seats;
  const seatLimitDefined = seatLimit !== null;
  const remaining = seatLimit !== null && activeUsers !== null ? Math.max(seatLimit - activeUsers, 0) : null;
  return { activeUsers, invitedUsers, pendingInvites, seatLimit, seatLimitDefined, remaining };
}

// ── Shared tenancy + owner-protection helpers ───────────────────────────────
interface TargetUser { id: string; roleKey: string | null; status: string | null }

/** Resolve a user STRICTLY within the target org. Returns null if the user does
 *  not belong to orgId (cross-tenant request → caller rejects). */
async function resolveOrgUser(db: ReturnType<typeof createServiceRoleClient>, orgId: string, userId: string): Promise<TargetUser | null> {
  const { data } = await db.from("users" as never)
    .select("id,status,roles:role_id(key)")
    .eq("id" as never, userId as never)
    .eq("org_id" as never, orgId as never)
    .maybeSingle();
  if (!data) return null;
  const r = data as { id: string; status: string | null; roles: { key: string | null } | null };
  return { id: r.id, roleKey: r.roles?.key ?? null, status: r.status ?? null };
}

/** Count ACTIVE owners in an org (for last-owner protection). */
async function countActiveOwners(db: ReturnType<typeof createServiceRoleClient>, orgId: string): Promise<number> {
  const { data: ownerRole } = await db.from("roles" as never).select("id").eq("org_id" as never, orgId as never).eq("key" as never, "owner" as never).maybeSingle();
  const ownerId = (ownerRole as { id: string } | null)?.id;
  if (!ownerId) return 0;
  const { count } = await db.from("users" as never).select("*", { count: "exact", head: true }).eq("org_id" as never, orgId as never).eq("role_id" as never, ownerId as never).eq("status" as never, "active" as never);
  return count ?? 0;
}

async function assertOrgExists(db: ReturnType<typeof createServiceRoleClient>, orgId: string): Promise<void> {
  const { data } = await db.from("organizations").select("id").eq("id", orgId).maybeSingle();
  if (!data) throw new UserAdminError("הארגון לא נמצא");
}

// ── Mutations (all require platform.users.manage) ───────────────────────────
const MANAGE = "platform.users.manage" as const;
function newToken(): string { return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, ""); }

export interface InviteResult { inviteId: string; token: string; link: string }

/**
 * Invite a user to a TARGET org. Validates org + role (role must be an existing
 * org role → a platform role can never be assigned) + email + no duplicate
 * pending invite. Service-role insert into the EXISTING org_invitations table
 * (no second invitation system). Returns the join link/token to the operator;
 * the token is NEVER written to the audit log.
 */
export async function invitePlatformUser(orgId: string, input: { email: string; fullName?: string; roleKey: string }): Promise<InviteResult> {
  const operator = await assertPlatformCapability(MANAGE);
  const db = createServiceRoleClient();
  await assertOrgExists(db, orgId);
  const email = (input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new UserAdminError("כתובת אימייל לא תקינה");
  await assertRoleInOrg(db, orgId, input.roleKey);

  const { data: existing } = await db.from("org_invitations" as never)
    .select("id").eq("org_id" as never, orgId as never).eq("email" as never, email as never).eq("status" as never, "pending" as never).maybeSingle();
  if (existing) throw new UserAdminError("כבר קיימת הזמנה ממתינה לכתובת זו");

  const token = newToken();
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const { data, error } = await db.from("org_invitations" as never).insert({
    org_id: orgId, email, full_name: input.fullName?.trim() || null, role_key: input.roleKey,
    token, status: "pending", invited_by: null, expires_at: expiresAt,
  } as never).select("id").single();
  if (error || !data) throw new UserAdminError("יצירת ההזמנה נכשלה");
  const inviteId = (data as { id: string }).id;
  await writePlatformAudit({ operator, capability: MANAGE, action: "user.invite", resourceType: "invitation", resourceId: inviteId, targetOrgId: orgId, metadata: { email, role: input.roleKey } });
  return { inviteId, token, link: `/join/${token}` };
}

/**
 * Resend (extend) a PENDING or EXPIRED invite that belongs to the target org.
 * Refreshes the token + expiry and re-arms status to pending. Cross-org invites
 * are rejected. Token never audited.
 */
export async function resendPlatformInvite(orgId: string, inviteId: string): Promise<InviteResult> {
  const operator = await assertPlatformCapability(MANAGE);
  const db = createServiceRoleClient();
  const { data: inv } = await db.from("org_invitations" as never)
    .select("id,status").eq("id" as never, inviteId as never).eq("org_id" as never, orgId as never).maybeSingle();
  if (!inv) throw new UserAdminError("ההזמנה לא נמצאה עבור ארגון זה");
  const row = inv as { id: string; status: string };
  if (row.status === "accepted") throw new UserAdminError("ההזמנה כבר אושרה");
  const token = newToken();
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const { error } = await db.from("org_invitations" as never)
    .update({ token, status: "pending", expires_at: expiresAt } as never)
    .eq("id" as never, inviteId as never).eq("org_id" as never, orgId as never);
  if (error) throw new UserAdminError("שליחת ההזמנה מחדש נכשלה");
  await writePlatformAudit({ operator, capability: MANAGE, action: "user.invite.resend", resourceType: "invitation", resourceId: inviteId, targetOrgId: orgId });
  return { inviteId, token, link: `/join/${token}` };
}

async function assertRoleInOrg(db: ReturnType<typeof createServiceRoleClient>, orgId: string, roleKey: string): Promise<void> {
  const { data } = await db.from("roles" as never).select("id").eq("org_id" as never, orgId as never).eq("key" as never, roleKey as never).maybeSingle();
  if (!data) throw new UserAdminError("התפקיד אינו קיים בארגון זה");
}

/**
 * Activate or suspend a user within the target org. Tenancy-checked; the final
 * ACTIVE owner cannot be suspended (would lock the org out). Sets the real
 * `users.status` (active/suspended) — enforced by the app session guard (P5.3),
 * so suspension is not merely cosmetic.
 */
export async function setPlatformUserStatus(orgId: string, userId: string, action: "activate" | "suspend", reason?: string): Promise<void> {
  const operator = await assertPlatformCapability(MANAGE);
  const db = createServiceRoleClient();
  const target = await resolveOrgUser(db, orgId, userId);
  if (!target) throw new UserAdminError("המשתמש אינו שייך לארגון זה");
  if (action === "suspend" && target.roleKey === "owner") {
    if ((await countActiveOwners(db, orgId)) <= 1) throw new UserAdminError("לא ניתן להשעות את הבעלים הפעיל האחרון של הארגון");
  }
  const nextStatus = action === "activate" ? "active" : "suspended";
  const { error } = await db.from("users" as never).update({ status: nextStatus } as never).eq("id" as never, userId as never).eq("org_id" as never, orgId as never);
  if (error) throw new UserAdminError("עדכון הסטטוס נכשל");
  await writePlatformAudit({ operator, capability: MANAGE, action: action === "activate" ? "user.activate" : "user.suspend", resourceType: "user", resourceId: userId, targetOrgId: orgId, metadata: { reason: reason?.slice(0, 300) ?? null, status: nextStatus } });
}

/**
 * Change a user's ORG role within the target org. Validates the target user and
 * the new role both belong to orgId. Cannot demote the final active owner (must
 * promote another owner first). Only existing org roles are assignable — a
 * platform role can never be granted through this path.
 */
export async function setPlatformUserRole(orgId: string, userId: string, roleKey: string, reason?: string): Promise<void> {
  const operator = await assertPlatformCapability(MANAGE);
  const db = createServiceRoleClient();
  const target = await resolveOrgUser(db, orgId, userId);
  if (!target) throw new UserAdminError("המשתמש אינו שייך לארגון זה");
  await assertRoleInOrg(db, orgId, roleKey);
  if (target.roleKey === "owner" && roleKey !== "owner" && target.status === "active") {
    if ((await countActiveOwners(db, orgId)) <= 1) throw new UserAdminError("לא ניתן להוריד את הבעלים האחרון — יש למנות בעלים נוסף תחילה");
  }
  const { data: role } = await db.from("roles" as never).select("id").eq("org_id" as never, orgId as never).eq("key" as never, roleKey as never).maybeSingle();
  const roleId = (role as { id: string } | null)?.id;
  if (!roleId) throw new UserAdminError("התפקיד אינו קיים בארגון זה");
  const { error } = await db.from("users" as never).update({ role_id: roleId } as never).eq("id" as never, userId as never).eq("org_id" as never, orgId as never);
  if (error) throw new UserAdminError("שינוי התפקיד נכשל");
  await writePlatformAudit({ operator, capability: MANAGE, action: "user.role.change", resourceType: "user", resourceId: userId, targetOrgId: orgId, metadata: { from: target.roleKey, to: roleKey, reason: reason?.slice(0, 300) ?? null } });
}
