// ============================================================================
// ZONO — Public remote-signing page (no session, no app shell). Renders the exact
// document for the recipient to review + sign. Enforces expiry / revocation /
// completion server-side and records a single OPEN. Hebrew-first, RTL, mobile-first.
// ============================================================================
import { resolveSigningRequest, markSigningOpened } from "@/lib/e-signature/service";
import { SignExperience } from "./SignExperience";

export const dynamic = "force-dynamic";

function StateScreen({ title, sub }: { title: string; sub?: string }) {
  return (
    <div dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f5fb", fontFamily: "Arial, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid #ece9f6", borderRadius: 18, padding: "32px 28px" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h1>
        {sub && <p style={{ color: "#6b7280", fontSize: 14, marginTop: 8 }}>{sub}</p>}
      </div>
    </div>
  );
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await resolveSigningRequest(token);

  if (!res.ok) {
    if (res.reason === "expired") return <StateScreen title="הקישור לחתימה פג תוקף" sub="פנה/י לסוכן/ת לקבלת קישור חדש." />;
    if (res.reason === "revoked") return <StateScreen title="בקשת החתימה בוטלה" sub="הקישור אינו פעיל יותר." />;
    if (res.reason === "completed") return <StateScreen title="המסמך כבר נחתם" sub="תודה — לא נדרשת פעולה נוספת." />;
    return <StateScreen title="הקישור אינו תקין" sub="בדוק/י שהעתקת את הקישור המלא מההודעה." />;
  }

  // Record a single meaningful OPEN (idempotent).
  await markSigningOpened(res.data.requestId);

  return <SignExperience token={token} data={res.data} />;
}
