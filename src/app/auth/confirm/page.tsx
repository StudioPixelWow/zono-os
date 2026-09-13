// ============================================================================
// ZONO — set-password interstitial. The welcome email links HERE (not straight
// to token verification), so email link-scanners / prefetchers that fetch the
// link never consume the single-use recovery token. Verification happens only
// when the real person clicks "המשך" → /auth/confirm/complete (verifyOtp) →
// /reset-password. Branded, RTL, self-contained.
// ============================================================================
import Link from "next/link";
import { ZonoLogo } from "@/components/brand/ZonoLogo";

export const dynamic = "force-dynamic";

export default async function ConfirmInterstitial({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tokenHash = one(sp.token_hash);
  const type = one(sp.type) || "recovery";
  const next = one(sp.next) || "/reset-password";
  const valid = !!tokenHash;
  const completeHref =
    `/auth/confirm/complete?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&next=${encodeURIComponent(next)}`;

  return (
    <div dir="rtl" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20, background: "#efeafb", fontFamily: "Arial,'Segoe UI',Helvetica,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 28, overflow: "hidden", boxShadow: "0 24px 60px -26px rgba(76,29,149,.5)" }}>
        <div style={{ background: "linear-gradient(140deg,#140f2b 0%,#2a1a5e 52%,#5b21b6 100%)", padding: "30px 28px 26px", textAlign: "center" }}>
          <div style={{ color: "#fff", fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>ZONO</div>
          <div style={{ color: "#c4b5fd", fontSize: 12.5, marginTop: 8 }}>מערכת ההפעלה החכמה לנדל״ן</div>
        </div>
        <div style={{ padding: "30px 28px 30px", textAlign: "center" }}>
          {valid ? (
            <>
              <h1 style={{ fontSize: 23, fontWeight: 800, color: "#160f2e", margin: 0 }}>כמעט בפנים 🎉</h1>
              <p style={{ fontSize: 15.5, lineHeight: 1.7, color: "#4b4363", marginTop: 12 }}>
                לחיצה אחת ואתה קובע סיסמה ונכנס למערכת — הזון שלך כבר מחכה.
              </p>
              <Link
                href={completeHref}
                prefetch={false}
                style={{ display: "inline-block", marginTop: 22, padding: "15px 40px", borderRadius: 999, color: "#fff", fontSize: 16.5, fontWeight: 800, textDecoration: "none", background: "linear-gradient(90deg,#6d28d9,#a855f7)", boxShadow: "0 14px 32px -10px rgba(124,58,237,.6)" }}
              >
                המשך לקביעת סיסמה ←
              </Link>
              <p style={{ fontSize: 12, color: "#a49dba", marginTop: 18, lineHeight: 1.6 }}>
                הקישור הזה חד-פעמי ותקף לזמן מוגבל. אם הכפתור לא עובד, בקש/י קישור חדש ממסך ההתחברות.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#160f2e", margin: 0 }}>הקישור אינו תקין</h1>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "#4b4363", marginTop: 12 }}>
                נראה שהקישור חסר או פג תוקף. אפשר לבקש קישור חדש לקביעת הסיסמה.
              </p>
              <Link
                href="/forgot-password"
                style={{ display: "inline-block", marginTop: 20, padding: "14px 34px", borderRadius: 999, color: "#fff", fontSize: 15.5, fontWeight: 800, textDecoration: "none", background: "linear-gradient(90deg,#6d28d9,#a855f7)" }}
              >
                בקשת קישור חדש
              </Link>
            </>
          )}
          <div style={{ marginTop: 22 }}>
            <span style={{ display: "inline-block", opacity: 0.85 }}><ZonoLogo width={120} height={40} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}
