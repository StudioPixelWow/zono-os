"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createInvitation, cancelInvitation, setUserStatus, setUserRole } from "./service";
import { getAuthUser, getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { provisionUserProfile } from "@/lib/repositories/userRepository";
import { getRoleIdByKey } from "@/lib/repositories/organizationRepository";
import { stageOrgSeatQuantity } from "./seats-server";
import { assertBillingAllowsMutation, BillingRestrictedError } from "@/lib/commercial/billing-access";

export interface TeamActionState { ok?: boolean; error?: string; message?: string; token?: string }

function revalidate() { try { revalidatePath("/admin/agents"); } catch { /* noop */ } }

/** 8.2 — canonical billing gate for a cost-generating seat mutation. Returns a
 *  clean Hebrew error state when the org is billing-restricted; null when allowed. */
async function guardSeatMutation(): Promise<TeamActionState | null> {
  try {
    const { profile } = await getSessionContext();
    if (profile?.org_id) await assertBillingAllowsMutation(profile.org_id);
    return null;
  } catch (e) {
    if (e instanceof BillingRestrictedError) return { error: e.message };
    return null; // never block on an unrelated lookup failure (fail-open)
  }
}

/**
 * Accept an invitation as the currently-authenticated user. Security: the
 * invitation email MUST match the signed-in user's email. Attaches the user to
 * the inviting org with the invited role and marks the invitation accepted.
 * Used by the /join/[token] page after the agent signs up.
 */
export async function acceptInvitationAction(token: string): Promise<TeamActionState> {
  const user = await getAuthUser();
  if (!user) return { error: "יש להתחבר או להירשם תחילה" };
  const db = createServiceRoleClient();
  const { data: invRow } = await db
    .from("org_invitations")
    .select("id,org_id,email,role_key,status,expires_at")
    .eq("token", token)
    .maybeSingle();
  const inv = invRow as { id: string; org_id: string; email: string; role_key: string; status: string; expires_at: string | null } | null;
  if (!inv || inv.status !== "pending") return { error: "ההזמנה אינה תקפה או כבר נוצלה" };
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    await db.from("org_invitations").update({ status: "expired" }).eq("id", inv.id);
    return { error: "פג תוקף ההזמנה" };
  }
  if ((user.email ?? "").toLowerCase() !== inv.email.toLowerCase()) {
    return { error: "כתובת האימייל אינה תואמת להזמנה. הירשם עם האימייל שאליו נשלחה ההזמנה." };
  }
  try {
    const roleId = await getRoleIdByKey(inv.org_id, inv.role_key || "agent");
    await provisionUserProfile({
      id: user.id,
      org_id: inv.org_id,
      role_id: roleId,
      email: user.email ?? inv.email,
      full_name: (user.user_metadata?.full_name as string) || inv.email.split("@")[0],
      status: "active",
      onboarding_completed: true,
    });
    await db.from("org_invitations").update({ status: "accepted", accepted_by: user.id, accepted_at: new Date().toISOString() }).eq("id", inv.id);
    // 9.2 TEAM-TRUTH — ENSURE the accepted user has a linked ACTIVE roster row.
    // Previously this was an insert-less email UPDATE: if no roster row pre-existed
    // (the common case — invites live in org_invitations, they don't seed a roster
    // row) the accepted, active user ended up with NO office_members row and was
    // invisible on the office board + public roster. ensureOfficeMemberForUser links
    // an existing email-matched row OR creates one — idempotent, org-scoped, no
    // duplicate, real fields only, not public by default.
    try {
      const { ensureOfficeMemberForUser } = await import("@/lib/office/membership-sync");
      await ensureOfficeMemberForUser(db, {
        orgId: inv.org_id, userId: user.id,
        email: user.email ?? inv.email,
        fullName: (user.user_metadata?.full_name as string) || inv.email.split("@")[0],
        roleKey: inv.role_key || "agent",
      });
    } catch (linkErr) { console.error("[invite] roster ensure (non-fatal):", linkErr); }
    // The accepted user is now an active seat → stage the billing quantity so the
    // boundary cron converges the provider next cycle (no charge here).
    await stageOrgSeatQuantity(inv.org_id);
  } catch (e) {
    console.error("[invite] accept failed:", e);
    return { error: e instanceof Error ? e.message : "ההצטרפות נכשלה" };
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createInvitationAction(input: { email: string; fullName?: string; roleKey?: string }): Promise<TeamActionState> {
  if (!input.email?.trim()) return { error: "נא להזין כתובת אימייל" };
  const blocked = await guardSeatMutation(); if (blocked) return blocked;
  try { const r = await createInvitation(input); revalidate(); return { ok: true, token: r.token, message: "ההזמנה נוצרה — העתק את הקישור ושלח לסוכן" }; }
  catch (e) {
    const raw = e instanceof Error ? e.message : "יצירת ההזמנה נכשלה";
    // Block-UX contract: map the enforcement sentinel to a clean Hebrew message.
    // Never surface raw Postgres/SQL/stack text to the user.
    if (raw === "LIMIT_REACHED") return { error: "הגעתם למכסת המושבים בתוכנית — יש לשדרג או להסיר סוכן פעיל כדי להזמין נוסף" };
    return { error: raw };
  }
}
export async function cancelInvitationAction(id: string): Promise<TeamActionState> {
  try { await cancelInvitation(id); revalidate(); return { ok: true, message: "ההזמנה בוטלה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ביטול ההזמנה נכשל" }; }
}
export async function setUserStatusAction(userId: string, active: boolean): Promise<TeamActionState> {
  // Activating a seat is cost-generating → billing-gated. Deactivation reduces
  // cost and stays allowed even while restricted.
  if (active) { const blocked = await guardSeatMutation(); if (blocked) return blocked; }
  try { await setUserStatus(userId, active); revalidate(); return { ok: true, message: active ? "הסוכן הופעל" : "הסוכן הושבת" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון הסטטוס נכשל" }; }
}
export async function setUserRoleAction(userId: string, roleKey: string): Promise<TeamActionState> {
  try { await setUserRole(userId, roleKey); revalidate(); return { ok: true, message: "התפקיד עודכן" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון התפקיד נכשל" }; }
}

/**
 * 9.2 TEAM-TRUTH — one-time / on-demand roster reconciliation for THIS org. Repairs
 * existing drift (active users missing a member; suspended users still public) at the
 * canonical seam, not via a cron. Org is session-derived (NEVER from the client) and
 * the action is manager+ only → no cross-tenant mutation.
 */
export async function reconcileOfficeMembershipAction(): Promise<TeamActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { error: "אין הרשאה" };
    const { createClient } = await import("@/lib/supabase/server");
    const sb = await createClient();
    const { data: ok } = await sb.rpc("has_min_role", { p_min: "manager" });
    if (ok !== true) return { error: "נדרשת הרשאת מנהל/בעלים" };
    const { reconcileOfficeMembershipForOrg } = await import("@/lib/office/membership-sync");
    const r = await reconcileOfficeMembershipForOrg(profile.org_id);
    revalidate();
    return { ok: true, message: `הרוסטר סונכרן — נוצרו ${r.created}, קושרו ${r.linked}, הוסתרו ${r.hidden}` };
  } catch (e) { return { error: e instanceof Error ? e.message : "הסנכרון נכשל" }; }
}
