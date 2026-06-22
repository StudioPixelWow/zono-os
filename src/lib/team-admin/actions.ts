"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createInvitation, cancelInvitation, setUserStatus, setUserRole } from "./service";
import { getAuthUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { provisionUserProfile } from "@/lib/repositories/userRepository";
import { getRoleIdByKey } from "@/lib/repositories/organizationRepository";

export interface TeamActionState { ok?: boolean; error?: string; message?: string; token?: string }

function revalidate() { try { revalidatePath("/admin/agents"); } catch { /* noop */ } }

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
  } catch (e) {
    console.error("[invite] accept failed:", e);
    return { error: e instanceof Error ? e.message : "ההצטרפות נכשלה" };
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createInvitationAction(input: { email: string; fullName?: string; roleKey?: string }): Promise<TeamActionState> {
  if (!input.email?.trim()) return { error: "נא להזין כתובת אימייל" };
  try { const r = await createInvitation(input); revalidate(); return { ok: true, token: r.token, message: "ההזמנה נוצרה — העתק את הקישור ושלח לסוכן" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת ההזמנה נכשלה" }; }
}
export async function cancelInvitationAction(id: string): Promise<TeamActionState> {
  try { await cancelInvitation(id); revalidate(); return { ok: true, message: "ההזמנה בוטלה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ביטול ההזמנה נכשל" }; }
}
export async function setUserStatusAction(userId: string, active: boolean): Promise<TeamActionState> {
  try { await setUserStatus(userId, active); revalidate(); return { ok: true, message: active ? "הסוכן הופעל" : "הסוכן הושבת" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון הסטטוס נכשל" }; }
}
export async function setUserRoleAction(userId: string, roleKey: string): Promise<TeamActionState> {
  try { await setUserRole(userId, roleKey); revalidate(); return { ok: true, message: "התפקיד עודכן" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון התפקיד נכשל" }; }
}
