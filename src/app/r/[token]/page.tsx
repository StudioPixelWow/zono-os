/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
// ============================================================================
// ZONO — Customer-facing MATCH BUNDLE view (public, token-validated). Shows only
// the properties recommended in one bundle (scoped by the signed token to a single
// org+contact+bundle — no CRM/admin UI, no seller identity, no other buyers). The
// customer can mark each property מעניין / לא מתאים / רוצה ביקור, which feeds real
// CRM state via the feedback route. No client JS — plain form posts.
// ============================================================================
import { verifyRecoToken } from "@/lib/customer-comm/recommend-tokens";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ils = (n: number | null) => (n == null ? "" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : `₪${Math.round(n).toLocaleString("he-IL")}`);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "24px 16px" }}>{children}</div>
    </div>
  );
}

export default async function RecommendationView(
  { params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> },
) {
  const { token } = await params;
  const { done } = await searchParams;
  const p = verifyRecoToken(token);
  if (!p) return <Shell><div style={{ background: "#fff", borderRadius: 20, padding: 32, textAlign: "center" }}><div style={{ fontSize: 40 }}>⚠️</div><h1 style={{ color: "#0f172a", fontSize: 20 }}>קישור לא תקין</h1><p style={{ color: "#475569" }}>הקישור אינו תקין או שפג תוקפו. אפשר לפנות למשרד.</p></div></Shell>;

  const db: any = createServiceRoleClient();
  const { data: recs } = await db.from("customer_property_recommendations")
    .select("property_id,status,match_score")
    .eq("org_id", p.o).eq("contact_type", p.t).eq("contact_id", p.c).eq("bundle_id", p.b);
  const recRows = (recs ?? []) as Array<{ property_id: string; status: string; match_score: number | null }>;
  if (!recRows.length) return <Shell><div style={{ background: "#fff", borderRadius: 20, padding: 32, textAlign: "center" }}><h1 style={{ color: "#0f172a", fontSize: 20 }}>אין המלצות להצגה</h1></div></Shell>;

  // best-effort: mark the still-"recommended" rows as viewed (agent visibility)
  try { await db.from("customer_property_recommendations").update({ status: "viewed", responded_at: new Date().toISOString() }).eq("org_id", p.o).eq("bundle_id", p.b).eq("status", "recommended"); } catch { /* ignore */ }

  const ids = recRows.map((r) => r.property_id);
  const { data: props } = await db.from("properties").select("id,title,city,price,rooms,primary_image_url,status").in("id", ids).eq("org_id", p.o);
  const propById = new Map(((props ?? []) as any[]).map((x) => [x.id, x]));
  const { data: orgRow } = await db.from("organizations").select("name").eq("id", p.o).maybeSingle();
  const officeName = (orgRow?.name as string) || "ZONO";

  const doneMsg = done === "interested" ? "סימנת שהנכס מעניין אותך — ניצור קשר בקרוב 🙂"
    : done === "rejected" ? "תודה, לא נציג לך את הנכס הזה שוב."
    : done === "viewing_requested" ? "בקשת הביקור נשלחה — נחזור אליך לתיאום 🗝️" : null;

  return (
    <Shell>
      <p style={{ margin: "0 0 4px", color: "#6d28d9", fontSize: 12, fontWeight: 800 }}>{officeName}</p>
      <h1 style={{ margin: "0 0 14px", color: "#0f172a", fontSize: 22, fontWeight: 900 }}>הנכסים שמצאנו עבורך</h1>
      {doneMsg && <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 12, padding: "10px 14px", fontSize: 14, marginBottom: 14 }}>{doneMsg}</div>}
      {recRows.map((r) => {
        const pr = propById.get(r.property_id);
        if (!pr) return null;
        const unavailable = pr.status !== "active";
        return (
          <div key={r.property_id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", marginBottom: 14, opacity: unavailable ? 0.6 : 1 }}>
            {pr.primary_image_url && <img src={pr.primary_image_url} alt="" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />}
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <h3 style={{ margin: 0, color: "#0f172a", fontSize: 17, fontWeight: 800 }}>{pr.title || "נכס"}</h3>
                {r.match_score != null && <span style={{ background: "#ede9fe", color: "#6d28d9", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>התאמה {r.match_score}%</span>}
              </div>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{[pr.city, pr.rooms ? `${pr.rooms} חד'` : "", ils(pr.price)].filter(Boolean).join(" · ")}</p>
              {unavailable ? (
                <p style={{ margin: "12px 0 0", color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>הנכס אינו זמין יותר</p>
              ) : (
                <form method="POST" action={`/api/r/${token}/feedback`} style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <input type="hidden" name="propertyId" value={r.property_id} />
                  <button name="action" value="interested" style={{ background: "#6d28d9", color: "#fff", border: 0, borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>מעניין אותי</button>
                  <button name="action" value="viewing_requested" style={{ background: "#0d9488", color: "#fff", border: 0, borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>רוצה ביקור</button>
                  <button name="action" value="rejected" style={{ background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>לא מתאים</button>
                </form>
              )}
            </div>
          </div>
        );
      })}
      <p style={{ textAlign: "center", margin: "10px 0 0", color: "#94a3b8", fontSize: 12 }}>ההמלצות מותאמות עבורך על ידי {officeName}</p>
    </Shell>
  );
}
