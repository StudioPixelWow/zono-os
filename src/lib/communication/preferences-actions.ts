"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Communication Automation: notification preference + self-test actions.
// Server-derived identity (org/user); never trusts client-supplied recipients.
// The test action sends a REAL email through the same dispatch/Resend path to the
// AUTHENTICATED user's own address only — the safe, controlled proof of delivery.
// ============================================================================
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizePrefs } from "./orchestrator";
import { renderTemplate, withDeepLink } from "./templates";
import { dispatchExternal } from "./dispatch";

export async function saveNotificationPreferencesAction(
  input: { whatsapp?: boolean; email?: boolean; morningEmail?: boolean; urgentWhatsapp?: boolean; meetingReminders?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await getSessionContext();
  if (!user) return { ok: false, error: "unauth" };
  const db: any = createServiceRoleClient();
  const { data } = await db.from("users").select("notification_preferences").eq("id", user.id).maybeSingle();
  const next = { ...normalizePrefs(data?.notification_preferences), ...input };
  await db.from("users").update({ notification_preferences: next }).eq("id", user.id);
  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function sendTestNotificationAction(): Promise<{ ok: boolean; error?: string; messageId?: string | null }> {
  const { user, organization } = await getSessionContext();
  if (!user || !organization) return { ok: false, error: "unauth" };
  const db: any = createServiceRoleClient();
  const { data } = await db.from("users").select("email,full_name").eq("id", user.id).maybeSingle();
  const email = data?.email as string | undefined;
  if (!email) return { ok: false, error: "no_email" };
  const first = ((data.full_name ?? "") as string).trim().split(/\s+/)[0] || null;
  const msg = renderTemplate("GENERIC", {
    firstName: first, title: "בדיקת התראות ZONO",
    reason: "זו הודעת בדיקה — אם הגיעה אליך, שליחת האימייל מ-ZONO פעילה.",
  });
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const em = withDeepLink(msg, "/settings/notifications", base);
  const dedupKey = `test_email:${user.id}:${Date.now()}`;
  const req = { orgId: organization.id, userId: user.id, channel: "email" as const, to: email, title: em.title, body: em.body, dedupKey };
  const res = await dispatchExternal(db, "email", req, { scheduledAt: null });
  let messageId: string | null = null;
  if (res.sent) {
    const { data: d2 } = await db.from("notification_deliveries").select("provider_message_id").eq("org_id", organization.id).eq("dedup_key", dedupKey).maybeSingle();
    messageId = (d2?.provider_message_id as string) ?? null;
  }
  return { ok: res.sent, messageId, error: res.sent ? undefined : "send_failed_or_skipped" };
}
