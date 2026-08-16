// ============================================================================
// ZONO — Claim internal notifications (P10C §7). Emits Claim events into the
// EXISTING notification center (`notifications` table) — INTERNAL only. No
// email / WhatsApp / SMS / external delivery, no new table. Batched + deduped so
// the hourly re-evaluation never spams: at most one "new candidates" notice per
// user per 24h. Best-effort — a notification failure must never break Claim.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dedup guard: is there already an UNREAD claim notification in the last 24h?
 *  (Claim notices all point at /claim, so that + is_read=false is the batch key.) */
async function hasRecentUnreadClaimNotice(db: any, orgId: string, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data } = await db.from("notifications").select("id")
    .eq("org_id", orgId).eq("user_id", userId).eq("href", "/claim").eq("is_read", false).gte("created_at", since).limit(1);
  return (data?.length ?? 0) > 0;
}

/** NEW_HIGH_CANDIDATE / NEW_CANDIDATE_BATCH — one batched notice per 24h/user. */
export async function notifyClaimCandidates(orgId: string, userId: string, counts: { high: number; total: number }): Promise<boolean> {
  if (counts.total <= 0) return false;
  try {
    const db: any = createServiceRoleClient();
    if (await hasRecentUnreadClaimNotice(db, orgId, userId)) return false; // batched — no spam
    const high = counts.high > 0;
    const title = high
      ? `זיהינו ${counts.high} נכסים בהתאמה גבוהה שייתכן ששייכים לך`
      : `זיהינו ${counts.total} נכסים חדשים שייתכן ששייכים לך`;
    await db.from("notifications").insert({
      org_id: orgId, user_id: userId, level: high ? "success" : "info", category: "review",
      title, body: "בדוק נכסים ואשר את שלך.", href: "/claim",
    });
    return true;
  } catch (e) { console.error("[claim] candidate notify skipped:", e); return false; }
}

/** CLAIM_SUCCEEDED — the property was added to ZONO. */
export async function notifyClaimSucceeded(orgId: string, userId: string, opts: { propertyId?: string; title?: string | null }): Promise<void> {
  try {
    const db: any = createServiceRoleClient();
    await db.from("notifications").insert({
      org_id: orgId, user_id: userId, level: "success", category: "system",
      title: `הנכס נוסף ל-ZONO${opts.title ? ` · ${opts.title}` : ""}`,
      body: "זמין לנכסים, להתאמות ולקריאייטיב.",
      href: opts.propertyId ? `/properties/${opts.propertyId}` : "/claim",
    });
  } catch (e) { console.error("[claim] success notify skipped:", e); }
}

/** CLAIM_FAILED_SAFE — a claim was safely refused (no data written). */
export async function notifyClaimFailedSafe(orgId: string, userId: string, reason: string): Promise<void> {
  try {
    const db: any = createServiceRoleClient();
    await db.from("notifications").insert({
      org_id: orgId, user_id: userId, level: "warning", category: "review",
      title: "סימון הנכס לא הושלם", body: reason || "נדרש אישור נוסף — לא בוצע שינוי.", href: "/claim",
    });
  } catch (e) { console.error("[claim] failed-safe notify skipped:", e); }
}
