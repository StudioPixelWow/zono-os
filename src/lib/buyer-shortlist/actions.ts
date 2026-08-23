"use server";
// ============================================================================
// ZONO — Buyer shortlist: broker server actions. Org scope + curator identity
// come from the SESSION. Uses a service-role client with the explicit org from
// the session (consistent with the rest of customer-comm), so the new table's
// RLS is never the failure point while org isolation is still enforced in code.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getBuyerPropertyMatches } from "@/lib/matching-intelligence/service";
import { addToShortlist, removeFromShortlist, listShortlist, sendShortlistPortal, type ShortlistItem, type SendPortalResult } from "./service";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface MatchCandidate {
  propertyId: string;
  title: string;
  price: number | null;
  compatibility: number | null;
  reason: string | null;
  blocker: string | null;
  shortlisted: boolean;
}

/** Top property matches for a buyer, flagged with shortlist membership. Reuses the
 *  canonical getBuyerPropertyMatches — no second match source. */
export async function getBuyerMatchCandidatesAction(buyerId: string): Promise<Result<MatchCandidate[]>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!buyerId) return { ok: false, error: "חסר מזהה קונה." };
  try {
    const [matches, shortlist] = await Promise.all([
      getBuyerPropertyMatches(buyerId),
      listShortlist(profile.org_id, buyerId, createServiceRoleClient()),
    ]);
    const inList = new Set(shortlist.map((s) => s.propertyId));
    const data: MatchCandidate[] = matches.map((m) => ({
      propertyId: m.propertyId, title: m.title, price: m.price, compatibility: m.compatibility,
      reason: m.reason, blocker: m.blocker, shortlisted: inList.has(m.propertyId),
    }));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "candidates_load_failed" };
  }
}

/** Send the buyer their persistent personal-portal link over the chosen channels. */
export async function sendShortlistPortalAction(buyerId: string, channels: { whatsapp: boolean; email: boolean }): Promise<Result<SendPortalResult>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!buyerId) return { ok: false, error: "חסר מזהה קונה." };
  if (!channels?.whatsapp && !channels?.email) return { ok: false, error: "לא נבחר ערוץ." };
  try {
    const res = await sendShortlistPortal(profile.org_id, buyerId, channels, createServiceRoleClient());
    if (res.sent) {
      await logActivityEvent({
        eventType: "buyer.property_file_sent", entityType: "buyer", entityId: buyerId,
        title: "נשלחה הבחירה האישית לקונה",
        description: [res.viaWhatsapp ? "WhatsApp" : null, res.viaEmail ? "מייל" : null].filter(Boolean).join(" + ") || null,
        channel: res.viaWhatsapp && res.viaEmail ? "multi" : res.viaWhatsapp ? "whatsapp" : "email", direction: "outbound",
        metadata: { portal: true },
      });
    }
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send_portal_failed" };
  }
}

export async function getShortlistAction(buyerId: string): Promise<Result<ShortlistItem[]>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!buyerId) return { ok: false, error: "חסר מזהה קונה." };
  try {
    return { ok: true, data: await listShortlist(profile.org_id, buyerId, createServiceRoleClient()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "shortlist_load_failed" };
  }
}

export async function addToShortlistAction(buyerId: string, propertyId: string): Promise<Result<null>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!buyerId || !propertyId) return { ok: false, error: "חסרים פרטים." };
  const db = createServiceRoleClient();
  // Only allow properties of THIS org (never trust the client).
  const { data: prop } = await db.from("properties").select("id").eq("id", propertyId).eq("org_id", profile.org_id).maybeSingle();
  if (!prop) return { ok: false, error: "הנכס לא נמצא." };
  try {
    await addToShortlist(profile.org_id, buyerId, propertyId, user.id, db);
    await logActivityEvent({
      eventType: "buyer.interaction.created", entityType: "buyer", entityId: buyerId,
      relatedEntityType: "property", relatedEntityId: propertyId,
      title: "נוסף נכס לבחירה האישית", channel: "internal", direction: "outbound",
      metadata: { propertyId, action: "shortlist_add" },
    });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "shortlist_add_failed" };
  }
}

export async function removeFromShortlistAction(buyerId: string, propertyId: string): Promise<Result<null>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!buyerId || !propertyId) return { ok: false, error: "חסרים פרטים." };
  try {
    await removeFromShortlist(profile.org_id, buyerId, propertyId, createServiceRoleClient());
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "shortlist_remove_failed" };
  }
}
