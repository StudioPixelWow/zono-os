// ============================================================================
// ZONO — BILLING notifications (server-only). 8.2.
// ----------------------------------------------------------------------------
// Owner/manager-facing in-app notifications for the billing lifecycle, via the
// canonical `notifications` table with a VALID category ("system" — the enum has
// no billing-specific value; see kernel/notification-categories.ts). Targeted to
// manager-tier users only (owners/managers/admins) — agents never see billing.
// Called ONLY from the idempotent lifecycle transitions (grace start, restriction,
// recovery, failure), so each meaningful event notifies exactly once — no spam.
// Fully error-isolated: a notification failure never affects billing state.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

const MANAGER_ROLE_KEYS = ["owner", "manager", "admin", "org_admin"] as const;

export type BillingNotifyKind = "payment_failed" | "grace_started" | "restricted" | "recovered";

const COPY: Record<BillingNotifyKind, { title: string; body: string; level: string }> = {
  payment_failed: { title: "לא הצלחנו לחייב את אמצעי התשלום", body: "מומלץ להסדיר את התשלום כדי להמשיך לעבוד ללא הפרעה.", level: "warning" },
  grace_started:  { title: "לא הצלחנו לחייב את אמצעי התשלום", body: "ניתן להמשיך להשתמש ב-ZONO בתקופת החסד. הסדירו את התשלום כדי להסיר את ההגבלה.", level: "warning" },
  restricted:     { title: "המנוי ממתין להסדרת תשלום", body: "הגישה לנתונים נשמרת. פעולות מסוימות יתאפשרו שוב לאחר הסדרת התשלום.", level: "critical" },
  recovered:      { title: "התשלום הוסדר — הגישה שוחזרה", body: "תודה! המנוי פעיל וכל הפעולות זמינות שוב.", level: "success" },
};

/** Notify the org's owners/managers of a billing lifecycle event (best-effort). */
export async function notifyOrgBilling(orgId: string, kind: BillingNotifyKind): Promise<void> {
  try {
    const db = createServiceRoleClient();
    const { data: roleRows } = await db.from("roles").select("id,key").eq("org_id", orgId).in("key", MANAGER_ROLE_KEYS as unknown as string[]);
    const roleIds = ((roleRows ?? []) as { id: string; key: string }[]).map((r) => r.id);
    if (!roleIds.length) return;
    const { data: userRows } = await db.from("users").select("id").eq("org_id", orgId).eq("status", "active").in("role_id", roleIds);
    const userIds = ((userRows ?? []) as { id: string }[]).map((u) => u.id);
    if (!userIds.length) return;
    const c = COPY[kind];
    const rows = userIds.map((uid) => ({
      org_id: orgId, user_id: uid, level: c.level, category: "system",
      title: c.title, body: c.body, href: "/account",
    }));
    await db.from("notifications").insert(rows as never).then(() => undefined, () => undefined);
  } catch (e) {
    console.error("[billing-notify] failed (non-fatal):", e);
  }
}
