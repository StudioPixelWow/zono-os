/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Buyer Command Center 5.0: BROKER-CURATED SHORTLIST (server-only).
// The canonical buyer↔property selection the broker hand-picks and sends as the
// buyer's personal portal. Distinct from auto-matches (match_intelligence_profiles)
// and from the send/feedback ledger (customer_property_recommendations). Reuses the
// existing match reason (strongest_advantage) for explainability — no new scoring.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPortalLink } from "@/lib/customer-portal/buyer-portal";
import { checkChannelEligibility } from "@/lib/customer-comm/consent";
import { unsubUrl } from "@/lib/customer-comm/unsubscribe";
import { sendCustomerEmail } from "@/lib/customer-comm/send";
import { dispatchExternal } from "@/lib/communication/dispatch";
import { providerFor } from "@/lib/notify/providers";
import { isQuietHours, morningSendTime } from "@/lib/communication/quiet-hours";

export type ShortlistState = "selected" | "sent" | "viewed" | "liked" | "rejected" | "visit_requested";

export interface ShortlistItem {
  propertyId: string;
  state: ShortlistState;
  selectedAt: string | null;
  title: string;
  city: string | null;
  rooms: number | null;
  price: number | null;
  imageUrl: string | null;
  status: string | null;
  available: boolean;
  reason: string | null;   // match_intelligence_profiles.strongest_advantage
  score: number | null;    // compatibility_score
}

const UNAVAILABLE = new Set(["sold", "rented", "withdrawn", "archived"]);

/** Full curated shortlist for one buyer, enriched with property + match reason. */
export async function listShortlist(orgId: string, buyerId: string, db: any = createServiceRoleClient()): Promise<ShortlistItem[]> {
  const { data: rows } = await db.from("buyer_property_shortlist")
    .select("property_id,state,selected_at").eq("org_id", orgId).eq("buyer_id", buyerId)
    .order("selected_at", { ascending: false });
  const items = (rows ?? []) as Array<{ property_id: string; state: ShortlistState; selected_at: string | null }>;
  if (!items.length) return [];
  const propertyIds = items.map((i) => i.property_id);

  const [propsRes, matchRes] = await Promise.all([
    db.from("properties").select("id,title,city,rooms,price,status,primary_image_url").in("id", propertyIds).eq("org_id", orgId),
    db.from("match_intelligence_profiles").select("property_id,strongest_advantage,compatibility_score").eq("org_id", orgId).eq("buyer_id", buyerId).in("property_id", propertyIds),
  ]);
  const propById = new Map<string, any>();
  for (const p of (propsRes?.data ?? []) as any[]) propById.set(p.id, p);
  const matchByProp = new Map<string, { reason: string | null; score: number | null }>();
  for (const m of (matchRes?.data ?? []) as any[]) matchByProp.set(m.property_id, { reason: m.strongest_advantage ?? null, score: m.compatibility_score ?? null });

  const out: ShortlistItem[] = [];
  for (const i of items) {
    const p = propById.get(i.property_id);
    if (!p) continue;
    const match = matchByProp.get(i.property_id);
    out.push({
      propertyId: i.property_id, state: i.state, selectedAt: i.selected_at,
      title: p.title ?? "נכס", city: p.city ?? null, rooms: p.rooms ?? null, price: p.price ?? null,
      imageUrl: p.primary_image_url ?? null, status: p.status ?? null,
      available: !UNAVAILABLE.has(String(p.status)),
      reason: match?.reason ?? null, score: match?.score ?? null,
    });
  }
  return out;
}

/** Broker adds a property to a buyer's shortlist (idempotent; state=selected). */
export async function addToShortlist(orgId: string, buyerId: string, propertyId: string, selectedBy: string | null, db: any = createServiceRoleClient()): Promise<void> {
  await db.from("buyer_property_shortlist").upsert([{
    org_id: orgId, buyer_id: buyerId, property_id: propertyId, state: "selected",
    selected_by: selectedBy, selected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }], { onConflict: "org_id,buyer_id,property_id", ignoreDuplicates: true });
}

/** Broker removes a property from the shortlist. */
export async function removeFromShortlist(orgId: string, buyerId: string, propertyId: string, db: any = createServiceRoleClient()): Promise<void> {
  await db.from("buyer_property_shortlist").delete().eq("org_id", orgId).eq("buyer_id", buyerId).eq("property_id", propertyId);
}

/** Update a shortlist item's state (send → sent; portal feedback → liked/rejected/...). */
export async function setShortlistState(orgId: string, buyerId: string, propertyId: string, state: ShortlistState, db: any = createServiceRoleClient()): Promise<void> {
  await db.from("buyer_property_shortlist").update({ state, updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("buyer_id", buyerId).eq("property_id", propertyId);
}

/** Mark all selected items as sent (called when the portal is delivered). */
export async function markShortlistSent(orgId: string, buyerId: string, db: any = createServiceRoleClient()): Promise<void> {
  await db.from("buyer_property_shortlist").update({ state: "sent", updated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("buyer_id", buyerId).eq("state", "selected");
}

/** Compact counts for the buyer hero ("2 בבחירה האישית"). */
export async function shortlistCount(orgId: string, buyerId: string, db: any = createServiceRoleClient()): Promise<number> {
  const { count } = await db.from("buyer_property_shortlist")
    .select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("buyer_id", buyerId);
  return count ?? 0;
}

function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return `972${d.slice(1)}`;
  if (d.length === 9) return `972${d}`;
  return d;
}
const WA_MATCH_TEMPLATE = () => process.env.ZONO_WHATSAPP_MATCH_TEMPLATE || null;

export interface SendPortalResult { sent: boolean; viaWhatsapp: boolean; viaEmail: boolean; deferred: boolean; portalUrl: string | null; reason: string }

/** Send the buyer ONE persistent personal-portal link (not per-property) over the
 *  chosen channel(s). Reuses the canonical transport + consent gate; marks the
 *  curated selection as 'sent'. WhatsApp uses the approved template. */
export async function sendShortlistPortal(
  orgId: string, buyerId: string, channels: { whatsapp: boolean; email: boolean }, db: any = createServiceRoleClient(),
): Promise<SendPortalResult> {
  const base: SendPortalResult = { sent: false, viaWhatsapp: false, viaEmail: false, deferred: false, portalUrl: null, reason: "" };
  const portal = await getPortalLink(db, orgId, "buyer", buyerId);
  if (!portal) return { ...base, reason: "no_portal" };
  base.portalUrl = portal;

  const { data: buyer } = await db.from("buyers").select("full_name,email,phone").eq("id", buyerId).eq("org_id", orgId).maybeSingle();
  if (!buyer) return { ...base, reason: "buyer_not_found" };
  const { data: orgRow } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const officeName = (orgRow?.name as string) || "צוות ZONO";
  const firstName = (buyer.full_name ?? "").trim().split(/\s+/)[0] || "לקוח";
  const nowIso = new Date().toISOString();
  const dedup = `shortlist-portal:${orgId}:${buyerId}`;

  if (channels.whatsapp) {
    const phone = normalizePhone(buyer.phone);
    const waTemplate = WA_MATCH_TEMPLATE();
    const waConnected = waTemplate ? await providerFor("whatsapp").isConfigured(orgId) : false;
    if (phone && waConnected) {
      const gate = await checkChannelEligibility({ orgId, contactType: "buyer", contactId: buyerId, channel: "whatsapp", purpose: "marketing" }, db);
      if (gate.eligible) {
        const body = `היי ${firstName}, הכנתי לך בחירה אישית של נכסים. לצפייה: ${portal}`;
        const template = { name: waTemplate as string, language: "he", variables: [firstName, "1", "הבחירה שלך", portal] };
        const wreq = { orgId, userId: null as string | null, channel: "whatsapp" as const, to: phone, title: null, body, template, dedupKey: `${dedup}:wa` };
        if (isQuietHours(nowIso)) { await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: morningSendTime(nowIso) }); base.deferred = true; }
        else { const r = await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: null }); if (r.sent) base.viaWhatsapp = true; }
      }
    }
  }

  if (channels.email && buyer.email) {
    const gate = await checkChannelEligibility({ orgId, contactType: "buyer", contactId: buyerId, channel: "email", purpose: "marketing" }, db);
    if (gate.eligible) {
      const unsub = unsubUrl({ o: orgId, t: "buyer", c: buyerId, ch: "email" });
      const subject = `${firstName}, מצאתי כמה נכסים שיכולים להתאים לך`;
      const text = `היי ${firstName},\nעברתי על הנכסים והכנתי עבורך בחירה אישית של נכסים שמתאימים למה שחיפשת.\n\nלצפייה בבחירה שלך:\n${portal}\n\n${officeName}`;
      const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f6f5fb;padding:24px;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #ece9f6;padding:24px"><p style="font-size:15px;line-height:1.6;color:#1f2430">היי ${firstName},<br>הכנתי לך בחירה אישית של נכסים שיכולים להתאים בדיוק למה שחיפשת.</p><a href="${portal}" style="display:inline-block;margin-top:8px;background:#6d28d9;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:12px">לצפייה בבחירה שלך</a><p style="margin-top:16px;font-size:12px;color:#8a8fa3">${officeName} · <a href="${unsub ?? ""}" style="color:#8a8fa3">הסרה</a></p></div></body></html>`;
      const r = await sendCustomerEmail({ orgId, contact: { type: "buyer", id: buyerId, name: buyer.full_name, email: buyer.email }, purpose: "marketing", subject, text, html, dedupKey: `${dedup}:email` }, db);
      if (r.sent) base.viaEmail = true;
    }
  }

  base.sent = base.viaWhatsapp || base.viaEmail || base.deferred;
  if (base.sent) { await markShortlistSent(orgId, buyerId, db); base.reason = "ok"; }
  else base.reason = "no_channel";
  return base;
}
