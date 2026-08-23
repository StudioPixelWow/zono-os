/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Property → Matched-Buyers BULK OUTREACH (server-only).
//
// Broker-driven counterpart to the autopilot bundle engine (match-bundle.ts).
// It turns the passive "קונים מתאימים" section into an action center: the broker
// picks specific matched buyers and sends THIS property to them over WhatsApp
// and/or email in one action.
//
// It reuses the SAME canonical primitives as the autopilot path — NO second
// engine, NO fake sending:
//   • matches            → match_intelligence_profiles (the one internal matcher)
//   • consent gate       → checkChannelEligibility (customer_comm_consent)
//   • WhatsApp transport → dispatchExternal("whatsapp") → Meta Graph (business)
//   • email transport    → sendCustomerEmail → Resend
//   • dedup / history    → customer_property_recommendations ledger
//   • tracked public link→ recoUrl → /r/{token} → public /p/{id}
//
// Difference from autopilot: the BROKER chooses the channel(s) and the exact
// recipients, and may explicitly re-send. The 70-score autopilot floor is NOT
// enforced for an explicit broker selection — a deliberate pick is honored as
// long as the contact is reachable and consented. Everything still passes the
// consent gate; opted-out / unreachable contacts are skipped with a real reason.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { sendCustomerEmail } from "./send";
import { checkChannelEligibility, isEligibleByPolicy, type ConsentStatus } from "./consent";
import { recoUrl } from "./recommend-tokens";
import { unsubUrl } from "./unsubscribe";
import { dispatchExternal } from "@/lib/communication/dispatch";
import { providerFor } from "@/lib/notify/providers";
import { isQuietHours, morningSendTime } from "@/lib/communication/quiet-hours";

/** Property statuses that have a live PUBLIC page (mirrors property-marketing/data.ts). */
const PUBLIC_STATUSES = new Set(["active", "published", "under_offer"]);
/** The approved Meta template for a property recommendation. WhatsApp is only
 *  offered when this is configured (an approved template genuinely exists) —
 *  otherwise the channel is honestly unavailable, never faked with a free-form
 *  business-initiated message (which Meta rejects outside the 24h window). */
const WA_MATCH_TEMPLATE = () => process.env.ZONO_WHATSAPP_MATCH_TEMPLATE || null;

const appBase = () =>
  (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")).replace(/\/$/, "");

/** Normalize an Israeli phone to international digits (no +), or null if invalid. */
function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return `972${d.slice(1)}`;
  if (d.length === 9) return `972${d}`;
  return d;
}

function firstNameOf(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "לקוח";
}

// ── read model ───────────────────────────────────────────────────────────────

export type OutreachChannelState = "available" | "not_consented" | "no_detail" | "not_connected";

export interface OutreachBuyer {
  buyerId: string;
  name: string;
  score: number | null;
  reason: string | null;
  status: string | null;
  whatsapp: OutreachChannelState;
  email: OutreachChannelState;
  agentName: string | null;
  agentAvatarUrl: string | null;
  lastSentAt: string | null; // ISO — this exact property already sent to this buyer
}

export interface OutreachProperty {
  id: string;
  title: string;
  city: string | null;
  price: number | null;
  published: boolean;   // has a live public page
  publicUrl: string | null; // generic public page (per-recipient links are tracked)
}

export interface MatchedBuyersOutreach {
  property: OutreachProperty;
  waConnected: boolean;
  waTemplateReady: boolean;
  emailConfigured: boolean;
  buyers: OutreachBuyer[];
}

/** Assemble the full matched-buyers outreach model for one property (org-scoped). */
export async function getMatchedBuyersForOutreach(
  orgId: string, propertyId: string, db: any = createServiceRoleClient(),
): Promise<MatchedBuyersOutreach | null> {
  const { data: prop } = await db.from("properties")
    .select("id,title,city,price,status")
    .eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  if (!prop) return null;

  const published = PUBLIC_STATUSES.has(prop.status);
  const base = appBase();
  const property: OutreachProperty = {
    id: prop.id,
    title: (prop.title as string)?.trim() || "נכס",
    city: prop.city ?? null,
    price: prop.price ?? null,
    published,
    publicUrl: published && base ? `${base}/p/${prop.id}` : null,
  };

  const { data: matchRows } = await db.from("match_intelligence_profiles")
    .select("buyer_id,compatibility_score,strongest_advantage,match_status")
    .eq("org_id", orgId).eq("property_id", propertyId).eq("match_status", "active")
    .order("compatibility_score", { ascending: false }).limit(500);
  const matches = (matchRows ?? []) as any[];
  const buyerIds = matches.map((m) => m.buyer_id as string).filter(Boolean);

  const waTemplateReady = !!WA_MATCH_TEMPLATE();
  const waConnected = waTemplateReady ? await providerFor("whatsapp").isConfigured(orgId) : false;
  const emailConfigured = await providerFor("email").isConfigured(orgId);

  if (!buyerIds.length) {
    return { property, waConnected, waTemplateReady, emailConfigured, buyers: [] };
  }

  const { data: buyerRows } = await db.from("buyers")
    .select("id,full_name,email,phone,owner_id,status").in("id", buyerIds);
  const buyers = new Map<string, any>();
  for (const b of (buyerRows ?? []) as any[]) buyers.set(b.id, b);

  // Assigned agents (buyers.owner_id → users).
  const agentIds = Array.from(new Set(((buyerRows ?? []) as any[]).map((b) => b.owner_id).filter(Boolean)));
  const agents = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  if (agentIds.length) {
    const { data: userRows } = await db.from("users").select("id,full_name,avatar_url").in("id", agentIds);
    for (const u of (userRows ?? []) as any[]) agents.set(u.id, { full_name: u.full_name, avatar_url: u.avatar_url });
  }

  // Already-sent (this property) → surfaces "נשלח כבר".
  const { data: recRows } = await db.from("customer_property_recommendations")
    .select("contact_id,recommended_at").eq("org_id", orgId).eq("contact_type", "buyer")
    .eq("property_id", propertyId).in("contact_id", buyerIds);
  const lastSent = new Map<string, string>();
  for (const r of (recRows ?? []) as any[]) {
    if (!lastSent.has(r.contact_id) || (r.recommended_at ?? "") > (lastSent.get(r.contact_id) ?? "")) {
      lastSent.set(r.contact_id, r.recommended_at ?? null);
    }
  }

  // Batch consent → per-channel eligibility (marketing purpose, same as autopilot).
  const { data: consentRows } = await db.from("customer_comm_consent")
    .select("contact_id,channel,status").eq("org_id", orgId).eq("contact_type", "buyer").in("contact_id", buyerIds);
  const consent = new Map<string, ConsentStatus>(); // key = `${buyerId}:${channel}`
  for (const c of (consentRows ?? []) as any[]) consent.set(`${c.contact_id}:${c.channel}`, c.status);
  const consented = (buyerId: string, channel: "whatsapp" | "email") =>
    isEligibleByPolicy({ status: consent.get(`${buyerId}:${channel}`) ?? "unset", purpose: "marketing" });

  const out: OutreachBuyer[] = [];
  for (const m of matches) {
    const b = buyers.get(m.buyer_id);
    if (!b) continue;
    const phone = normalizePhone(b.phone);
    const agent = b.owner_id ? agents.get(b.owner_id) : null;

    const waState: OutreachChannelState = !waConnected ? "not_connected"
      : !phone ? "no_detail"
      : consented(b.id, "whatsapp") ? "available" : "not_consented";
    const emailState: OutreachChannelState = !emailConfigured ? "not_connected"
      : !b.email ? "no_detail"
      : consented(b.id, "email") ? "available" : "not_consented";

    out.push({
      buyerId: b.id,
      name: (b.full_name as string)?.trim() || "לקוח",
      score: m.compatibility_score ?? null,
      reason: m.strongest_advantage ?? null,
      status: b.status ?? null,
      whatsapp: waState,
      email: emailState,
      agentName: agent?.full_name ?? null,
      agentAvatarUrl: agent?.avatar_url ?? null,
      lastSentAt: lastSent.get(b.id) ?? null,
    });
  }

  return { property, waConnected, waTemplateReady, emailConfigured, buyers: out };
}

// ── send ─────────────────────────────────────────────────────────────────────

export type ChannelOutcome =
  | { channel: "whatsapp" | "email"; state: "sent" | "deferred" }
  | { channel: "whatsapp" | "email"; state: "skipped"; reason: string };

export interface OutreachRecipientResult {
  buyerId: string;
  name: string;
  outcomes: ChannelOutcome[];
  delivered: boolean; // at least one channel sent/deferred
}

export interface SendOutreachResult {
  propertyId: string;
  requested: number;
  delivered: number;
  viaWhatsapp: number;
  viaEmail: number;
  deferred: number;
  skipped: number;
  recipients: OutreachRecipientResult[];
  sentBuyerIds: string[];
}

export interface SendOutreachInput {
  orgId: string;
  propertyId: string;
  recipientIds: string[];
  channels: { whatsapp: boolean; email: boolean };
  allowResend?: boolean;      // explicit re-send to already-contacted buyers
  emailSubject?: string;      // broker-editable email subject
  emailBody?: string;         // broker-editable email body (may contain {first_name} etc.)
}

const TOKENS = (map: Record<string, string>) => (s: string) =>
  s.replace(/\{(\w+)\}/g, (_m, k) => (k in map ? map[k] : `{${k}}`));

/** Broker-initiated send of ONE property to a SELECTED set of matched buyers.
 *  Honors the broker's channel choice (WhatsApp / email / both), re-checks
 *  consent per contact, and records every send in the canonical ledger.
 *  Idempotent on double-submit (stable dispatch dedup key) unless allowResend. */
export async function sendPropertyToSelectedBuyers(
  input: SendOutreachInput, db: any = createServiceRoleClient(),
): Promise<SendOutreachResult> {
  const { orgId, propertyId, channels, allowResend } = input;
  const recipientIds = Array.from(new Set(input.recipientIds ?? [])).filter(Boolean);
  const empty: SendOutreachResult = {
    propertyId, requested: recipientIds.length, delivered: 0, viaWhatsapp: 0, viaEmail: 0,
    deferred: 0, skipped: 0, recipients: [], sentBuyerIds: [],
  };
  if (!recipientIds.length || (!channels.whatsapp && !channels.email)) return empty;

  const { data: prop } = await db.from("properties")
    .select("id,title,city,price,status").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  if (!prop || !PUBLIC_STATUSES.has(prop.status)) return empty; // no public page → never send

  // Restrict to real matched buyers of THIS property (never trust client-only ids).
  const { data: matchRows } = await db.from("match_intelligence_profiles")
    .select("buyer_id,compatibility_score").eq("org_id", orgId).eq("property_id", propertyId)
    .eq("match_status", "active").in("buyer_id", recipientIds);
  const scoreOf = new Map(((matchRows ?? []) as any[]).map((m) => [m.buyer_id, m.compatibility_score ?? 0]));
  const validIds = recipientIds.filter((id) => scoreOf.has(id));
  if (!validIds.length) return empty;

  const { data: buyerRows } = await db.from("buyers").select("id,full_name,email,phone").in("id", validIds);
  const buyers = new Map<string, any>();
  for (const b of (buyerRows ?? []) as any[]) buyers.set(b.id, b);

  const { data: recRows } = await db.from("customer_property_recommendations")
    .select("contact_id").eq("org_id", orgId).eq("contact_type", "buyer").eq("property_id", propertyId).in("contact_id", validIds);
  const alreadySent = new Set(((recRows ?? []) as any[]).map((r) => r.contact_id as string));

  const { data: orgRow } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const officeName = (orgRow?.name as string) || "צוות ZONO";
  const waTemplate = WA_MATCH_TEMPLATE();
  const waConnected = channels.whatsapp && waTemplate ? await providerFor("whatsapp").isConfigured(orgId) : false;

  const nowIso = new Date().toISOString();
  const batch = allowResend ? `:r${nowIso.replace(/\D/g, "")}` : ""; // fresh key → real re-send
  const res: SendOutreachResult = { ...empty, requested: validIds.length };

  for (const buyerId of validIds) {
    const buyer = buyers.get(buyerId);
    const rr: OutreachRecipientResult = { buyerId, name: (buyer?.full_name as string)?.trim() || "לקוח", outcomes: [], delivered: false };
    if (!buyer) { res.skipped++; res.recipients.push(rr); continue; }
    if (alreadySent.has(buyerId) && !allowResend) {
      rr.outcomes.push({ channel: channels.whatsapp ? "whatsapp" : "email", state: "skipped", reason: "already_sent" });
      res.skipped++; res.recipients.push(rr); continue;
    }

    const phone = normalizePhone(buyer.phone);
    const firstName = firstNameOf(buyer.full_name);
    const area = prop.city ?? "האזור שלך";
    const viewUrl = recoUrl({ o: orgId, t: "buyer", c: buyerId, b: propertyId }) ?? property_public_fallback(prop.id);
    const dedupBase = `broker-send:${propertyId}:${buyerId}${batch}`;
    let anySent = false, anyDeferred = false, usedChannel: "whatsapp" | "email" | null = null;

    // WhatsApp (approved template only).
    if (channels.whatsapp) {
      if (!waConnected) rr.outcomes.push({ channel: "whatsapp", state: "skipped", reason: "not_connected" });
      else if (!phone) rr.outcomes.push({ channel: "whatsapp", state: "skipped", reason: "no_phone" });
      else {
        const gate = await checkChannelEligibility({ orgId, contactType: "buyer", contactId: buyerId, channel: "whatsapp", purpose: "marketing" }, db);
        if (!gate.eligible) rr.outcomes.push({ channel: "whatsapp", state: "skipped", reason: gate.reason || "not_consented" });
        else {
          const body = `היי ${firstName}, יש נכס שיכול להתאים למה שחיפשת ב${area}. לצפייה: ${viewUrl}`;
          const template = { name: waTemplate as string, language: "he", variables: [firstName, "1", area, viewUrl] };
          const wreq = { orgId, userId: null as string | null, channel: "whatsapp" as const, to: phone, title: null, body, template, dedupKey: `${dedupBase}:wa` };
          if (isQuietHours(nowIso)) { await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: morningSendTime(nowIso) }); rr.outcomes.push({ channel: "whatsapp", state: "deferred" }); anyDeferred = true; res.deferred++; usedChannel = "whatsapp"; }
          else { const r = await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: null }); if (r.sent) { rr.outcomes.push({ channel: "whatsapp", state: "sent" }); anySent = true; res.viaWhatsapp++; usedChannel = "whatsapp"; } else { rr.outcomes.push({ channel: "whatsapp", state: "skipped", reason: "send_failed" }); } }
        }
      }
    }

    // Email.
    if (channels.email) {
      if (!buyer.email) rr.outcomes.push({ channel: "email", state: "skipped", reason: "no_email" });
      else {
        const gate = await checkChannelEligibility({ orgId, contactType: "buyer", contactId: buyerId, channel: "email", purpose: "marketing" }, db);
        if (!gate.eligible) rr.outcomes.push({ channel: "email", state: "skipped", reason: gate.reason || "not_consented" });
        else {
          const unsub = unsubUrl({ o: orgId, t: "buyer", c: buyerId, ch: "email" });
          const fill = TOKENS({
            first_name: firstName, property_title: (prop.title as string)?.trim() || "נכס",
            property_price: prop.price != null ? `₪${Number(prop.price).toLocaleString("he-IL")}` : "",
            property_location: area, public_property_url: viewUrl, agent_name: "", office_name: officeName,
          });
          const subject = (input.emailSubject?.trim() ? fill(input.emailSubject) : "מצאתי נכס שיכול להתאים לך");
          const bodyText = input.emailBody?.trim()
            ? fill(input.emailBody)
            : `היי ${firstName},\nמצאתי נכס שמתאים למה שחיפשת וחשבתי שכדאי לך לראות אותו.\n\n${(prop.title as string)?.trim() || "נכס"}\n${prop.price != null ? `₪${Number(prop.price).toLocaleString("he-IL")}` : ""}\n${area}\n\nלצפייה בפרטי הנכס:\n${viewUrl}\n\n${officeName}`;
          const html = renderOutreachEmail({ bodyText, viewUrl, unsubscribeUrl: unsub ?? "", officeName });
          const r = await sendCustomerEmail({ orgId, contact: { type: "buyer", id: buyerId, name: buyer.full_name, email: buyer.email }, purpose: "marketing", subject, text: bodyText, html, dedupKey: `${dedupBase}:email` }, db);
          if (r.sent) { rr.outcomes.push({ channel: "email", state: "sent" }); anySent = true; res.viaEmail++; usedChannel = usedChannel ?? "email"; } else { rr.outcomes.push({ channel: "email", state: "skipped", reason: r.reason || "send_failed" }); }
        }
      }
    }

    if (!anySent && !anyDeferred) { res.skipped++; res.recipients.push(rr); continue; }

    // Canonical dedup / history ledger (best-effort; idempotent on the unique key).
    try {
      await db.from("customer_property_recommendations").upsert([{
        org_id: orgId, contact_type: "buyer", contact_id: buyerId, property_id: propertyId,
        bundle_id: propertyId, channel: usedChannel ?? "email", status: "recommended",
        match_score: scoreOf.get(buyerId) ?? null, price_at_send: prop.price ?? null, recommended_at: nowIso,
      }], { onConflict: "org_id,contact_type,contact_id,property_id", ignoreDuplicates: true });
    } catch { /* ledger best-effort */ }

    rr.delivered = true;
    res.delivered++; res.sentBuyerIds.push(buyerId);
    await emitBusinessEvent({
      type: DOMAIN_EVENTS.buyerMatchesReady, entityType: "buyer", entityId: buyerId, orgId,
      idempotencyKey: `buyer.matches_ready:broker-send:${propertyId}:${buyerId}${batch}`,
      metadata: { property: propertyId, channel: usedChannel, source: "broker_bulk_outreach" },
    });
    res.recipients.push(rr);
  }

  return res;
}

function property_public_fallback(id: string): string {
  const base = appBase();
  return base ? `${base}/p/${id}` : `/p/${id}`;
}

function renderOutreachEmail(a: { bodyText: string; viewUrl: string; unsubscribeUrl: string; officeName: string }): string {
  const paras = a.bodyText.split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#1f2430">${escapeHtml(l)}</p>`).join("");
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f6f5fb;padding:24px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ece9f6">
    <div style="padding:22px 24px">${paras}
      <a href="${a.viewUrl}" style="display:inline-block;margin-top:8px;background:#6d28d9;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:12px">לצפייה בנכס</a>
    </div>
    <div style="padding:14px 24px;background:#faf9ff;border-top:1px solid #ece9f6;font-size:11px;color:#8a8fa3">
      ${escapeHtml(a.officeName)} · <a href="${a.unsubscribeUrl}" style="color:#8a8fa3">הסרה מרשימת התפוצה</a>
    </div>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
