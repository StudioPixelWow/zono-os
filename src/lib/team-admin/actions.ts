"use server";
import { revalidatePath } from "next/cache";
import { createInvitation, cancelInvitation, setUserStatus, setUserRole } from "./service";

export interface TeamActionState { ok?: boolean; error?: string; message?: string; token?: string }

function revalidate() { try { revalidatePath("/admin/agents"); } catch { /* noop */ } }

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
