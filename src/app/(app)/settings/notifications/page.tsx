/* eslint-disable @typescript-eslint/no-explicit-any */
// ZONO — Notification settings route. Loads the user's current preferences
// (server-derived) and renders the simple RTL controls.
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { NotificationSettings } from "@/components/communication/NotificationSettings";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const { user } = await getSessionContext();
  const prefs = { whatsapp: true, email: true, morningEmail: true, urgentWhatsapp: true, meetingReminders: true };
  if (user) {
    try {
      const db: any = createServiceRoleClient();
      const { data } = await db.from("users").select("notification_preferences").eq("id", user.id).maybeSingle();
      const p = data?.notification_preferences;
      if (p && typeof p === "object") {
        prefs.whatsapp = p.whatsapp !== false;
        prefs.email = p.email !== false;
        prefs.morningEmail = p.morningEmail !== false;
        prefs.urgentWhatsapp = p.urgentWhatsapp !== false;
        prefs.meetingReminders = p.meetingReminders !== false;
      }
    } catch { /* defaults */ }
  }
  return <NotificationSettings initial={prefs} />;
}
