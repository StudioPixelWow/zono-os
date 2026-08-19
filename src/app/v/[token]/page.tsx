/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Customer-facing VIEWING page (public, token-validated). One secure page
// for the whole viewing loop: a CONFIRM token shows the viewing details with
// "מאשר/ת הגעה" + "צריך לשנות מועד"; a FEEDBACK token shows the four post-viewing
// choices מעניין / רוצה להתקדם / לא מתאים / לדבר עם הסוכן. Scoped by the signed
// token to a single org+meeting — no CRM/admin UI, no other viewings. No client
// JS — plain form posts. The token's `kind` binds the page to its purpose.
// ============================================================================
import { verifyViewingToken } from "@/lib/viewings/tokens";
import { heViewingTime } from "@/lib/viewings/lifecycle";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, padding: 28 }}>{children}</div>;
}

function Invalid() {
  return <Shell><Card><div style={{ fontSize: 40, textAlign: "center" }}>⚠️</div><h1 style={{ color: "#0f172a", fontSize: 20, textAlign: "center" }}>קישור לא תקין</h1><p style={{ color: "#475569", textAlign: "center" }}>הקישור אינו תקין או שפג תוקפו. אפשר לפנות למשרד.</p></Card></Shell>;
}

export default async function ViewingPage(
  { params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> },
) {
  const { token } = await params;
  const { done } = await searchParams;
  const p = verifyViewingToken(token);
  if (!p) return <Invalid />;

  const db: any = createServiceRoleClient();
  const { data: m } = await db.from("meetings")
    .select("id,org_id,title,type,status,start_at,buyer_id,lead_id,property_id")
    .eq("id", p.m).eq("org_id", p.o).maybeSingle();
  if (!m || (m.type !== "viewing" && m.type !== "open_house")) return <Invalid />;

  const { data: orgRow } = await db.from("organizations").select("name").eq("id", p.o).maybeSingle();
  const officeName = (orgRow?.name as string) || "ZONO";
  const propTitle = m.property_id ? ((await db.from("properties").select("title").eq("id", m.property_id).maybeSingle()).data?.title as string | null) ?? null : null;
  const when = heViewingTime(m.start_at);
  const status = String(m.status);

  const doneMsg = done === "confirmed" ? "תודה! אישרת את ההגעה לביקור ✓ — נתראה."
    : done === "reschedule" ? "קיבלנו — ניצור איתך קשר לתיאום מועד חדש 🗓️"
    : done === "interested" ? "מעולה! סימנת שהנכס מעניין אותך — ניצור קשר בקרוב 🙂"
    : done === "advance" ? "מצוין! נחזור אליך כדי להתקדם 🤝"
    : done === "not_suitable" ? "תודה על המשוב — נתאים לך נכסים אחרים."
    : done === "talk_to_agent" ? "קיבלנו — הסוכן/ת ייצור/תיצור איתך קשר בהקדם 📞" : null;

  const banner = doneMsg ? <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 12, padding: "12px 16px", fontSize: 15, marginBottom: 16, textAlign: "center" }}>{doneMsg}</div> : null;

  const detail = (
    <div style={{ background: "#f8fafc", borderRadius: 14, padding: 16, margin: "14px 0" }}>
      {propTitle && <p style={{ margin: "0 0 6px", color: "#0f172a", fontSize: 16, fontWeight: 800 }}>{propTitle}</p>}
      {when && <p style={{ margin: 0, color: "#6d28d9", fontSize: 15, fontWeight: 700 }}>🗓️ {when}</p>}
    </div>
  );

  const btn = (bg: string, fg: string, border: string) => ({ background: bg, color: fg, border, borderRadius: 12, padding: "12px 18px", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%" as const });

  // ── CONFIRM token ───────────────────────────────────────────────────────────
  if (p.k === "confirm") {
    const closed = status === "cancelled" ? "הביקור בוטל." : (status === "completed" || status === "no_show") ? "הביקור כבר התקיים." : null;
    return (
      <Shell>
        <p style={{ margin: "0 0 4px", color: "#6d28d9", fontSize: 12, fontWeight: 800 }}>{officeName}</p>
        <h1 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: 22, fontWeight: 900 }}>אישור הגעה לביקור</h1>
        {banner}
        <Card>
          {detail}
          {closed ? (
            <p style={{ margin: 0, color: "#b91c1c", fontSize: 15, fontWeight: 700, textAlign: "center" }}>{closed}</p>
          ) : status === "confirmed" && !done ? (
            <>
              <p style={{ margin: "0 0 14px", color: "#166534", fontSize: 15, fontWeight: 700, textAlign: "center" }}>אישרת כבר את ההגעה ✓</p>
              <form method="POST" action={`/api/v/${token}/confirm`}>
                <button name="action" value="reschedule" style={btn("#fff", "#475569", "1px solid #cbd5e1")}>צריך לשנות מועד</button>
              </form>
            </>
          ) : (
            <form method="POST" action={`/api/v/${token}/confirm`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button name="action" value="confirm" style={btn("#0d9488", "#fff", "0")}>מאשר/ת הגעה</button>
              <button name="action" value="reschedule" style={btn("#fff", "#475569", "1px solid #cbd5e1")}>צריך לשנות מועד</button>
            </form>
          )}
        </Card>
        <p style={{ textAlign: "center", margin: "12px 0 0", color: "#94a3b8", fontSize: 12 }}>הביקור מתואם עבורך על ידי {officeName}</p>
      </Shell>
    );
  }

  // ── FEEDBACK token ──────────────────────────────────────────────────────────
  return (
    <Shell>
      <p style={{ margin: "0 0 4px", color: "#6d28d9", fontSize: 12, fontWeight: 800 }}>{officeName}</p>
      <h1 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: 22, fontWeight: 900 }}>איך היה הביקור?</h1>
      {banner}
      <Card>
        {detail}
        <p style={{ margin: "0 0 14px", color: "#475569", fontSize: 15 }}>המשוב שלך עוזר לנו להתאים לך את הנכסים הבאים:</p>
        <form method="POST" action={`/api/v/${token}/feedback`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button name="action" value="interested" style={btn("#6d28d9", "#fff", "0")}>מעניין אותי</button>
          <button name="action" value="advance" style={btn("#0d9488", "#fff", "0")}>רוצה להתקדם</button>
          <button name="action" value="not_suitable" style={btn("#fff", "#475569", "1px solid #cbd5e1")}>לא מתאים</button>
          <button name="action" value="talk_to_agent" style={btn("#fff", "#6d28d9", "1px solid #ddd6fe")}>לדבר עם הסוכן</button>
        </form>
      </Card>
      <p style={{ textAlign: "center", margin: "12px 0 0", color: "#94a3b8", fontSize: 12 }}>{officeName}</p>
    </Shell>
  );
}
