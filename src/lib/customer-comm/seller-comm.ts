/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — SELLER lifecycle communication (server-only). ONE restrained sender for
// the meaningful, one-time seller transitions — property LIVE, FIRST INTEREST,
// PRICE UPDATE confirmation, and SOLD/CLOSED. Reuses everything: consent gate
// (service_report; email by subscription, WhatsApp only on real opt-in — Meta-
// compliant), the Resend + WhatsApp Business transports, quiet hours, and
// notification_deliveries as the dedup + audit ledger. At most ONE transition
// message per property per run (the weekly report is separate) → a tight noise
// budget. PRIVACY: the seller NEVER receives buyer identity, phone, notes or
// counts of who — only aggregate, property-scoped facts. Fail-closed on unavailable
// property. Everything org-scoped; no buyer data ever crosses into a seller payload.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { checkChannelEligibility } from "./consent";
import { sendCustomerEmail } from "./send";
import { sellerReportUrl } from "./seller-report-tokens";
import { unsubUrl } from "./unsubscribe";
import { dispatchExternal } from "@/lib/communication/dispatch";
import { providerFor } from "@/lib/notify/providers";
import { isQuietHours, morningSendTime } from "@/lib/communication/quiet-hours";
import { formatIls, isUnavailableStatus } from "./price-change-policy";
import { getSellerLifecycle, type SellerLifecycle } from "@/lib/sellers/lifecycle";

const WA_LIVE_TEMPLATE = () => process.env.ZONO_WHATSAPP_SELLER_LIVE_TEMPLATE || null;
const WA_UPDATE_TEMPLATE = () => process.env.ZONO_WHATSAPP_SELLER_UPDATE_TEMPLATE || null;
const CLOSED_STATUSES = ["sold", "rented"];

type TransitionKind = "closed" | "price-update" | "first-interest" | "live";

interface SellerContact { sellerId: string; name: string | null; email: string | null; phone: string | null; receivesReports: boolean }
interface PropertyRow { id: string; org_id: string; status: string | null; price: number | null; title: string | null; city: string | null; primary_image_url: string | null }

export interface SellerCommResult { property: string; considered: number; sent: number; deferred: number; skipped: number; kind?: TransitionKind }

function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  if (d.length === 9) return "972" + d;
  return null;
}
const firstNameOf = (full: string | null) => (full ?? "").trim().split(/\s+/)[0] || "";

async function loadReportSeller(db: any, orgId: string, propertyId: string): Promise<SellerContact | null> {
  const { data: link } = await db.from("property_sellers")
    .select("seller_id,is_primary,receives_reports,status")
    .eq("org_id", orgId).eq("property_id", propertyId).eq("status", "active").eq("receives_reports", true)
    .order("is_primary", { ascending: false }).limit(1).maybeSingle();
  const sellerId = (link?.seller_id as string | null) ?? null;
  if (!sellerId) return null;
  const { data: s } = await db.from("sellers").select("full_name,email,phone").eq("id", sellerId).eq("org_id", orgId).maybeSingle();
  return { sellerId, name: (s?.full_name as string | null) ?? null, email: (s?.email as string | null) ?? null, phone: (s?.phone as string | null) ?? null, receivesReports: link?.receives_reports !== false };
}

function officeNameHtml(officeName: string, title: string, priceLine: string, headline: string, body: string, cta: { label: string; url: string } | null, image: string | null, unsub: string | null): string {
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px -18px rgba(15,23,42,.4)">
    ${image ? `<img src="${image}" alt="" style="width:100%;height:210px;object-fit:cover;display:block">` : ""}
    <div style="padding:24px">
      <p style="margin:0 0 4px;color:#6d28d9;font-size:12px;font-weight:800">${officeName}</p>
      <h1 style="margin:0 0 2px;color:#0f172a;font-size:20px;font-weight:900">${title}</h1>
      <p style="margin:0 0 16px;color:#64748b;font-size:13px">${priceLine}</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:14px;margin:0 0 16px">
        <p style="margin:0;color:#166534;font-size:16px;font-weight:900">${headline}</p>
        <p style="margin:6px 0 0;color:#334155;font-size:15px">${body}</p>
      </div>
      ${cta ? `<a href="${cta.url}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;border-radius:12px;padding:12px 22px;font-size:15px;font-weight:800">${cta.label}</a>` : ""}
      <p style="margin:18px 0 0;color:#0f172a;font-size:14px;font-weight:700">${officeName}</p>
    </div>
  </div>
  ${unsub ? `<p style="text-align:center;margin:14px 0 0;color:#94a3b8;font-size:12px"><a href="${unsub}" style="color:#94a3b8">להפסקת קבלת עדכונים</a></p>` : ""}
</div></body></html>`;
}

interface TransitionMsg { headline: string; body: string; waText: string; waTemplate: string | null }

/** Build the seller-safe message for a transition. NEVER includes buyer identity. */
function buildTransition(kind: TransitionKind, prop: PropertyRow, life: SellerLifecycle, name: string): TransitionMsg | null {
  const hi = name ? `${name}, ` : "";
  const priceStr = formatIls(prop.price);
  const title = prop.title?.trim() || "הנכס שלך";
  switch (kind) {
    case "live":
      return {
        headline: "הנכס שלכם עלה לשיווק",
        body: `${hi}הנכס ${title} עלה לשיווק${priceStr ? ` במחיר ${priceStr}` : ""}. נעדכן אתכם בהתקדמות.`,
        waText: `${hi}הנכס ${title} עלה לשיווק${priceStr ? ` (${priceStr})` : ""}. נעדכן בהתקדמות.`,
        waTemplate: WA_LIVE_TEMPLATE(),
      };
    case "first-interest":
      // Aggregate only — no buyer name/phone/notes/requirements.
      return {
        headline: "נרשמה התעניינות ראשונה בנכס",
        body: `${hi}נרשמה התעניינות ראשונה בנכס. הסוכן/ת מטפל/ת בהמשך ויעדכן אתכם.`,
        waText: `${hi}נרשמה התעניינות ראשונה בנכס ${title}. הסוכן מטפל בהמשך.`,
        waTemplate: WA_UPDATE_TEMPLATE(),
      };
    case "price-update": {
      const n = life.metrics.priceUpdatesSent;
      const reach = n > 0 ? ` העדכון הופץ ל-${n} מתעניינים רלוונטיים.` : "";
      return {
        headline: "המחיר עודכן",
        body: `${hi}המחיר של ${title} עודכן ל-${priceStr}.${reach}`,
        waText: `${hi}המחיר של ${title} עודכן ל-${priceStr}.${reach}`,
        waTemplate: WA_UPDATE_TEMPLATE(),
      };
    }
    case "closed":
      return {
        headline: "העסקה הושלמה 🎉",
        body: `${hi}העסקה על ${title} הושלמה. תודה שבחרתם בנו!`,
        waText: `${hi}העסקה על ${title} הושלמה 🎉 תודה שבחרתם בנו!`,
        waTemplate: WA_UPDATE_TEMPLATE(),
      };
  }
}

/** Which single transition (highest priority) applies to this property right now? */
function pickTransition(prop: PropertyRow, life: SellerLifecycle, recentPriceChange: boolean): TransitionKind | null {
  const status = String(prop.status ?? "");
  if (life.closed && CLOSED_STATUSES.includes(status)) return "closed";        // sold/rented (withdrawn/archived: silent stop)
  if (life.metrics.priceUpdatesSent >= 0 && recentPriceChange) return "price-update";
  if (life.lifecycleState === "interest" || life.lifecycleState === "viewings" || life.metrics.interested > 0) {
    // first meaningful interest
    return "first-interest";
  }
  if ((life.metrics.activeCampaign || life.metrics.publications > 0) && (status === "active" || status === "published")) return "live";
  return null;
}

/** Send at most ONE new seller transition message for a property (dedup + consent + quiet-hours). */
export async function runSellerCommForProperty(db: any, orgId: string, propertyId: string, opts?: { recentPriceChange?: boolean }): Promise<SellerCommResult> {
  const res: SellerCommResult = { property: propertyId, considered: 0, sent: 0, deferred: 0, skipped: 0 };

  const { data: prop } = await db.from("properties")
    .select("id,org_id,status,price,title,city,primary_image_url")
    .eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  if (!prop) return res;
  // Withdrawn/archived → fail closed (no seller marketing-performance comms); sold/rented allow the ONE closing note.
  if (isUnavailableStatus(prop.status) && !CLOSED_STATUSES.includes(String(prop.status))) { res.skipped++; return res; }

  const seller = await loadReportSeller(db, orgId, propertyId);
  if (!seller || (!seller.email && !seller.phone)) { res.skipped++; return res; }
  res.considered++;

  const life = await getSellerLifecycle(orgId, propertyId, db);
  if (!life) { res.skipped++; return res; }

  const kind = pickTransition(prop as PropertyRow, life, opts?.recentPriceChange === true);
  if (!kind) { res.skipped++; return res; }

  // Stable per-transition base dedup key.
  const versions: Record<TransitionKind, string> = {
    live: `seller-live:${propertyId}:${seller.sellerId}:v1`,
    "first-interest": `seller-first-interest:${propertyId}:${seller.sellerId}`,
    "price-update": `seller-price-update:${propertyId}:${seller.sellerId}:${prop.price ?? "0"}`,
    closed: `seller-closed:${propertyId}:${seller.sellerId}:v1`,
  };
  const baseKey = versions[kind];

  // Already sent (either channel)? → nothing to do.
  try {
    const { count } = await db.from("notification_deliveries").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).like("dedup_key", `${baseKey}:%`);
    if ((count ?? 0) > 0) { res.skipped++; return res; }
  } catch { /* best-effort → dispatch dedup still protects */ }

  const msg = buildTransition(kind, prop as PropertyRow, life, firstNameOf(seller.name));
  if (!msg) { res.skipped++; return res; }

  const { data: orgRow } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const officeName = (orgRow?.name as string) || "ZONO";
  const reportUrl = sellerReportUrl({ o: orgId, c: seller.sellerId, p: propertyId });
  const priceStr = formatIls(prop.price);
  const priceLine = [prop.city, priceStr ? `מחיר מבוקש ${priceStr}` : ""].filter(Boolean).join(" · ");
  const subject = `${officeName} · ${msg.headline} — ${prop.title?.trim() || "הנכס שלך"}`;
  const unsub = unsubUrl({ o: orgId, t: "seller", c: seller.sellerId, ch: "email" });

  // Consent: email by subscription (receives_reports); WhatsApp requires REAL opt-in (Meta-compliant).
  const phone = normalizePhone(seller.phone);
  const waTemplate = msg.waTemplate;
  const waConnected = phone && waTemplate ? await providerFor("whatsapp").isConfigured(orgId) : false;
  const waGate = phone && waTemplate && waConnected
    ? await checkChannelEligibility({ orgId, contactType: "seller", contactId: seller.sellerId, channel: "whatsapp", purpose: "service_report" }, db)
    : { eligible: false, status: null, reason: "wa_unavailable" };
  const emailGate = seller.email
    ? await checkChannelEligibility({ orgId, contactType: "seller", contactId: seller.sellerId, channel: "email", purpose: "service_report", subscribed: seller.receivesReports }, db)
    : { eligible: false, status: null, reason: "no_email" };
  if (!waGate.eligible && !emailGate.eligible) { res.skipped++; return res; }

  let anySent = false, anyDeferred = false;

  if (waGate.eligible && phone && waTemplate) {
    const variables = [firstNameOf(seller.name) || "בעל/ת הנכס", prop.title?.trim() || "הנכס שלך", priceStr || "", reportUrl ?? ""];
    const wreq = { orgId, userId: null as string | null, channel: "whatsapp" as const, to: phone, title: null, body: msg.waText, template: { name: waTemplate, language: "he", variables }, dedupKey: `${baseKey}:wa` };
    const nowIso = new Date().toISOString();
    if (isQuietHours(nowIso)) { await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: morningSendTime(nowIso) }); anyDeferred = true; }
    else { const r = await dispatchExternal(db, "whatsapp", wreq, { scheduledAt: null }); if (r.sent) anySent = true; }
  }

  if (emailGate.eligible && seller.email) {
    const html = officeNameHtml(officeName, prop.title?.trim() || "הנכס שלך", priceLine, msg.headline, msg.body, reportUrl ? { label: "צפייה בדוח הנכס", url: reportUrl } : null, prop.primary_image_url, unsub);
    const text = `${msg.body}${reportUrl ? `\n\nלצפייה בדוח הנכס: ${reportUrl}` : ""}${unsub ? `\n\nלהפסקת קבלת עדכונים: ${unsub}` : ""}`;
    const r = await sendCustomerEmail({ orgId, contact: { type: "seller", id: seller.sellerId, name: seller.name, email: seller.email }, purpose: "service_report", subscribed: seller.receivesReports, subject, text, html, dedupKey: `${baseKey}:email` }, db);
    if (r.sent) anySent = true;
  }

  if (anySent) { res.sent++; res.kind = kind; }
  else if (anyDeferred) { res.deferred++; res.kind = kind; }
  else res.skipped++;

  // Log a seller touchpoint (real columns only).
  if (anySent || anyDeferred) {
    try {
      await db.from("property_seller_touchpoints").insert({
        org_id: orgId, property_id: propertyId, seller_id: seller.sellerId,
        touchpoint_type: "עדכון אוטומטי", title: msg.headline, description: subject, direction: "outbound",
      });
    } catch { /* best-effort */ }
  }
  return res;
}

export interface SellerCommRunResult { properties: number; sent: number; deferred: number; skipped: number }

/** CRON entry: scan actively-listed + recently-closed properties and send at most
 *  one seller transition each. Also processes recent price-change events. */
export async function runSellerLifecycleDispatch(opts?: { propertyLimit?: number }): Promise<SellerCommRunResult> {
  const db: any = createServiceRoleClient();
  const out: SellerCommRunResult = { properties: 0, sent: 0, deferred: 0, skipped: 0 };
  const limit = opts?.propertyLimit ?? 300;

  // Recently price-changed properties (last 72h) → force a price-update transition eligibility.
  const priceChanged = new Set<string>();
  try {
    const since = new Date(Date.now() - 72 * 3_600_000).toISOString();
    const { data: evts } = await db.from("domain_events").select("entity_id")
      .eq("event_type", "property.price_changed").gte("occurred_at", since).limit(500);
    for (const e of (evts ?? []) as any[]) if (e.entity_id) priceChanged.add(String(e.entity_id));
  } catch { /* best-effort */ }

  // Candidate properties: actively-listed (for live/interest/price) + sold/rented (for the closing note).
  const { data: props } = await db.from("properties")
    .select("id,org_id,status")
    .in("status", ["active", "published", "under_offer", "in_contract", "sold", "rented"])
    .order("updated_at", { ascending: false }).limit(limit);
  for (const p of (props ?? []) as any[]) {
    const r = await runSellerCommForProperty(db, p.org_id, p.id, { recentPriceChange: priceChanged.has(String(p.id)) });
    out.properties++; out.sent += r.sent; out.deferred += r.deferred; out.skipped += r.skipped;
  }
  return out;
}
