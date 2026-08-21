"use server";
// ============================================================================
// ZONO — Office ROSTER + ASSIGNMENT server actions (manager/owner gated).
// The office board attributes work by the additive `office_member_id`, and the
// roster (office_members) can hold NON-AUTH agents (user_id NULL). So:
//   • assigning to a roster member ALWAYS sets the office attribution
//     (leads/properties.office_member_id) — the /office board's source of truth;
//   • when that member is linked to an Auth user, we ALSO run the CANONICAL
//     lead-assign path (owner_id + activity log + first-response task) so the
//     existing engines see the change. We never fake auth ownership for a
//     login-less member (spec §18).
// Role gate = has_min_role('manager'); org scope via the RLS session client.
// ============================================================================
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { assignLead } from "@/lib/leads/service";
import { recordUsage } from "@/lib/launch/server/services";

export interface OfficeActionResult { ok: boolean; error?: string }

async function managerCtx() {
  const sb = await createClient();
  const { data } = await sb.rpc("has_min_role", { p_min: "manager" });
  if (data !== true) return null;
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return null;
  return { sb, orgId };
}

/** Create a ROSTER-ONLY office member (no Auth user, no ZONO seat, no billing
 *  change). This is the safe "add person to the office" path — access is granted
 *  separately via the invitation flow. Manager/owner-gated, org from session. */
export async function createOfficeMemberAction(input: { fullName: string; role?: string; specialty?: string; phone?: string; email?: string }): Promise<OfficeActionResult> {
  const ctx = await managerCtx();
  if (!ctx) return { ok: false, error: "נדרשת הרשאת מנהל/בעלים" };
  const name = (input.fullName ?? "").trim();
  if (!name) return { ok: false, error: "יש להזין שם" };
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "כתובת אימייל לא תקינה" };
  const { error } = await ctx.sb.from("office_members" as never).insert({
    org_id: ctx.orgId, user_id: null, full_name: name,
    role: input.role || "agent", status: "active",
    specialty: input.specialty?.trim() || null, phone: input.phone?.trim() || null, email,
    show_on_website: false,
  } as never);
  if (error) return { ok: false, error: error.message };
  try { await recordUsage({ category: "workflow", name: "office_member_added", props: { roster_only: true } }); } catch { /* best-effort */ }
  try { revalidatePath("/team"); } catch { /* noop */ }
  return { ok: true };
}

/** Resolve a roster member inside the caller's org (returns its optional login link). */
async function memberInOrg(sb: Awaited<ReturnType<typeof createClient>>, orgId: string, memberId: string): Promise<{ id: string; user_id: string | null } | null> {
  const { data } = await sb.from("office_members" as never).select("id,user_id").eq("id", memberId).eq("org_id", orgId).maybeSingle();
  return (data as { id: string; user_id: string | null } | null) ?? null;
}

/** Assign a lead to a roster agent (office attribution; owner_id too when linked). */
export async function assignLeadToOfficeMemberAction(leadId: string, memberId: string): Promise<OfficeActionResult> {
  if (!leadId || !memberId) return { ok: false, error: "חסר ליד או סוכן." };
  const ctx = await managerCtx();
  if (!ctx) return { ok: false, error: "נדרשת הרשאת מנהל/בעלים." };
  const member = await memberInOrg(ctx.sb, ctx.orgId, memberId);
  if (!member) return { ok: false, error: "הסוכן לא נמצא במשרד." };

  const { error } = await ctx.sb.from("leads" as never)
    .update({ office_member_id: memberId, last_activity_at: new Date().toISOString() } as never)
    .eq("id", leadId).eq("org_id", ctx.orgId);
  if (error) return { ok: false, error: "השיוך נכשל." };

  // Linked member → also drive the CANONICAL assign (owner_id + activity + task).
  if (member.user_id) { try { await assignLead(leadId, member.user_id); } catch { /* office attribution already set */ } }

  await recordUsage({ category: "workflow", name: "manager_assignment_changed", props: { entity: "lead", target: "office_member" } });
  revalidatePath("/office");
  return { ok: true };
}

/** Assign a property to a roster agent (additive office attribution only). */
export async function assignPropertyToOfficeMemberAction(propertyId: string, memberId: string): Promise<OfficeActionResult> {
  if (!propertyId || !memberId) return { ok: false, error: "חסר נכס או סוכן." };
  const ctx = await managerCtx();
  if (!ctx) return { ok: false, error: "נדרשת הרשאת מנהל/בעלים." };
  const member = await memberInOrg(ctx.sb, ctx.orgId, memberId);
  if (!member) return { ok: false, error: "הסוכן לא נמצא במשרד." };

  const { error } = await ctx.sb.from("properties" as never)
    .update({ office_member_id: memberId } as never)
    .eq("id", propertyId).eq("org_id", ctx.orgId);
  if (error) return { ok: false, error: "השיוך נכשל." };

  await recordUsage({ category: "workflow", name: "manager_assignment_changed", props: { entity: "property", target: "office_member" } });
  revalidatePath("/office");
  return { ok: true };
}

const EDITABLE = new Set(["full_name", "specialty", "phone", "email", "avatar_url", "status"]);
const VALID_STATUS = new Set(["active", "invited", "inactive"]);

/** Edit basic roster identity for a member (manager-gated; allow-listed fields).
 *  Never creates an Auth user; office_members RLS also re-checks the manager role. */
export async function updateOfficeMemberAction(memberId: string, patch: Record<string, string | null>): Promise<OfficeActionResult> {
  if (!memberId) return { ok: false, error: "חסר מזהה סוכן." };
  const ctx = await managerCtx();
  if (!ctx) return { ok: false, error: "נדרשת הרשאת מנהל/בעלים." };

  const clean: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!EDITABLE.has(k)) continue;
    if (k === "status" && v && !VALID_STATUS.has(v)) return { ok: false, error: "סטטוס לא תקין." };
    if (k === "full_name" && !(v ?? "").trim()) return { ok: false, error: "שם הוא שדה חובה." };
    clean[k] = typeof v === "string" ? v.trim() || null : v;
  }
  if (!Object.keys(clean).length) return { ok: false, error: "אין שינויים לשמירה." };
  clean.updated_at = new Date().toISOString();

  const { error } = await ctx.sb.from("office_members" as never)
    .update(clean as never).eq("id", memberId).eq("org_id", ctx.orgId);
  if (error) return { ok: false, error: "העדכון נכשל." };

  await recordUsage({ category: "workflow", name: "office_member_updated" });
  revalidatePath("/office");
  revalidatePath(`/office/agents/${memberId}`);
  return { ok: true };
}
