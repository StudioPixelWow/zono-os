/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Buyer/Renter MATCH BUNDLES (server-only). Reuses the EXISTING internal
// matcher (match_intelligence_profiles) — no second matching engine. For each
// eligible, opted-in buyer it bundles the top NET-NEW high-confidence matches
// (never one message per property), sends ONE branded email through the shared
// consent-gated transport, and records each recommendation so the same property
// is never sent twice. Marketing → explicit opt-in required (fail-closed).
// WhatsApp bundles are the next step (need an approved Meta template); email is
// the working channel today. Emits buyer.matches_ready (one per bundle).
// ============================================================================
import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { sendCustomerEmail } from "./send";
import { checkChannelEligibility } from "./consent";
import { recoUrl } from "./recommend-tokens";
import { unsubUrl } from "./unsubscribe";
import { buyerMatchDedupKey, buyerMatchEventKey } from "./match-bundle-keys";
import { dispatchExternal } from "@/lib/communication/dispatch";
import { providerFor } from "@/lib/notify/providers";
import { isQuietHours, morningSendTime } from "@/lib/communication/quiet-hours";

/** Deterministic launch threshold — only high-confidence matches are sent. */
export const MATCH_THRESHOLD = 70;
const MAX_PER_BUNDLE = 5;

// The approved Meta template name for buyer match bundles. Template approval is a
// Meta-side state we cannot fabricate: WhatsApp is only attempted when this is
// configured (an approved template exists) — otherwise the channel is skipped
// honestly and email is the fallback. Variables: {{1}} name {{2}} count {{3}} area {{4}} url.
const WA_MATCH_TEMPLATE = () => process.env.ZONO_WHATSAPP_MATCH_TEMPLATE || null;

/** Normalize an Israeli phone to international digits (no +), or null if invalid. */
function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  if (d.length === 9) return "972" + d;
  return null;
}

const ils = (n: number | null | undefined) =>
  n == null ? "" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : `₪${Math.round(n).toLocaleString("he-IL")}`;
const roomsHe = (r: number | null | undefined) => (r == null ? "" : `${r} חד'`);
const startOfTodayIso = (nowMs: number) => { const d = new Date(nowMs); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };

interface BundleProp { id: string; title: string; city: string | null; price: number | null; rooms: number | null; imageUrl: string | null; score: number }

function renderBundleEmail(args: {
  officeName: string; buyerName: string; props: BundleProp[]; viewUrl: string | null; unsubscribeUrl: string | null;
}): { subject: string; text: string; html: string } {
  const { officeName, buyerName, props, viewUrl, unsubscribeUrl } = args;
  const n = props.length;
  const subject = n === 1 ? "מצאנו נכס שמתאים למה שחיפשת" : `מצאנו ${n} נכסים שמתאימים למה שחיפשת`;

  const textLines = [
    `היי ${buyerName || ""},`.trim(),
    `מצאנו עבורך ${n === 1 ? "נכס" : `${n} נכסים`} שמתאימים למה שחיפשת:`,
    "",
    ...props.map((p, i) => `${i + 1}. ${p.title}${p.city ? ` · ${p.city}` : ""}${p.rooms ? ` · ${roomsHe(p.rooms)}` : ""}${p.price ? ` · ${ils(p.price)}` : ""} — התאמה ${p.score}%`),
    "",
    viewUrl ? `לצפייה ולסימון מה שמעניין אותך:\n${viewUrl}` : "",
    "",
    `בברכה, ${officeName}`,
  ];
  const text = textLines.filter((l) => l !== undefined).join("\n") + (unsubscribeUrl ? `\n\nלהפסקת קבלת המלצות: ${unsubscribeUrl}` : "");

  const card = (p: BundleProp) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;margin:0 0 12px">
      ${p.imageUrl ? `<img src="${p.imageUrl}" alt="" style="width:100%;height:170px;object-fit:cover;display:block">` : ""}
      <div style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <h3 style="margin:0;color:#0f172a;font-size:16px;font-weight:800">${p.title}</h3>
          <span style="background:#ede9fe;color:#6d28d9;font-size:12px;font-weight:800;border-radius:999px;padding:2px 8px;white-space:nowrap">התאמה ${p.score}%</span>
        </div>
        <p style="margin:4px 0 0;color:#64748b;font-size:13px">${[p.city, p.rooms ? roomsHe(p.rooms) : "", p.price ? ils(p.price) : ""].filter(Boolean).join(" · ")}</p>
        ${viewUrl ? `<a href="${viewUrl}" style="display:inline-block;margin-top:10px;background:#6d28d9;color:#fff;text-decoration:none;font-size:13px;font-weight:700;border-radius:10px;padding:8px 16px">לפרטים</a>` : ""}
      </div>
    </div>`;

  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <p style="margin:0 0 4px;color:#6d28d9;font-size:12px;font-weight:800">${officeName}</p>
  <h1 style="margin:0 0 4px;color:#0f172a;font-size:20px;font-weight:900">${subject}</h1>
  <p style="margin:0 0 16px;color:#334155;font-size:15px">היי ${buyerName || ""}, ריכזנו עבורך את הנכסים הכי מתאימים:</p>
  ${props.map(card).join("")}
  ${viewUrl ? `<p style="text-align:center;margin:6px 0 0"><a href="${viewUrl}" style="color:#6d28d9;font-weight:700;font-size:14px">לצפייה בכל ההמלצות ←</a></p>` : ""}
  ${unsubscribeUrl ? `<p style="text-align:center;margin:16px 0 0;color:#94a3b8;font-size:12px"><a href="${unsubscribeUrl}" style="color:#94a3b8">להפסקת קבלת המלצות</a></p>` : ""}
</div></body></html>`;
  return { subject, text, html };
}

export interface BundleResult { org: string; buyers: number; bundlesSent: number; skipped: number; viaWhatsapp: number; viaEmail: number; deferred: number }

/** Send buyer match bundles for one org. Bounded, idempotent-per-day, dedup-safe. */
export async function runBuyerMatchBundlesForOrg(orgId: string, opts?: { limit?: number }): Promise<BundleResult> {
  const db: any = createServiceRoleClient();
  const nowMs = Date.now();
  const todayStart = startOfTodayIso(nowMs);

  // 1) High-confidence candidate matches (existing internal matcher — no rebuild).
  const { data: matchRows } = await db.from("match_intelligence_profiles")
    .select("buyer_id,property_id,compatibility_score")
    .eq("org_id", orgId).eq("match_status", "active").gte("compatibility_score", MATCH_THRESHOLD)
    .order("compatibility_score", { ascending: false }).limit(2000);
  const matches = (matchRows ?? []) as Array<{ buyer_id: string; property_id: string; compatibility_score: number }>;
  if (!matches.length) return { org: orgId, buyers: 0, bundlesSent: 0, skipped: 0, viaWhatsapp: 0, viaEmail: 0, deferred: 0 };

  const byBuyer = new Map<string, Array<{ propertyId: string; score: number }>>();
  for (const m of matches) {
    if (!byBuyer.has(m.buyer_id)) byBuyer.set(m.buyer_id, []);
    byBuyer.get(m.buyer_id)!.push({ propertyId: m.property_id, score: m.compatibility_score });
  }
  const buyerIds = [...byBuyer.keys()];

  // 2) Existing recommendations (dedup) + who already got a bundle today (freq cap).
  const { data: recRows } = await db.from("customer_property_recommendations")
    .select("contact_id,property_id,recommended_at")
    .eq("org_id", orgId).eq("contact_type", "buyer").in("contact_id", buyerIds);
  const alreadyRecommended = new Set<string>();  // `${buyer}|${property}`
  const sentToday = new Set<string>();
  for (const r of (recRows ?? []) as any[]) {
    alreadyRecommended.add(`${r.contact_id}|${r.property_id}`);
    if (r.recommended_at && r.recommended_at >= todayStart) sentToday.add(r.contact_id);
  }

  // 3) Buyer contacts (email and/or phone).
  const { data: buyerRows } = await db.from("buyers").select("id,full_name,email,phone").in("id", buyerIds);
  const buyers = new Map<string, { full_name: string | null; email: string | null; phone: string | null }>();
  for (const b of (buyerRows ?? []) as any[]) buyers.set(b.id, { full_name: b.full_name, email: b.email, phone: b.phone });

  const { data: orgRow } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const officeName = (orgRow?.name as string) || "צוות ZONO";
  const waTemplate = WA_MATCH_TEMPLATE();
  const waConnected = waTemplate ? await providerFor("whatsapp").isConfigured(orgId) : false;   // org-level, resolved once

  let processed = 0, bundlesSent = 0, skipped = 0, viaWhatsapp = 0, viaEmail = 0, deferred = 0;
  const limit = opts?.limit ?? 200;

  for (const buyerId of buyerIds) {
    if (processed >= limit) break;
    processed++;
    const buyer = buyers.get(buyerId);
    if (!buyer) { skipped++; continue; }
    if (sentToday.has(buyerId)) { skipped++; continue; }         // frequency cap: 1/day, ACROSS channels

    // net-new matches only (never resend a property already recommended)
    const fresh = (byBuyer.get(buyerId) ?? []).filter((m) => !alreadyRecommended.has(`${buyerId}|${m.propertyId}`));
    if (!fresh.length) { skipped++; continue; }

    // resolve available property details (exclude sold/rented/withdrawn/archived)
    const freshIds = fresh.slice(0, 40).map((m) => m.propertyId);
    const { data: propRows } = await db.from("properties")
      .select("id,title,city,price,rooms,primary_image_url,status")
      .in("id", freshIds).eq("org_id", orgId).eq("status", "active");
    const scoreOf = new Map(fresh.map((m) => [m.propertyId, m.score]));
    const props: BundleProp[] = ((propRows ?? []) as any[])
      .map((p) => ({ id: p.id, title: (p.title as string)?.trim() || "נכס", city: p.city, price: p.price, rooms: p.rooms, imageUrl: p.primary_image_url, score: scoreOf.get(p.id) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PER_BUNDLE);
    if (!props.length) { skipped++; continue; }

    const bundleId = randomUUID();                          // random: only the tracking URL + ledger grouping
    const viewUrl = recoUrl({ o: orgId, t: "buyer", c: buyerId, b: bundleId });
    // Deterministic per buyer-per-Israel-day so two concurrent/replayed runs
    // resolve to the SAME dedup key → unique(org_id, dedup_key) blocks a 2nd send.
    const dedupKey = buyerMatchDedupKey(buyerId, nowMs);   // ONE business communication across channels

    // ── Deterministic channel strategy — WhatsApp preferred, email fallback.
    //    Consent is evaluated INDEPENDENTLY per channel (email opt-in never implies
    //    WhatsApp opt-in). Fail-closed: unknown/opted-out → that channel is out. ──
    const phone = normalizePhone(buyer.phone);
    const waGate = phone && waTemplate && waConnected
      ? await checkChannelEligibility({ orgId, contactType: "buyer", contactId: buyerId, channel: "whatsapp", purpose: "marketing" }, db)
      : { eligible: false, status: null, reason: "wa_not_available" };
    const emailGate = buyer.email
      ? await checkChannelEligibility({ orgId, contactType: "buyer", contactId: buyerId, channel: "email", purpose: "marketing" }, db)
      : { eligible: false, status: null, reason: "no_email" };

    if (!waGate.eligible && !emailGate.eligible) { skipped++; continue; }   // no consented + deliverable channel

    // BOTH channels when independently consented — WhatsApp AND email (not
    // either/or). Each channel has its own dedup key; each honors its own consent.
    const channelUsed: "whatsapp" | "email" = waGate.eligible ? "whatsapp" : "email";
    let anySent = false, anyDeferred = false;
    const nowIso = new Date().toISOString();

    if (waGate.eligible) {
      const firstName = (buyer.full_name ?? "").trim().split(/\s+/)[0] || "לקוח";
      const area = props.find((p) => p.city)?.city ?? "האזור שלך";
      const waText = `היי ${firstName}, מצאנו ${props.length} נכסים שמתאימים למה שחיפשת ב${area}. לצפייה: ${viewUrl ?? ""}`;
      const template = { name: waTemplate as string, language: "he", variables: [firstName, String(props.length), area, viewUrl ?? ""] };
      const wreq = { orgId, userId: null as string | null, channel: "whatsapp" as const, to: phone as string, title: null, body: waText, template, dedupKey: `${dedupKey}:wa` };
      if (isQuietHours(nowIso)) {
        // No night spam — defer; the communication-dispatch cron sends it in the morning.
        await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: morningSendTime(nowIso) });
        deferred++; anyDeferred = true;
      } else {
        const r = await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: null });
        if (r.sent) { viaWhatsapp++; anySent = true; }
      }
    }

    // Email — ALWAYS in addition to WhatsApp when the buyer consented to email marketing.
    if (emailGate.eligible && buyer.email) {
      const unsub = unsubUrl({ o: orgId, t: "buyer", c: buyerId, ch: "email" });
      const msg = renderBundleEmail({ officeName, buyerName: buyer.full_name ?? "", props, viewUrl, unsubscribeUrl: unsub });
      const res = await sendCustomerEmail({
        orgId, contact: { type: "buyer", id: buyerId, name: buyer.full_name, email: buyer.email },
        purpose: "marketing", subject: msg.subject, text: msg.text, html: msg.html, dedupKey: `${dedupKey}:email`,
      }, db);
      if (res.sent) { viaEmail++; anySent = true; }
    }

    if (!anySent && !anyDeferred) { skipped++; continue; }   // nothing delivered/queued

    // record each recommendation (dedup ledger + price-drop-ready + agent visibility)
    const rows = props.map((p) => ({
      org_id: orgId, contact_type: "buyer", contact_id: buyerId, property_id: p.id,
      bundle_id: bundleId, channel: channelUsed, status: "recommended",
      match_score: p.score, price_at_send: p.price ?? null, recommended_at: new Date().toISOString(),
    }));
    try { await db.from("customer_property_recommendations").upsert(rows, { onConflict: "org_id,contact_type,contact_id,property_id", ignoreDuplicates: true }); } catch { /* ledger best-effort */ }
    props.forEach((p) => alreadyRecommended.add(`${buyerId}|${p.id}`));
    sentToday.add(buyerId);

    await emitBusinessEvent({
      type: DOMAIN_EVENTS.buyerMatchesReady, entityType: "buyer", entityId: buyerId, orgId,
      idempotencyKey: buyerMatchEventKey(buyerId, nowMs),
      metadata: { count: props.length, bundleId, channel: channelUsed },
    });
    bundlesSent++;
  }
  return { org: orgId, buyers: buyerIds.length, bundlesSent, skipped, viaWhatsapp, viaEmail, deferred };
}

export interface PropertySendResult { property: string; recipients: number; sent: number; skipped: number; viaWhatsapp: number; viaEmail: number; deferred: number; sentBuyerIds: string[] }

/** Marketing Autopilot 2.0 execution primitive — send ONE property to its strong,
 *  eligible, NET-NEW matched buyers through the SAME consent-gated transport +
 *  recommendation ledger the daily bundle engine uses (no second notification
 *  system). Idempotent: the per-(property,buyer) dedupKey and the
 *  customer_property_recommendations unique constraint both prevent a re-send, so
 *  a plan retry/double-activate never messages a buyer twice. `recipientIds`
 *  restricts to the plan's approved audience; consent is STILL re-checked here. */
export async function sendPropertyMatchesForOrg(
  orgId: string, propertyId: string,
  opts?: { recipientIds?: string[]; limit?: number; db?: any },
): Promise<PropertySendResult> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const restrict = opts?.recipientIds && opts.recipientIds.length ? new Set(opts.recipientIds) : null;

  // Property must still be available.
  const { data: prop } = await db.from("properties")
    .select("id,title,city,price,rooms,primary_image_url,status")
    .eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  if (!prop || prop.status !== "active") return { property: propertyId, recipients: 0, sent: 0, skipped: 0, viaWhatsapp: 0, viaEmail: 0, deferred: 0, sentBuyerIds: [] };

  // Strong, active matches for THIS property.
  const { data: matchRows } = await db.from("match_intelligence_profiles")
    .select("buyer_id,compatibility_score")
    .eq("org_id", orgId).eq("property_id", propertyId).eq("match_status", "active").gte("compatibility_score", MATCH_THRESHOLD)
    .order("compatibility_score", { ascending: false }).limit(500);
  let buyerIds = ((matchRows ?? []) as any[]).map((m) => m.buyer_id as string);
  const scoreOf = new Map(((matchRows ?? []) as any[]).map((m) => [m.buyer_id as string, m.compatibility_score as number]));
  if (restrict) buyerIds = buyerIds.filter((id) => restrict.has(id));
  buyerIds = buyerIds.slice(0, opts?.limit ?? 200);
  if (!buyerIds.length) return { property: propertyId, recipients: 0, sent: 0, skipped: 0, viaWhatsapp: 0, viaEmail: 0, deferred: 0, sentBuyerIds: [] };

  // Already-sent (this property) → net-new only.
  const { data: recRows } = await db.from("customer_property_recommendations")
    .select("contact_id").eq("org_id", orgId).eq("contact_type", "buyer").eq("property_id", propertyId).in("contact_id", buyerIds);
  const alreadySent = new Set(((recRows ?? []) as any[]).map((r) => r.contact_id as string));

  const { data: buyerRows } = await db.from("buyers").select("id,full_name,email,phone").in("id", buyerIds);
  const buyers = new Map<string, { full_name: string | null; email: string | null; phone: string | null }>();
  for (const b of (buyerRows ?? []) as any[]) buyers.set(b.id, { full_name: b.full_name, email: b.email, phone: b.phone });

  const { data: orgRow } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const officeName = (orgRow?.name as string) || "צוות ZONO";
  const waTemplate = WA_MATCH_TEMPLATE();
  const waConnected = waTemplate ? await providerFor("whatsapp").isConfigured(orgId) : false;

  const bundleProp: BundleProp = { id: prop.id, title: (prop.title as string)?.trim() || "נכס", city: prop.city, price: prop.price, rooms: prop.rooms, imageUrl: prop.primary_image_url, score: 0 };
  let sent = 0, skipped = 0, viaWhatsapp = 0, viaEmail = 0, deferred = 0;
  const sentBuyerIds: string[] = [];
  const nowIso = new Date().toISOString();

  for (const buyerId of buyerIds) {
    const buyer = buyers.get(buyerId);
    if (!buyer) { skipped++; continue; }
    if (alreadySent.has(buyerId)) { skipped++; continue; }   // net-new only (idempotent ledger)

    const phone = normalizePhone(buyer.phone);
    const waGate = phone && waTemplate && waConnected
      ? await checkChannelEligibility({ orgId, contactType: "buyer", contactId: buyerId, channel: "whatsapp", purpose: "marketing" }, db)
      : { eligible: false, status: null, reason: "wa_not_available" };
    const emailGate = buyer.email
      ? await checkChannelEligibility({ orgId, contactType: "buyer", contactId: buyerId, channel: "email", purpose: "marketing" }, db)
      : { eligible: false, status: null, reason: "no_email" };
    if (!waGate.eligible && !emailGate.eligible) { skipped++; continue; }

    const score = scoreOf.get(buyerId) ?? 0;
    const props = [{ ...bundleProp, score }];
    const dedupKey = `marketing-plan-send:${propertyId}:${buyerId}`;  // STABLE → retry-safe
    const viewUrl = recoUrl({ o: orgId, t: "buyer", c: buyerId, b: propertyId });
    const channelUsed: "whatsapp" | "email" = waGate.eligible ? "whatsapp" : "email";
    let anySent = false, anyDeferred = false;

    if (waGate.eligible) {
      const firstName = (buyer.full_name ?? "").trim().split(/\s+/)[0] || "לקוח";
      const area = prop.city ?? "האזור שלך";
      const waText = `היי ${firstName}, יש נכס חדש שמתאים למה שחיפשת ב${area}. לצפייה: ${viewUrl ?? ""}`;
      const template = { name: waTemplate as string, language: "he", variables: [firstName, "1", area, viewUrl ?? ""] };
      const wreq = { orgId, userId: null as string | null, channel: "whatsapp" as const, to: phone as string, title: null, body: waText, template, dedupKey: `${dedupKey}:wa` };
      if (isQuietHours(nowIso)) { await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: morningSendTime(nowIso) }); deferred++; anyDeferred = true; }
      else { const r = await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: null }); if (r.sent) { viaWhatsapp++; anySent = true; } }
    }
    if (emailGate.eligible && buyer.email) {
      const unsub = unsubUrl({ o: orgId, t: "buyer", c: buyerId, ch: "email" });
      const msg = renderBundleEmail({ officeName, buyerName: buyer.full_name ?? "", props, viewUrl, unsubscribeUrl: unsub });
      const res = await sendCustomerEmail({ orgId, contact: { type: "buyer", id: buyerId, name: buyer.full_name, email: buyer.email }, purpose: "marketing", subject: msg.subject, text: msg.text, html: msg.html, dedupKey: `${dedupKey}:email` }, db);
      if (res.sent) { viaEmail++; anySent = true; }
    }
    if (!anySent && !anyDeferred) { skipped++; continue; }

    try {
      await db.from("customer_property_recommendations").upsert([{
        org_id: orgId, contact_type: "buyer", contact_id: buyerId, property_id: propertyId,
        bundle_id: propertyId, channel: channelUsed, status: "recommended",
        match_score: score, price_at_send: prop.price ?? null, recommended_at: new Date().toISOString(),
      }], { onConflict: "org_id,contact_type,contact_id,property_id", ignoreDuplicates: true });
    } catch { /* ledger best-effort */ }
    alreadySent.add(buyerId);
    sent++; sentBuyerIds.push(buyerId);
    await emitBusinessEvent({ type: DOMAIN_EVENTS.buyerMatchesReady, entityType: "buyer", entityId: buyerId, orgId, idempotencyKey: `buyer.matches_ready:marketing-plan:${propertyId}:${buyerId}`, metadata: { property: propertyId, channel: channelUsed, source: "marketing_plan" } });
  }
  return { property: propertyId, recipients: buyerIds.length, sent, skipped, viaWhatsapp, viaEmail, deferred, sentBuyerIds };
}

/** Weekly/daily cron entry point — bounded across orgs. */
export async function runAllOrgsBuyerMatchBundles(opts?: { orgLimit?: number; perOrgLimit?: number }): Promise<{ orgs: number; bundlesSent: number; skipped: number; viaWhatsapp: number; viaEmail: number; deferred: number; results: BundleResult[] }> {
  const db: any = createServiceRoleClient();
  const { data } = await db.from("organizations").select("id").limit(opts?.orgLimit ?? 100);
  const orgIds = ((data ?? []) as any[]).map((o) => o.id).filter(Boolean);
  const results: BundleResult[] = [];
  let bundlesSent = 0, skipped = 0, viaWhatsapp = 0, viaEmail = 0, deferred = 0;
  for (const id of orgIds) {
    const r = await runBuyerMatchBundlesForOrg(id, { limit: opts?.perOrgLimit ?? 200 });
    results.push(r); bundlesSent += r.bundlesSent; skipped += r.skipped;
    viaWhatsapp += r.viaWhatsapp; viaEmail += r.viaEmail; deferred += r.deferred;
  }
  return { orgs: orgIds.length, bundlesSent, skipped, viaWhatsapp, viaEmail, deferred, results };
}
