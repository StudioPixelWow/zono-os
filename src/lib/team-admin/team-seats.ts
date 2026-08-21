import "server-only";
// ============================================================================
// ZONO — Team & Seats view-model (server-only). Merges the canonical roster
// (office_members) with access truth (public.users status + pending
// org_invitations) and the canonical billing quantity/price into ONE manager
// admin model. No parallel seat table; office_members with user_id=null are
// roster-only and never billed. Manager/owner-gated (reuses getTeamAdmin's ctx).
// ============================================================================
import { getTeamAdmin } from "./service";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOrgBillingQuantity } from "@/lib/commercial/billing";
import { COMMERCIAL_MODEL } from "@/lib/commercial/model";
import { resolveAgentAvatar } from "@/lib/office/avatar";
import { isActiveLeadStage, isActivePropertyStatus } from "@/lib/office/status-predicates";
import { deriveAccessState, consumesSeat, type AccessState } from "./seats";

export interface TeamSeatMember {
  id: string; name: string; role: string; specialty: string | null; avatarUrl: string | null;
  email: string | null; phone: string | null; userId: string | null;
  access: AccessState; consumesSeat: boolean; showOnWebsite: boolean; publicSlug: string | null;
  activeProperties: number; openLeads: number;
}
export interface TeamSeatInvitation { id: string; email: string; fullName: string | null; roleKey: string; status: string; createdAt: string }
export interface TeamSeats {
  isManager: boolean;
  summary: { people: number; activeSeats: number; noAccess: number; invited: number; suspended: number; monthlyIls: number };
  billing: { seats: number; unitPriceIls: number; monthlyIls: number };
  members: TeamSeatMember[];
  invitations: TeamSeatInvitation[];
  roles: { key: string; name: string }[];
}

export async function getTeamSeats(): Promise<TeamSeats | null> {
  const admin = await getTeamAdmin();
  if (!admin.isManager) return null;
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id;
  if (!orgId) return null;
  const db = createServiceRoleClient();
  const t = (name: string) => db.from(name as never);

  const [membersR, usersR, propsR, leadsR, bq] = await Promise.all([
    t("office_members").select("id,full_name,role,specialty,avatar_url,user_id,phone,email,status,show_on_website,public_slug").eq("org_id", orgId).eq("status", "active").order("role", { ascending: false }),
    t("users").select("id,avatar_url,status").eq("org_id", orgId),
    t("properties").select("office_member_id,status").eq("org_id", orgId).limit(2000),
    t("leads").select("office_member_id,stage").eq("org_id", orgId).limit(2000),
    getOrgBillingQuantity(orgId),
  ]);

  const members = (membersR.data ?? []) as Array<{ id: string; full_name: string; role: string; specialty: string | null; avatar_url: string | null; user_id: string | null; phone: string | null; email: string | null; show_on_website: boolean | null; public_slug: string | null }>;
  const users = (usersR.data ?? []) as Array<{ id: string; avatar_url: string | null; status: string | null }>;
  const props = (propsR.data ?? []) as Array<{ office_member_id: string | null; status: string }>;
  const leads = (leadsR.data ?? []) as Array<{ office_member_id: string | null; stage: string }>;

  const userStatusById = new Map(users.map((u) => [u.id, (u.status ?? "active")]));
  const userAvatarById = new Map(users.map((u) => [u.id, u.avatar_url ?? null]));
  const pendingEmails = new Set(admin.invitations.filter((i) => i.status === "pending").map((i) => i.email.toLowerCase()));

  const propCount = new Map<string, number>();
  for (const p of props) if (p.office_member_id && isActivePropertyStatus(p.status)) propCount.set(p.office_member_id, (propCount.get(p.office_member_id) ?? 0) + 1);
  const leadCount = new Map<string, number>();
  for (const l of leads) if (l.office_member_id && isActiveLeadStage(l.stage)) leadCount.set(l.office_member_id, (leadCount.get(l.office_member_id) ?? 0) + 1);

  const rows: TeamSeatMember[] = members.map((m) => {
    const hasPendingInvite = !!(m.email && pendingEmails.has(m.email.toLowerCase()));
    const access = deriveAccessState({ userId: m.user_id, userStatus: m.user_id ? userStatusById.get(m.user_id) ?? null : null, hasPendingInvite });
    return {
      id: m.id, name: m.full_name, role: m.role, specialty: m.specialty,
      avatarUrl: resolveAgentAvatar({ avatarUrl: m.avatar_url, linkedUserAvatarUrl: m.user_id ? userAvatarById.get(m.user_id) ?? null : null }),
      email: m.email, phone: m.phone, userId: m.user_id,
      access, consumesSeat: consumesSeat(access), showOnWebsite: m.show_on_website === true, publicSlug: m.public_slug,
      activeProperties: propCount.get(m.id) ?? 0, openLeads: leadCount.get(m.id) ?? 0,
    };
  });

  const unitPriceIls = COMMERCIAL_MODEL.pricePerAgentIls;
  const activeSeats = bq.billableAgents;
  const summary = {
    people: rows.length,
    activeSeats,
    noAccess: rows.filter((r) => r.access === "NO_ACCESS").length,
    invited: rows.filter((r) => r.access === "INVITED").length,
    suspended: rows.filter((r) => r.access === "SUSPENDED").length,
    monthlyIls: activeSeats * unitPriceIls,
  };

  return {
    isManager: true,
    summary,
    billing: { seats: activeSeats, unitPriceIls, monthlyIls: activeSeats * unitPriceIls },
    members: rows,
    invitations: admin.invitations.filter((i) => i.status === "pending").map((i) => ({ id: i.id, email: i.email, fullName: i.fullName, roleKey: i.roleKey, status: i.status, createdAt: i.createdAt })),
    roles: admin.roles,
  };
}
