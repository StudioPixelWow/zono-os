// ============================================================================
// ZONO — Office Team Management · Service (server-only)
// Manager/owner builds and manages the team: invite agents (token + copyable
// link), see invite status, list agents, change role, activate/deactivate.
// Org-scoped via RLS. No auth user is created here — agents join via the link.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}

export interface AgentRow {
  id: string; fullName: string; email: string; phone: string | null;
  roleKey: string | null; roleName: string | null; status: string; lastSeenAt: string | null;
}
export interface InvitationRow {
  id: string; email: string; fullName: string | null; roleKey: string;
  token: string; status: string; createdAt: string; expiresAt: string | null;
}
export interface OrgRole { key: string; name: string }
export interface TeamAdmin {
  isManager: boolean;
  agents: AgentRow[];
  invitations: InvitationRow[];
  roles: OrgRole[];
}

export async function getTeamAdmin(): Promise<TeamAdmin> {
  const { orgId, isManager, supabase } = await ctx();
  const [{ data: users }, { data: roles }, { data: invites }] = await Promise.all([
    supabase.from("users").select("id,full_name,email,phone,status,last_seen_at,role_id").eq("org_id", orgId).order("created_at", { ascending: true }),
    supabase.from("roles").select("id,key,name").eq("org_id", orgId),
    supabase.from("org_invitations").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100),
  ]);
  const roleById = new Map((roles ?? []).map((r) => [r.id as string, r as { key: string; name: string }]));
  const agents: AgentRow[] = ((users ?? []) as Record<string, unknown>[]).map((u) => {
    const role = u.role_id ? roleById.get(u.role_id as string) : undefined;
    return {
      id: u.id as string, fullName: u.full_name as string, email: u.email as string,
      phone: (u.phone as string) ?? null, roleKey: role?.key ?? null, roleName: role?.name ?? null,
      status: (u.status as string) ?? "active", lastSeenAt: (u.last_seen_at as string) ?? null,
    };
  });
  const invitations: InvitationRow[] = ((invites ?? []) as Record<string, unknown>[]).map((i) => ({
    id: i.id as string, email: i.email as string, fullName: (i.full_name as string) ?? null,
    roleKey: (i.role_key as string) ?? "agent", token: i.token as string, status: (i.status as string) ?? "pending",
    createdAt: i.created_at as string, expiresAt: (i.expires_at as string) ?? null,
  }));
  const rolesList: OrgRole[] = ((roles ?? []) as { key: string; name: string }[]).map((r) => ({ key: r.key, name: r.name }));
  return { isManager, agents, invitations, roles: rolesList };
}

export async function createInvitation(input: { email: string; fullName?: string; roleKey?: string }): Promise<{ token: string }> {
  const { orgId, userId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("נדרשת הרשאת מנהל/בעלים");
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const expires = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const { error } = await supabase.from("org_invitations").insert({
    org_id: orgId, email: input.email.trim().toLowerCase(), full_name: input.fullName?.trim() || null,
    role_key: input.roleKey || "agent", token, status: "pending", invited_by: userId, expires_at: expires,
  });
  if (error) throw new Error(error.message);
  return { token };
}

export async function cancelInvitation(id: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  const { error } = await supabase.from("org_invitations").update({ status: "cancelled" }).eq("org_id", orgId).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setUserStatus(userId: string, active: boolean): Promise<void> {
  const { orgId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("נדרשת הרשאת מנהל/בעלים");
  const { error } = await supabase.from("users").update({ status: active ? "active" : "disabled" }).eq("org_id", orgId).eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function setUserRole(userId: string, roleKey: string): Promise<void> {
  const { orgId, isManager, supabase } = await ctx();
  if (!isManager) throw new Error("נדרשת הרשאת מנהל/בעלים");
  const { data: role } = await supabase.from("roles").select("id").eq("org_id", orgId).eq("key", roleKey).maybeSingle();
  if (!role) throw new Error("תפקיד לא נמצא");
  const { error } = await supabase.from("users").update({ role_id: (role as { id: string }).id }).eq("org_id", orgId).eq("id", userId);
  if (error) throw new Error(error.message);
}
