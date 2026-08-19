/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
// ============================================================================
// ZONO — Seller-facing PROPERTY REPORT (public, token-validated). Scoped by the
// signed token to a single org+seller+property. Shows ONLY that property's
// aggregate status: lifecycle state, marketing status, interest COUNTS, viewing
// COUNTS, current price. It NEVER exposes buyers, buyer identities, CRM notes,
// other properties, internal tasks or agent private notes. No client JS.
// ============================================================================
import { verifySellerReportToken } from "@/lib/customer-comm/seller-report-tokens";
import { getSellerLifecycle } from "@/lib/sellers/lifecycle";
import { formatIls } from "@/lib/customer-comm/price-change-policy";
import { unsubUrl } from "@/lib/customer-comm/unsubscribe";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "24px 16px" }}>{children}</div>
    </div>
  );
}
function Invalid() {
  return <Shell><div style={{ background: "#fff", borderRadius: 20, padding: 32, textAlign: "center" }}><div style={{ fontSize: 40 }}>⚠️</div><h1 style={{ color: "#0f172a", fontSize: 20 }}>קישור לא תקין</h1><p style={{ color: "#475569" }}>הקישור אינו תקין או שפג תוקפו. אפשר לפנות למשרד.</p></div></Shell>;
}

export default async function SellerReportView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = verifySellerReportToken(token);
  if (!p) return <Invalid />;

  const db: any = createServiceRoleClient();
  const { data: prop } = await db.from("properties").select("id,title,city,price,primary_image_url").eq("id", p.p).eq("org_id", p.o).maybeSingle();
  if (!prop) return <Invalid />;
  // Confirm the seller is actually linked to this property (defense in depth).
  const { data: link } = await db.from("property_sellers").select("id").eq("org_id", p.o).eq("property_id", p.p).eq("seller_id", p.c).maybeSingle();
  if (!link) return <Invalid />;

  const life = await getSellerLifecycle(p.o, p.p, db);
  const { data: orgRow } = await db.from("organizations").select("name").eq("id", p.o).maybeSingle();
  const officeName = (orgRow?.name as string) || "ZONO";
  const m = life?.metrics;

  const stat = (label: string, value: string | number) => (
    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", flex: "1 1 120px", minWidth: 120 }}>
      <div style={{ color: "#0f172a", fontSize: 20, fontWeight: 900 }}>{value}</div>
      <div style={{ color: "#64748b", fontSize: 12 }}>{label}</div>
    </div>
  );

  return (
    <Shell>
      <p style={{ margin: "0 0 4px", color: "#6d28d9", fontSize: 12, fontWeight: 800 }}>{officeName}</p>
      <h1 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: 22, fontWeight: 900 }}>הדוח על הנכס שלך</h1>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, overflow: "hidden" }}>
        {prop.primary_image_url && <img src={prop.primary_image_url} alt="" style={{ width: "100%", height: 210, objectFit: "cover", display: "block" }} />}
        <div style={{ padding: 22 }}>
          <h2 style={{ margin: "0 0 2px", color: "#0f172a", fontSize: 19, fontWeight: 900 }}>{prop.title || "הנכס שלך"}</h2>
          <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 14 }}>{[prop.city, formatIls(prop.price) ? `מחיר מבוקש ${formatIls(prop.price)}` : ""].filter(Boolean).join(" · ")}</p>
          {life && <div style={{ display: "inline-block", background: "#ede9fe", color: "#6d28d9", borderRadius: 999, padding: "6px 14px", fontSize: 14, fontWeight: 800, marginBottom: 16 }}>{life.stateLabel}</div>}

          {m && (
            <>
              <p style={{ margin: "0 0 8px", color: "#0f172a", fontSize: 14, fontWeight: 800 }}>שיווק</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                {stat("פרסומים", m.publications)}
                {stat("קמפיין פעיל", m.activeCampaign ? "כן" : "לא")}
                {stat("עדכוני מחיר שנשלחו", m.priceUpdatesSent)}
              </div>
              <p style={{ margin: "0 0 8px", color: "#0f172a", fontSize: 14, fontWeight: 800 }}>התעניינות וביקורים</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                {stat("מתעניינים", m.interested)}
                {stat("ביקורים שנקבעו", m.viewingsScheduled)}
                {stat("ביקורים שהתקיימו", m.viewingsCompleted)}
              </div>
            </>
          )}
          {life && life.attentionReasons.length > 0 && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "10px 14px", marginTop: 12 }}>
              <p style={{ margin: 0, color: "#92400e", fontSize: 13, fontWeight: 700 }}>{life.attentionReasons[0]}</p>
            </div>
          )}
          <p style={{ margin: "18px 0 0", color: "#94a3b8", fontSize: 12 }}>הנתונים מתעדכנים אוטומטית. לפרטים נוספים פנו לסוכן/ת שלכם.</p>
        </div>
      </div>
      {(() => { const u = unsubUrl({ o: p.o, t: "seller", c: p.c, ch: "all" }); return u ? <p style={{ textAlign: "center", margin: "12px 0 0", color: "#cbd5e1", fontSize: 12 }}><a href={u} style={{ color: "#cbd5e1" }}>להפסקת קבלת עדכונים</a></p> : null; })()}
    </Shell>
  );
}
