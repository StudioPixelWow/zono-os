/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Property PRICE-DROP / BACK-ON-MARKET customer automation (server-only).
// Slice 4. Turns a MEANINGFUL property change into ONE useful, consent-compliant,
// personalized customer message — never spam. It REUSES everything: consent gate,
// per-channel marketing eligibility, WhatsApp Business template send + email
// (dispatchExternal / sendCustomerEmail), quiet-hours engine, the recommendation
// ledger (price_at_send = the price THIS customer previously saw), the secure /r
// view + canonical feedback, and notification_deliveries as the idempotency +
// audit ledger. It does NOT rebuild matching, CRM, providers or a 2nd reco table.
//
// Flow: detect drop (reco-scan) → build audience from real CRM history → per-
// customer delta from THEIR price_at_send → exclusions → consent + channel →
// frequency cap → dedup → WhatsApp/Email → secure view → response feeds CRM /
// Viewing / Follow-up. Price INCREASE → no marketing. Property UNAVAILABLE →
// fail closed. Everything org-scoped; nothing trusts client-supplied relations.
// ============================================================================
import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { checkChannelEligibility } from "./consent";
import { sendCustomerEmail } from "./send";
import { recoUrl } from "./recommend-tokens";
import { unsubUrl } from "./unsubscribe";
import { dispatchExternal } from "@/lib/communication/dispatch";
import { providerFor } from "@/lib/notify/providers";
import { isQuietHours, morningSendTime } from "@/lib/communication/quiet-hours";
import {
  computePriceDelta, isMeaningfulDrop, isMarketableStatus, formatIls, type PriceDelta,
} from "./price-change-policy";

// Variables for the approved template: {{1}} name {{2}} property {{3}} old price {{4}} new price {{5}} url.
const WA_PRICEDROP_TEMPLATE = () => process.env.ZONO_WHATSAPP_PRICEDROP_TEMPLATE || null;
const WA_BACKONMARKET_TEMPLATE = () => process.env.ZONO_WHATSAPP_BACKONMARKET_TEMPLATE || null;
const MATCH_HIGH = 70;               // P4 threshold for match_intelligence compatibility
const MAX_AUDIENCE = 200;            // safety cap per property
const RECO_LOOKBACK_DAYS = 180;

type PropertyRow = { id: string; org_id: string; title: string | null; city: string | null; price: number | null; status: string | null; primary_image_url: string | null; rooms: number | null };
type UpdateKind = "drop" | "backonmarket";

interface Candidate {
  contactType: "buyer" | "lead";
  contactId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  lastPriceSeen: number | null;   // THEIR historical price (price_at_send) or property fallback
  bundleId: string | null;        // existing reco bundle (for the secure view), or null → we create one
  matchScore: number | null;
  priority: 1 | 2 | 3 | 4;
}

export interface PropertyUpdateResult {
  property: string; considered: number; eligible: number; sent: number; deferred: number; skipped: number; reason?: string;
}

function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  if (d.length === 9) return "972" + d;
  return null;
}
const firstNameOf = (full: string | null) => (full ?? "").trim().split(/\s+/)[0] || "לקוח";
const startOfTodayIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

async function loadProperty(db: any, orgId: string, propertyId: string): Promise<PropertyRow | null> {
  const { data } = await db.from("properties")
    .select("id,org_id,title,city,price,status,primary_image_url,rooms")
    .eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  return (data as PropertyRow | null) ?? null;
}

// ── Audience from REAL CRM history (reco ledger + interest edges + completed
//    viewings + active high match). Rejections (status or edge) are excluded. ──
async function buildAudience(db: any, prop: PropertyRow, opts: { fallbackOldPrice: number | null; requirePreviousInterest?: boolean }): Promise<Candidate[]> {
  const orgId = prop.org_id;
  const rejected = new Set<string>();            // `${type}:${id}`
  const byKey = new Map<string, Candidate>();

  // 1) Recommendation ledger — the authoritative per-customer price history.
  const { data: recRows } = await db.from("customer_property_recommendations")
    .select("contact_type,contact_id,status,price_at_send,bundle_id")
    .eq("org_id", orgId).eq("property_id", prop.id).limit(2000);
  for (const r of (recRows ?? []) as any[]) {
    const key = `${r.contact_type}:${r.contact_id}`;
    if (r.status === "rejected") { rejected.add(key); continue; }
    const priority: 1 | 2 | 3 | 4 = r.status === "viewing_requested" ? 3 : r.status === "interested" ? 2 : 4;
    byKey.set(key, {
      contactType: r.contact_type, contactId: r.contact_id, name: null, phone: null, email: null,
      lastPriceSeen: (r.price_at_send as number | null) ?? opts.fallbackOldPrice,
      bundleId: (r.bundle_id as string | null) ?? null, matchScore: null, priority,
    });
  }

  // 2) Interest / rejection edges (buyer-scoped).
  const { data: edges } = await db.from("entity_relationships")
    .select("source_entity_id,relationship_type")
    .eq("org_id", orgId).eq("source_entity_type", "buyer").eq("target_entity_type", "property")
    .eq("target_entity_id", prop.id).eq("status", "active").limit(2000);
  const interestedBuyers = new Set<string>();
  for (const e of (edges ?? []) as any[]) {
    if (e.relationship_type === "buyer_rejected_property") { rejected.add(`buyer:${e.source_entity_id}`); }
    else if (e.relationship_type === "buyer_interested_in_property" || e.relationship_type === "buyer_liked_property") interestedBuyers.add(e.source_entity_id);
  }

  // 3) Completed viewings (highest relevance) — meetings type viewing/open_house.
  const { data: views } = await db.from("meetings")
    .select("buyer_id").eq("org_id", orgId).eq("property_id", prop.id)
    .in("type", ["viewing", "open_house"]).eq("status", "completed").not("buyer_id", "is", null).limit(1000);
  const viewedBuyers = new Set<string>(((views ?? []) as any[]).map((v) => v.buyer_id).filter(Boolean));

  // 4) Active high match (match_intelligence).
  const { data: matches } = await db.from("match_intelligence_profiles")
    .select("buyer_id,compatibility_score").eq("org_id", orgId).eq("property_id", prop.id)
    .gte("compatibility_score", MATCH_HIGH).limit(1000);
  const matchByBuyer = new Map<string, number>();
  for (const m of (matches ?? []) as any[]) if (m.buyer_id) matchByBuyer.set(m.buyer_id, m.compatibility_score);

  // Merge buyer-only signals into candidates (add if not already present from reco).
  const addBuyer = (buyerId: string, priority: 1 | 2 | 3 | 4) => {
    const key = `buyer:${buyerId}`;
    if (rejected.has(key)) return;
    const existing = byKey.get(key);
    if (existing) { existing.priority = Math.min(existing.priority, priority) as 1 | 2 | 3 | 4; if (matchByBuyer.has(buyerId)) existing.matchScore = matchByBuyer.get(buyerId)!; return; }
    // Back-on-market requires PREVIOUS interest; a raw high match alone does not qualify.
    if (opts.requirePreviousInterest && priority === 4 && !interestedBuyers.has(buyerId) && !viewedBuyers.has(buyerId)) return;
    byKey.set(key, {
      contactType: "buyer", contactId: buyerId, name: null, phone: null, email: null,
      lastPriceSeen: opts.fallbackOldPrice, bundleId: null, matchScore: matchByBuyer.get(buyerId) ?? null, priority,
    });
  };
  for (const b of viewedBuyers) addBuyer(b, 1);
  for (const b of interestedBuyers) addBuyer(b, 2);
  if (!opts.requirePreviousInterest) for (const [b] of matchByBuyer) addBuyer(b, 4);

  // Upgrade priority to P1 for anyone who actually viewed.
  for (const b of viewedBuyers) { const c = byKey.get(`buyer:${b}`); if (c) c.priority = 1; }

  const candidates = [...byKey.values()].filter((c) => !rejected.has(`${c.contactType}:${c.contactId}`));
  if (!candidates.length) return [];

  // Hydrate contact details (bulk) — buyers + leads.
  const buyerIds = candidates.filter((c) => c.contactType === "buyer").map((c) => c.contactId);
  const leadIds = candidates.filter((c) => c.contactType === "lead").map((c) => c.contactId);
  const details = new Map<string, { name: string | null; phone: string | null; email: string | null }>();
  if (buyerIds.length) {
    const { data } = await db.from("buyers").select("id,full_name,phone,email").in("id", buyerIds).eq("org_id", orgId);
    for (const b of (data ?? []) as any[]) details.set(`buyer:${b.id}`, { name: b.full_name ?? null, phone: b.phone ?? null, email: b.email ?? null });
  }
  if (leadIds.length) {
    const { data } = await db.from("leads").select("id,full_name,phone,email").in("id", leadIds).eq("org_id", orgId);
    for (const l of (data ?? []) as any[]) details.set(`lead:${l.id}`, { name: l.full_name ?? null, phone: l.phone ?? null, email: l.email ?? null });
  }
  for (const c of candidates) {
    const d = details.get(`${c.contactType}:${c.contactId}`);
    c.name = d?.name ?? null; c.phone = d?.phone ?? null; c.email = d?.email ?? null;
  }
  // Invalid contact (no phone AND no email) is excluded.
  return candidates.filter((c) => c.phone || c.email).sort((a, b) => a.priority - b.priority);
}

// ── Frequency cap: at most one property-update message per customer per day. ──
async function hasRecentUpdate(db: any, orgId: string, contactId: string, sinceIso: string): Promise<boolean> {
  try {
    const { count } = await db.from("notification_deliveries").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).gte("created_at", sinceIso).like("dedup_key", `propupd:%:${contactId}:%`);
    return (count ?? 0) > 0;
  } catch { return false; }
}

function priceDropEmail(a: { officeName: string; name: string | null; prop: PropertyRow; delta: PriceDelta; url: string | null; unsub: string | null; kind: UpdateKind }): { subject: string; text: string; html: string } {
  const title = a.prop.title?.trim() || "נכס";
  const where = [a.prop.city, a.prop.rooms ? `${a.prop.rooms} חד'` : ""].filter(Boolean).join(" · ");
  const oldStr = formatIls(a.delta.oldPrice), newStr = formatIls(a.delta.newPrice), dropStr = formatIls(a.delta.dropAmount);
  const isBack = a.kind === "backonmarket";
  const subject = isBack ? `הנכס שחיפשת חזר לשוק — ${title}` : `ירידת מחיר — ${title}`;
  const headline = isBack ? "נכס שעניין אותך חזר לשוק" : `המחיר ירד ב-${dropStr}`;
  const textLines = [
    `שלום ${a.name ?? ""},`.trim(),
    isBack ? `הנכס ${title}${where ? ` (${where})` : ""} חזר לשוק ומחירו ${newStr}.`
           : `עדכון לגבי נכס שעניין אותך: ${title}${where ? ` (${where})` : ""}. המחיר ירד מ-${oldStr} ל-${newStr} (חיסכון של ${dropStr}).`,
    a.url ? `לפרטים ולצפייה: ${a.url}` : "",
  ].filter(Boolean);
  const text = textLines.join("\n") + (a.unsub ? `\n\nלהפסקת קבלת עדכונים: ${a.unsub}` : "");
  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px -18px rgba(15,23,42,.4)">
    ${a.prop.primary_image_url ? `<img src="${a.prop.primary_image_url}" alt="" style="width:100%;height:220px;object-fit:cover;display:block">` : ""}
    <div style="padding:22px">
      <p style="margin:0 0 4px;color:#6d28d9;font-size:12px;font-weight:800">${isBack ? "חזר לשוק" : "ירידת מחיר"}</p>
      <h1 style="margin:0 0 2px;color:#0f172a;font-size:20px;font-weight:900">${title}</h1>
      <p style="margin:0 0 14px;color:#64748b;font-size:13px">${where}</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:14px;margin:0 0 16px">
        <p style="margin:0;color:#166534;font-size:16px;font-weight:900">${headline}</p>
        ${isBack ? `<p style="margin:6px 0 0;color:#0f172a;font-size:15px">מחיר נוכחי: <strong>${newStr}</strong></p>`
                 : `<p style="margin:6px 0 0;color:#334155;font-size:15px"><span style="text-decoration:line-through;color:#94a3b8">${oldStr}</span> &nbsp;→&nbsp; <strong style="color:#0f172a">${newStr}</strong></p>`}
      </div>
      ${a.url ? `<a href="${a.url}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;border-radius:12px;padding:12px 22px;font-size:15px;font-weight:800">לצפייה בנכס</a>` : ""}
      <p style="margin:18px 0 0;color:#0f172a;font-size:14px;font-weight:700">${a.officeName}</p>
    </div>
  </div>
  ${a.unsub ? `<p style="text-align:center;margin:14px 0 0;color:#94a3b8;font-size:12px"><a href="${a.unsub}" style="color:#94a3b8">להפסקת קבלת עדכונים</a></p>` : ""}
</div></body></html>`;
  return { subject, text, html };
}

/** Ensure a reco row exists so the secure /r view + ledger work; returns bundleId. */
async function ensureRecoRow(db: any, orgId: string, c: Candidate, propertyId: string, channel: string): Promise<string> {
  if (c.bundleId) return c.bundleId;
  const bundleId = randomUUID();
  try {
    await db.from("customer_property_recommendations").upsert({
      org_id: orgId, contact_type: c.contactType, contact_id: c.contactId, property_id: propertyId,
      bundle_id: bundleId, channel, status: "recommended", match_score: c.matchScore,
      price_at_send: c.lastPriceSeen, recommended_at: new Date().toISOString(),
    }, { onConflict: "org_id,contact_type,contact_id,property_id", ignoreDuplicates: true });
  } catch { /* best-effort */ }
  // Re-read (a concurrent insert may have won) to return the authoritative bundle.
  try {
    const { data } = await db.from("customer_property_recommendations").select("bundle_id")
      .eq("org_id", orgId).eq("contact_type", c.contactType).eq("contact_id", c.contactId).eq("property_id", propertyId).maybeSingle();
    return (data?.bundle_id as string | null) ?? bundleId;
  } catch { return bundleId; }
}

// ── Core: send ONE property-update to a resolved, meaningful audience. ────────
async function dispatchUpdate(db: any, prop: PropertyRow, kind: UpdateKind, version: string, opts: { fallbackOldPrice: number | null }): Promise<PropertyUpdateResult> {
  const orgId = prop.org_id;
  const res: PropertyUpdateResult = { property: prop.id, considered: 0, eligible: 0, sent: 0, deferred: 0, skipped: 0 };

  // Fail closed: never market an unavailable property.
  if (!isMarketableStatus(prop.status) || prop.price == null) { res.reason = "not_marketable"; return res; }
  const newPrice = Number(prop.price);

  const audience = (await buildAudience(db, prop, { fallbackOldPrice: opts.fallbackOldPrice, requirePreviousInterest: kind === "backonmarket" })).slice(0, MAX_AUDIENCE);
  if (!audience.length) return res;

  const { data: orgRow } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const officeName = (orgRow?.name as string) || "ZONO";
  const waTemplate = kind === "backonmarket" ? WA_BACKONMARKET_TEMPLATE() : WA_PRICEDROP_TEMPLATE();
  const waConnected = waTemplate ? await providerFor("whatsapp").isConfigured(orgId) : false;
  const todayStart = startOfTodayIso();

  for (const c of audience) {
    res.considered++;

    // Per-customer delta from THEIR historical price. Drop must be meaningful for THEM.
    const delta = computePriceDelta(c.lastPriceSeen, newPrice);
    if (kind === "drop") {
      if (!delta || !isMeaningfulDrop(c.lastPriceSeen, newPrice)) { res.skipped++; continue; }
    }

    // Frequency cap: one property-update per customer per day.
    if (await hasRecentUpdate(db, orgId, c.contactId, todayStart)) { res.skipped++; continue; }

    // Per-channel MARKETING consent (independent WhatsApp vs Email; fail-closed).
    const phone = normalizePhone(c.phone);
    const waGate = phone && waTemplate && waConnected
      ? await checkChannelEligibility({ orgId, contactType: c.contactType, contactId: c.contactId, channel: "whatsapp", purpose: "marketing" }, db)
      : { eligible: false, status: null, reason: "wa_unavailable" };
    const emailGate = c.email
      ? await checkChannelEligibility({ orgId, contactType: c.contactType, contactId: c.contactId, channel: "email", purpose: "marketing" }, db)
      : { eligible: false, status: null, reason: "no_email" };
    if (!waGate.eligible && !emailGate.eligible) { res.skipped++; continue; }

    // BOTH channels are used when independently consented — WhatsApp AND email
    // (not either/or). Each channel has its OWN dedup key so one never blocks the
    // other, and each still honors its own marketing consent (fail-closed).
    const primaryChannel: "whatsapp" | "email" = waGate.eligible ? "whatsapp" : "email";
    const bundleId = await ensureRecoRow(db, orgId, c, prop.id, primaryChannel);
    const url = recoUrl({ o: orgId, t: c.contactType, c: c.contactId, b: bundleId });
    const baseKey = `propupd:${kind}:${c.contactId}:${prop.id}:${version}`;
    const effDelta = delta ?? computePriceDelta(newPrice, newPrice)!; // back-on-market may lack a drop
    res.eligible++;
    let anySent = false, anyDeferred = false;

    if (waGate.eligible) {
      const firstName = firstNameOf(c.name);
      const title = prop.title?.trim() || "נכס";
      const variables = kind === "backonmarket"
        ? [firstName, title, formatIls(newPrice), url ?? ""]
        : [firstName, title, formatIls(effDelta.oldPrice), formatIls(effDelta.newPrice), url ?? ""];
      const body = kind === "backonmarket"
        ? `היי ${firstName}, נכס שעניין אותך חזר לשוק: ${title} (${formatIls(newPrice)}). לצפייה: ${url ?? ""}`
        : `היי ${firstName}, המחיר של ${title} ירד ל-${formatIls(newPrice)}. לצפייה: ${url ?? ""}`;
      const wreq = { orgId, userId: null as string | null, channel: "whatsapp" as const, to: phone as string, title: null, body, template: { name: waTemplate as string, language: "he", variables }, dedupKey: `${baseKey}:wa` };
      const nowIso = new Date().toISOString();
      if (isQuietHours(nowIso)) {
        await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: morningSendTime(nowIso) });
        anyDeferred = true;
      } else {
        const r = await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: null });
        if (r.sent) anySent = true;
      }
    }

    // Email — ALWAYS in addition to WhatsApp when the customer consented to email
    // marketing (own dedup key, own branded card, immediate).
    if (emailGate.eligible && c.email) {
      const unsub = unsubUrl({ o: orgId, t: c.contactType, c: c.contactId, ch: "email" });
      const msg = priceDropEmail({ officeName, name: c.name, prop, delta: effDelta, url, unsub, kind });
      const r = await sendCustomerEmail({ orgId, contact: { type: c.contactType, id: c.contactId, name: c.name, email: c.email }, purpose: "marketing", subject: msg.subject, text: msg.text, html: msg.html, dedupKey: `${baseKey}:email` }, db);
      if (r.sent) anySent = true;
    }

    if (anySent) res.sent++;
    else if (anyDeferred) res.deferred++;
    else { res.skipped++; res.eligible--; }
  }

  // Canonical outcome event (idempotent per property+version) — surfacing + audit.
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({
      type: kind === "backonmarket" ? DOMAIN_EVENTS.propertyBackOnMarket : DOMAIN_EVENTS.propertyPriceDropped,
      entityType: "property", entityId: prop.id, orgId,
      payload: { newPrice, oldPrice: opts.fallbackOldPrice ?? null, eligible: res.eligible, sent: res.sent, deferred: res.deferred, title: prop.title ?? null },
      idempotencyKey: `${kind === "backonmarket" ? "property.back_on_market" : "property.price_dropped"}:${prop.id}:${version}`,
    });
  } catch { /* best-effort */ }
  return res;
}

/** Run price-drop automation for one property (event- or scan-triggered). */
export async function runPriceDropForProperty(orgId: string, propertyId: string, opts?: { oldPrice?: number | null; db?: any }): Promise<PropertyUpdateResult> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const prop = await loadProperty(db, orgId, propertyId);
  if (!prop) return { property: propertyId, considered: 0, eligible: 0, sent: 0, deferred: 0, skipped: 0, reason: "not_found" };
  return dispatchUpdate(db, prop, "drop", String(prop.price ?? "0"), { fallbackOldPrice: opts?.oldPrice ?? null });
}

/** Run back-on-market automation for one property. `version` keys the dedup (e.g. the event id). */
export async function runBackOnMarketForProperty(orgId: string, propertyId: string, version: string, opts?: { db?: any }): Promise<PropertyUpdateResult> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const prop = await loadProperty(db, orgId, propertyId);
  if (!prop) return { property: propertyId, considered: 0, eligible: 0, sent: 0, deferred: 0, skipped: 0, reason: "not_found" };
  return dispatchUpdate(db, prop, "backonmarket", version, { fallbackOldPrice: null });
}

// ── Agent-visibility summary (real counts only — no vanity metrics). ─────────
export interface PriceDropSummary {
  propertyId: string; currentPrice: number | null; lowestSeenPrice: number | null; highestSeenPrice: number | null;
  drop: number | null; eligible: number; sent: number; responded: number; viewingsGenerated: number;
}
export async function getPropertyPriceDropSummary(orgId: string, propertyId: string, db?: any): Promise<PriceDropSummary> {
  const client: any = db ?? createServiceRoleClient();
  const prop = await loadProperty(client, orgId, propertyId);
  const currentPrice = prop?.price != null ? Number(prop.price) : null;
  const { data: recs } = await client.from("customer_property_recommendations")
    .select("price_at_send,status").eq("org_id", orgId).eq("property_id", propertyId).limit(2000);
  const rows = (recs ?? []) as Array<{ price_at_send: number | null; status: string }>;
  const seen = rows.map((r) => r.price_at_send).filter((n): n is number => n != null);
  const highestSeenPrice = seen.length ? Math.max(...seen) : null;
  const lowestSeenPrice = seen.length ? Math.min(...seen) : null;
  const responded = rows.filter((r) => r.status === "interested" || r.status === "viewing_requested").length;
  const viewingsGenerated = rows.filter((r) => r.status === "viewing_requested").length;
  let sent = 0;
  try {
    const { count } = await client.from("notification_deliveries").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).like("dedup_key", `propupd:%:${propertyId}:%`);
    sent = count ?? 0;
  } catch { /* best-effort */ }
  const drop = currentPrice != null && highestSeenPrice != null && highestSeenPrice > currentPrice ? highestSeenPrice - currentPrice : null;
  return { propertyId, currentPrice, lowestSeenPrice, highestSeenPrice, drop, eligible: rows.length, sent, responded, viewingsGenerated };
}

// ── CRON entry: scan for meaningful drops + recent back-on-market events. ─────
export interface PriceDropRunResult { properties: number; sent: number; deferred: number; skipped: number; backOnMarket: number }

export async function runPriceUpdateDispatch(opts?: { recoLimit?: number; propertyLimit?: number }): Promise<PriceDropRunResult> {
  const db: any = createServiceRoleClient();
  const out: PriceDropRunResult = { properties: 0, sent: 0, deferred: 0, skipped: 0, backOnMarket: 0 };
  const sinceIso = new Date(Date.now() - RECO_LOOKBACK_DAYS * 86_400_000).toISOString();

  // 1) Detect meaningful drops by comparing each customer's price_at_send to the
  //    property's CURRENT price (server-derived; browser prices never trusted).
  const { data: recRows } = await db.from("customer_property_recommendations")
    .select("org_id,property_id,price_at_send,status")
    .not("price_at_send", "is", null).neq("status", "rejected").gte("recommended_at", sinceIso)
    .limit(opts?.recoLimit ?? 3000);
  const propIds = [...new Set(((recRows ?? []) as any[]).map((r) => r.property_id).filter(Boolean))];
  const propById = new Map<string, PropertyRow>();
  for (let i = 0; i < propIds.length; i += 300) {
    const chunk = propIds.slice(i, i + 300);
    const { data } = await db.from("properties").select("id,org_id,title,city,price,status,primary_image_url,rooms").in("id", chunk);
    for (const p of (data ?? []) as PropertyRow[]) propById.set(p.id, p);
  }
  // (org, property) → max historical price seen, only where a meaningful drop exists.
  const candidates = new Map<string, { orgId: string; propertyId: string; maxSeen: number }>();
  for (const r of (recRows ?? []) as any[]) {
    const p = propById.get(r.property_id);
    if (!p || !isMarketableStatus(p.status) || p.price == null) continue;
    if (!isMeaningfulDrop(r.price_at_send, Number(p.price))) continue;
    const key = `${p.org_id}:${p.id}`;
    const cur = candidates.get(key);
    const seen = Number(r.price_at_send);
    if (!cur) candidates.set(key, { orgId: p.org_id, propertyId: p.id, maxSeen: seen });
    else if (seen > cur.maxSeen) cur.maxSeen = seen;
  }
  const list = [...candidates.values()].slice(0, opts?.propertyLimit ?? 100);
  for (const c of list) {
    const r = await runPriceDropForProperty(c.orgId, c.propertyId, { oldPrice: c.maxSeen, db });
    out.properties++; out.sent += r.sent; out.deferred += r.deferred; out.skipped += r.skipped;
  }

  // 2) Back-on-market: process recent property.back_on_market events (dedup by event id).
  const backSinceIso = new Date(Date.now() - 24 * 3_600_000).toISOString();
  try {
    const { data: evts } = await db.from("domain_events")
      .select("id,organization_id,entity_id,occurred_at")
      .eq("event_type", "property.back_on_market").gte("occurred_at", backSinceIso).limit(200);
    for (const e of (evts ?? []) as any[]) {
      const r = await runBackOnMarketForProperty(e.organization_id, e.entity_id, e.id, { db });
      out.backOnMarket += r.sent; out.deferred += r.deferred; out.skipped += r.skipped;
    }
  } catch { /* domain_events read best-effort */ }

  return out;
}
