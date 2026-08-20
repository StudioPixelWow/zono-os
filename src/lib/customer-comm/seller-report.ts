/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — SELLER WEEKLY REPORT ("השבוע בנכס שלך"). The key launch feature of the
// external customer layer. For each actively-listed property whose primary
// seller receives reports, assemble the REAL last-7-days activity (publications,
// inquiries, qualified leads, viewings — no fabricated "views"), render a branded
// Hebrew email, and send it through the consent-gated customer sender (idempotent
// once per property/seller/week). Truthful: when a week had little activity, the
// report says so. Server-only; runs from the weekly cron.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendCustomerEmail } from "./send";
import { unsubUrl } from "./unsubscribe";
import { sellerReportUrl } from "./seller-report-tokens";
import { getSellerLifecycle } from "@/lib/sellers/lifecycle";
import { israelWeekWindow } from "@/lib/trends/model";

const ils = (n: number | null | undefined) =>
  n == null ? null : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : `₪${Math.round(n).toLocaleString("he-IL")}`;

interface WeeklyStats { publications: number; inquiries: number; qualified: number; viewings: number; activeCampaigns: number; priceUpdates: number }

async function weeklyStats(db: any, orgId: string, propertyId: string, sinceIso: string, untilIso: string): Promise<WeeklyStats> {
  const countOf = async (q: any): Promise<number> => { try { const { count } = await q; return count ?? 0; } catch { return 0; } };
  const [publications, leadsInq, contactClicks, qualified, viewings, activeCampaigns, priceUpdates] = await Promise.all([
    countOf(db.from("distribution_posts").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("property_id", propertyId).eq("publish_state", "published").gte("published_at", sinceIso)),
    countOf(db.from("leads").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("property_id", propertyId).gte("created_at", sinceIso)),
    countOf(db.from("activity_events").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("entity_type", "property").eq("entity_id", propertyId).eq("event_type", "property.contact_clicked").gte("occurred_at", sinceIso)),
    countOf(db.from("leads").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("property_id", propertyId).eq("stage", "qualified").gte("created_at", sinceIso)),
    // Viewings that ACTUALLY took place this week — bounded [sinceIso, untilIso)
    // so future-dated viewings later in the week aren't counted as "this week".
    countOf(db.from("meetings").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("property_id", propertyId).in("type", ["viewing", "open_house"]).gte("start_at", sinceIso).lt("start_at", untilIso)),
    countOf(db.from("distribution_campaigns").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("property_id", propertyId).eq("status", "active")),
    // Price/property update messages delivered to relevant buyers this week (real
    // delivery ledger; aggregate only — NO buyer identities ever reach the seller).
    countOf(db.from("notification_deliveries").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).in("status", ["sent", "delivered", "read"]).gte("created_at", sinceIso).like("dedup_key", `propupd:%:${propertyId}:%`)),
  ]);
  return { publications, inquiries: leadsInq + contactClicks, qualified, viewings, activeCampaigns, priceUpdates };
}

function renderReport(args: {
  officeName: string; sellerName: string; propertyTitle: string; city: string | null;
  photoUrl: string | null; askingPrice: number | null; stats: WeeklyStats; unsubscribeUrl: string | null;
  lifecycleLabel?: string | null; nextStep?: string | null; reportUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const { officeName, sellerName, propertyTitle, city, photoUrl, stats, unsubscribeUrl } = args;
  const lifecycleLabel = args.lifecycleLabel ?? null;
  const nextStep = args.nextStep ?? null;
  const reportUrl = args.reportUrl ?? null;
  const where = city ? ` ב${city}` : "";
  const subject = `השבוע בנכס שלך — ${propertyTitle}`;
  const active = stats.publications + stats.inquiries + stats.viewings > 0;
  const price = ils(args.askingPrice);

  const lines = [
    `שלום ${sellerName || ""},`.trim(),
    `הנה סיכום השבוע של הנכס שלך${where}: ${propertyTitle}${price ? ` · מחיר מבוקש ${price}` : ""}.`,
    ...(lifecycleLabel ? [`מצב הנכס: ${lifecycleLabel}`] : []),
    ``,
    `📣 פרסומים השבוע: ${stats.publications}`,
    `📥 פניות חדשות: ${stats.inquiries}`,
    `⭐ לידים מוסמכים: ${stats.qualified}`,
    `👁️ ביקורים: ${stats.viewings}`,
    `🗂️ קמפיינים פעילים: ${stats.activeCampaigns}`,
    ...(stats.priceUpdates > 0 ? [`📣 עדכון מחיר נשלח ל-${stats.priceUpdates} מתעניינים רלוונטיים`] : []),
    ``,
    active ? "נמשיך לפעול כדי להביא את הקונים הנכונים." : "השבוע היה שקט יחסית — אנחנו כבר עובדים על הגברת החשיפה בשבוע הקרוב.",
    ...(nextStep ? [``, `הצעד הבא שלנו: ${nextStep}`] : []),
    ...(reportUrl ? [``, `לצפייה בדוח המלא של הנכס: ${reportUrl}`] : []),
    ``,
    `בברכה, ${officeName}`,
  ];
  const text = lines.join("\n") + (unsubscribeUrl ? `\n\nלהפסקת קבלת הדוחות: ${unsubscribeUrl}` : "");

  const row = (icon: string, label: string, val: number) =>
    `<tr><td style="padding:8px 12px;font-size:15px;color:#334155">${icon} ${label}</td><td style="padding:8px 12px;font-size:18px;font-weight:800;color:#0f172a;text-align:left">${val}</td></tr>`;
  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px -18px rgba(15,23,42,.4)">
    ${photoUrl ? `<img src="${photoUrl}" alt="" style="width:100%;height:220px;object-fit:cover;display:block">` : ""}
    <div style="padding:22px">
      <p style="margin:0 0 4px;color:#6d28d9;font-size:12px;font-weight:800">השבוע בנכס שלך</p>
      <h1 style="margin:0 0 2px;color:#0f172a;font-size:20px;font-weight:900">${propertyTitle}</h1>
      <p style="margin:0 0 12px;color:#64748b;font-size:13px">${city ?? ""}${price ? ` · ${price}` : ""}</p>
      ${lifecycleLabel ? `<div style="display:inline-block;background:#ede9fe;color:#6d28d9;border-radius:999px;padding:5px 12px;font-size:13px;font-weight:800;margin:0 0 14px">${lifecycleLabel}</div>` : ""}
      <p style="margin:0 0 14px;color:#334155;font-size:15px">שלום ${sellerName || ""}, הנה מה שקרה השבוע:</p>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px">
        ${row("📣", "פרסומים השבוע", stats.publications)}
        ${row("📥", "פניות חדשות", stats.inquiries)}
        ${row("⭐", "לידים מוסמכים", stats.qualified)}
        ${row("👁️", "צפיות / ביקורים", stats.viewings)}
        ${row("🗂️", "קמפיינים פעילים", stats.activeCampaigns)}
        ${stats.priceUpdates > 0 ? row("📣", "עדכון מחיר נשלח למתעניינים", stats.priceUpdates) : ""}
      </table>
      <p style="margin:16px 0 0;color:#334155;font-size:14px">${active ? "נמשיך לפעול כדי להביא את הקונים הנכונים." : "השבוע היה שקט יחסית — אנחנו כבר עובדים על הגברת החשיפה בשבוע הקרוב."}</p>
      ${nextStep ? `<p style="margin:10px 0 0;color:#334155;font-size:14px"><strong>הצעד הבא שלנו:</strong> ${nextStep}</p>` : ""}
      ${reportUrl ? `<a href="${reportUrl}" style="display:inline-block;margin-top:16px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:12px;padding:12px 22px;font-size:15px;font-weight:800">צפייה בדוח המלא</a>` : ""}
      <p style="margin:18px 0 0;color:#0f172a;font-size:14px;font-weight:700">בברכה, ${officeName}</p>
    </div>
  </div>
  ${unsubscribeUrl ? `<p style="text-align:center;margin:14px 0 0;color:#94a3b8;font-size:12px"><a href="${unsubscribeUrl}" style="color:#94a3b8">להפסקת קבלת הדוחות</a></p>` : ""}
</div></body></html>`;
  return { subject, text, html };
}

export interface SellerReportResult { org: string; considered: number; sent: number; skipped: number }

/** Send the weekly report for one org's actively-listed properties. Bounded. */
export async function runSellerWeeklyReports(orgId: string, opts?: { limit?: number }): Promise<SellerReportResult> {
  const db: any = createServiceRoleClient();
  const nowMs = Date.now();
  // Israel Sunday-anchored week window (DST-aware) — weekly metrics bound to this
  // week and the dedup bucket keyed to the Israel week (no UTC Sunday drift).
  const { sinceIso, weekBucket } = israelWeekWindow(nowMs);

  const { data: orgRow } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const officeName = (orgRow?.name as string) || "צוות ZONO";

  const { data: props } = await db.from("properties")
    .select("id,title,city,primary_image_url,price,status")
    .eq("org_id", orgId).in("status", ["active", "under_offer", "in_contract"]).limit(opts?.limit ?? 200);
  const properties = (props ?? []) as Array<{ id: string; title: string | null; city: string | null; primary_image_url: string | null; price: number | null; status: string }>;
  if (!properties.length) return { org: orgId, considered: 0, sent: 0, skipped: 0 };

  const propertyIds = properties.map((p) => p.id);
  const { data: links } = await db.from("property_sellers")
    .select("property_id,seller_id,is_primary,receives_reports")
    .in("property_id", propertyIds).eq("status", "active").eq("receives_reports", true)
    .order("is_primary", { ascending: false });
  const primarySeller = new Map<string, string>();
  for (const l of (links ?? []) as any[]) if (!primarySeller.has(l.property_id)) primarySeller.set(l.property_id, l.seller_id);

  const sellerIds = [...new Set([...primarySeller.values()])];
  const sellersById = new Map<string, { full_name: string | null; email: string | null }>();
  if (sellerIds.length) {
    const { data: sellers } = await db.from("sellers").select("id,full_name,email").in("id", sellerIds);
    for (const s of (sellers ?? []) as any[]) sellersById.set(s.id, { full_name: s.full_name, email: s.email });
  }

  let considered = 0, sent = 0, skipped = 0;
  for (const p of properties) {
    const sellerId = primarySeller.get(p.id);
    if (!sellerId) continue;
    const seller = sellersById.get(sellerId);
    if (!seller?.email) { skipped++; continue; }
    considered++;

    const stats = await weeklyStats(db, orgId, p.id, sinceIso, new Date(nowMs).toISOString());
    const uUrl = unsubUrl({ o: orgId, t: "seller", c: sellerId, ch: "email" });
    // Enrich with the deterministic lifecycle projection (status + next agent step)
    // and a secure full-report link. Best-effort — never blocks the weekly send.
    const life = await getSellerLifecycle(orgId, p.id, db).catch(() => null);
    const reportUrl = sellerReportUrl({ o: orgId, c: sellerId, p: p.id });
    const msg = renderReport({
      officeName, sellerName: seller.full_name ?? "", propertyTitle: p.title?.trim() || "הנכס שלך",
      city: p.city, photoUrl: p.primary_image_url, askingPrice: p.price, stats, unsubscribeUrl: uUrl,
      lifecycleLabel: life?.stateLabel ?? null,
      nextStep: life?.nextRecommendedAgentAction.label || null,
      reportUrl,
    });

    const res = await sendCustomerEmail({
      orgId, contact: { type: "seller", id: sellerId, name: seller.full_name, email: seller.email },
      purpose: "service_report", subscribed: true,   // property_sellers.receives_reports = true
      subject: msg.subject, text: msg.text, html: msg.html,
      dedupKey: `seller_weekly:${p.id}:${sellerId}:${weekBucket}`,
    }, db);

    if (res.sent) {
      sent++;
      // Best-effort: log the report as a seller touchpoint (feeds the trust score
      // + agent-visible timeline). Never breaks the send if the shape differs.
      try {
        // Real columns only (the table has no channel/note columns).
        await db.from("property_seller_touchpoints").insert({
          org_id: orgId, property_id: p.id, seller_id: sellerId,
          touchpoint_type: "דוח שבועי", title: msg.subject, description: "דוח שבועי נשלח במייל", direction: "outbound",
        });
      } catch { /* best-effort */ }
    } else { skipped++; }
  }
  return { org: orgId, considered, sent, skipped };
}

/** Weekly cron entry point — bounded across orgs. */
export async function runAllOrgsSellerWeeklyReports(opts?: { orgLimit?: number; perOrgLimit?: number }): Promise<{ orgs: number; sent: number; skipped: number; results: SellerReportResult[] }> {
  const db: any = createServiceRoleClient();
  const { data } = await db.from("organizations").select("id").limit(opts?.orgLimit ?? 100);
  const orgIds = ((data ?? []) as any[]).map((o) => o.id).filter(Boolean);
  const results: SellerReportResult[] = [];
  let sent = 0, skipped = 0;
  for (const id of orgIds) {
    const r = await runSellerWeeklyReports(id, { limit: opts?.perOrgLimit ?? 200 });
    results.push(r); sent += r.sent; skipped += r.skipped;
  }
  return { orgs: orgIds.length, sent, skipped, results };
}
