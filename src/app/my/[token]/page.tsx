/* eslint-disable @next/next/no-img-element */
// ============================================================================
// ZONO — Buyer/renter PORTAL "הנכסים שלי" (public, token-validated). ONE persistent
// premium consumer experience: the properties we found for the customer, their
// own price updates, availability, viewings, requirements and a way to reach their
// agent. Mobile-first (most opens come from WhatsApp), RTL, office-branded. No
// client JS — plain form posts. Only customer-safe data (getBuyerPortalData); it
// NEVER shows sellers, other buyers, CRM notes, scores or deal-admin state.
// ============================================================================
import { getBuyerPortalData } from "@/lib/customer-portal/buyer-portal";
import type { PortalCard, PortalFilter } from "@/lib/customer-portal/buyer-portal-core";
import { filterCards, sortCards } from "@/lib/customer-portal/buyer-portal-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INITIAL = 12;
const ils = (n: number | null) => (n == null ? "" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : `₪${Math.round(n).toLocaleString("he-IL")}`);
const dtime = (iso: string | null) => { if (!iso) return ""; try { return new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }); } catch { return ""; } };
const dday = (iso: string | null) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: "Asia/Jerusalem" }); } catch { return ""; } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 14px 48px" }}>{children}</div>
    </div>
  );
}
function Invalid() {
  return <Shell><div style={{ background: "#fff", borderRadius: 20, padding: 32, textAlign: "center", marginTop: 40 }}><div style={{ fontSize: 40 }}>🔑</div><h1 style={{ color: "#0f172a", fontSize: 20 }}>הקישור אינו פעיל</h1><p style={{ color: "#475569" }}>ייתכן שהקישור פג או עודכן. אפשר לפנות לסוכן/ת שלכם לקבלת קישור מעודכן.</p></div></Shell>;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  new: { bg: "#ede9fe", fg: "#6d28d9" }, interested: { bg: "#dcfce7", fg: "#166534" },
  viewing_requested: { bg: "#cffafe", fg: "#0e7490" }, viewing_scheduled: { bg: "#dbeafe", fg: "#1d4ed8" },
  viewed: { bg: "#e0e7ff", fg: "#3730a3" }, rejected: { bg: "#f1f5f9", fg: "#64748b" }, unavailable: { bg: "#fee2e2", fg: "#b91c1c" },
};
function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return <span style={{ background: bg, color: fg, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{text}</span>;
}

function Card({ token, c }: { token: string; c: PortalCard }) {
  const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.new;
  const btn = (bg: string, fg: string, border: string) => ({ background: bg, color: fg, border, borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" });
  return (
    <div id={`prop-${c.propertyId}`} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, overflow: "hidden", marginBottom: 14, opacity: c.available ? 1 : 0.72 }}>
      <div style={{ position: "relative" }}>
        {c.imageUrl ? <img src={c.imageUrl} alt="" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} /> : <div style={{ height: 200, background: "#e2e8f0", display: "grid", placeItems: "center", fontSize: 34 }}>🏠</div>}
        <div style={{ position: "absolute", top: 10, insetInlineStart: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge text={c.statusLabel} bg={st.bg} fg={st.fg} />
          {c.priceDrop && c.available && <Badge text={c.priceDrop.label} bg="#dcfce7" fg="#166534" />}
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: 0, color: "#0f172a", fontSize: 18, fontWeight: 800 }}>{c.title}</h3>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{[c.city, c.rooms ? `${c.rooms} חד'` : "", ils(c.price)].filter(Boolean).join(" · ")}</p>
        {c.viewingAt && (c.status === "viewing_scheduled") && <p style={{ margin: "8px 0 0", color: "#1d4ed8", fontSize: 13, fontWeight: 700 }}>🗓️ ביקור: {dtime(c.viewingAt)}</p>}

        {!c.available ? (
          <p style={{ margin: "12px 0 0", color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>הנכס אינו זמין יותר</p>
        ) : c.feedbackGiven ? (
          <p style={{ margin: "12px 0 0", color: "#166534", fontSize: 13, fontWeight: 700 }}>סימנת: {c.statusLabel} ✓</p>
        ) : (
          <form method="POST" action={`/api/my/${token}/feedback`} style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <input type="hidden" name="propertyId" value={c.propertyId} />
            <button name="action" value="interested" style={btn("#6d28d9", "#fff", "0")}>מעניין אותי</button>
            <button name="action" value="viewing_requested" style={btn("#0d9488", "#fff", "0")}>רוצה ביקור</button>
            <button name="action" value="talk_to_agent" style={btn("#fff", "#6d28d9", "1px solid #ddd6fe")}>לדבר עם הסוכן</button>
            <button name="action" value="rejected" style={btn("#fff", "#475569", "1px solid #cbd5e1")}>לא מתאים</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function BuyerPortal(
  { params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ f?: string; all?: string; done?: string }> },
) {
  const { token } = await params;
  const { f, all, done } = await searchParams;
  const data = await getBuyerPortalData(token);
  if (!data) return <Invalid />;

  const filter = (["all", "new", "interested", "viewings", "rejected"].includes(f ?? "") ? f : "all") as PortalFilter;
  const allCards = sortCards(data.cards);
  const filtered = filterCards(allCards, filter);
  const showAll = all === "1";
  const visible = showAll ? filtered : filtered.slice(0, INITIAL);
  const wa = data.agent.whatsapp ? `https://wa.me/${data.agent.whatsapp}` : data.agent.phone ? `tel:${data.agent.phone}` : null;

  const doneMsg = done === "interested" ? "סימנת שהנכס מעניין אותך — ניצור קשר 🙂"
    : done === "viewing_requested" ? "בקשת הביקור נשלחה — נחזור אליך לתיאום 🗝️"
    : done === "talk_to_agent" ? "קיבלנו — הסוכן/ת ייצור/תיצור איתך קשר 📞"
    : done === "rejected" ? "תודה, לא נציג לך את הנכס הזה שוב."
    : done === "prefs" ? "בקשת עדכון ההעדפות נשלחה לסוכן/ת 🙌" : null;

  const filterTab = (key: PortalFilter, label: string) => {
    const active = filter === key;
    return <a href={`?f=${key}`} style={{ padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", background: active ? "#0f172a" : "#fff", color: active ? "#fff" : "#475569", border: "1px solid #e2e8f0" }}>{label}</a>;
  };
  const sumChip = (n: number, label: string) => <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "10px 8px", textAlign: "center", flex: "1 1 0" }}><div style={{ color: "#0f172a", fontSize: 20, fontWeight: 900 }}>{n}</div><div style={{ color: "#64748b", fontSize: 12 }}>{label}</div></div>;

  return (
    <Shell>
      {/* Brand + greeting */}
      <p style={{ margin: "0 0 2px", color: "#6d28d9", fontSize: 13, fontWeight: 800 }}>{data.officeName}</p>
      <h1 style={{ margin: "0 0 4px", color: "#0f172a", fontSize: 26, fontWeight: 900 }}>הנכסים שלך{data.firstName ? `, ${data.firstName}` : ""}</h1>
      <p style={{ margin: "0 0 16px", color: "#475569", fontSize: 15 }}>כל הנכסים שמצאנו עבורך, הביקורים והעדכונים במקום אחד.</p>

      {doneMsg && <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 12, padding: "11px 15px", fontSize: 14, marginBottom: 14 }}>{doneMsg}</div>}

      {/* Summary */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {sumChip(data.summary.newCount, "חדשים")}
        {sumChip(data.summary.interested, "מעניינים")}
        {sumChip(data.summary.viewings, "ביקורים")}
        {sumChip(data.summary.priceDrops, "עדכוני מחיר")}
      </div>

      {/* Next step */}
      {data.nextStep && (
        <div style={{ background: "#0f172a", color: "#fff", borderRadius: 16, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>👉</span><span style={{ fontSize: 15, fontWeight: 700 }}>{data.nextStep}</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
        {filterTab("all", "הכול")}{filterTab("new", "חדשים")}{filterTab("interested", "מעניינים")}{filterTab("viewings", "ביקורים")}{filterTab("rejected", "לא מתאים")}
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 28, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 36 }}>🔎</div>
          <h2 style={{ color: "#0f172a", fontSize: 18, margin: "8px 0 4px" }}>החיפוש ממשיך</h2>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>עדיין לא סימנו נכסים בקטגוריה הזו. נעדכן אותך ברגע שנמצא התאמות.</p>
        </div>
      ) : (
        <>
          {visible.map((c) => <Card key={c.propertyId} token={token} c={c} />)}
          {!showAll && filtered.length > INITIAL && (
            <a href={`?f=${filter}&all=1`} style={{ display: "block", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px", color: "#6d28d9", fontWeight: 700, textDecoration: "none", marginBottom: 16 }}>הצג עוד {filtered.length - INITIAL} נכסים</a>
          )}
        </>
      )}

      {/* Viewings */}
      {(data.viewings.upcoming.length > 0 || data.viewings.completed.length > 0) && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, marginBottom: 16 }}>
          <h2 style={{ color: "#0f172a", fontSize: 17, fontWeight: 800, margin: "0 0 12px" }}>הביקורים שלי</h2>
          {data.viewings.upcoming.map((v) => (
            <div key={`u-${v.propertyId}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#0f172a", fontSize: 14, fontWeight: 600 }}>{v.propertyTitle}</span>
              <span style={{ color: "#1d4ed8", fontSize: 13, fontWeight: 700 }}>{dtime(v.at)}</span>
            </div>
          ))}
          {data.viewings.completed.map((v) => (
            <div key={`c-${v.propertyId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#0f172a", fontSize: 14 }}>{v.propertyTitle} · ביקרת {dday(v.at)}</span>
              {v.feedbackPending ? <a href={`#prop-${v.propertyId}`} style={{ color: "#6d28d9", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>ספרו לנו איך היה</a> : null}
            </div>
          ))}
        </div>
      )}

      {/* Requirements */}
      {data.requirements.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, marginBottom: 16 }}>
          <h2 style={{ color: "#0f172a", fontSize: 17, fontWeight: 800, margin: "0 0 12px" }}>מה אנחנו מחפשים עבורך</h2>
          {data.requirements.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0" }}>
              <span style={{ color: "#64748b", fontSize: 13 }}>{r.label}</span><span style={{ color: "#0f172a", fontSize: 14, fontWeight: 700 }}>{r.value}</span>
            </div>
          ))}
          <details style={{ marginTop: 10 }}>
            <summary style={{ color: "#6d28d9", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>עדכון העדפות</summary>
            <form method="POST" action={`/api/my/${token}/preferences`} style={{ marginTop: 10 }}>
              <textarea name="note" rows={3} placeholder="מה תרצו לשנות? (אזור, תקציב, חדרים, מאפיינים...)" style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, fontSize: 14, fontFamily: "inherit" }} />
              <button type="submit" style={{ marginTop: 8, background: "#0f172a", color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>שליחה לסוכן</button>
            </form>
          </details>
        </div>
      )}

      {/* Agent */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
        {data.agent.avatarUrl ? <img src={data.agent.avatarUrl} alt="" style={{ width: 52, height: 52, borderRadius: 999, objectFit: "cover" }} /> : <div style={{ width: 52, height: 52, borderRadius: 999, background: "#ede9fe", display: "grid", placeItems: "center", color: "#6d28d9", fontSize: 20, fontWeight: 900 }}>{(data.agent.name ?? "ס").slice(0, 1)}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: "#0f172a", fontSize: 15, fontWeight: 800 }}>{data.agent.name ?? "הסוכן שלך"}</p>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>{data.officeName}</p>
        </div>
        {wa && <a href={wa} style={{ background: "#25d366", color: "#fff", borderRadius: 12, padding: "10px 16px", fontSize: 14, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" }}>דברו עם הסוכן</a>}
      </div>

      {/* Comm preferences */}
      {data.commPreferencesUrl && <p style={{ textAlign: "center", margin: "8px 0 0", color: "#94a3b8", fontSize: 12 }}><a href={data.commPreferencesUrl} style={{ color: "#94a3b8" }}>העדפות תקשורת</a></p>}
      <p style={{ textAlign: "center", margin: "6px 0 0", color: "#cbd5e1", fontSize: 11 }}>מופעל על ידי ZONO</p>
    </Shell>
  );
}
