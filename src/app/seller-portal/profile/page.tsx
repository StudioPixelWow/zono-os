// ============================================================================
// 🏷️ ZONO — Seller Portal — PROFILE. 32.4. Property details, selling goals,
// timeline, price expectations, communication preferences. Editable public info.
// ============================================================================
import { getSellerProfile } from "@/lib/seller-portal";
import { PortalNav, Glass, AuthGate } from "@/components/seller-portal/ui";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const CHANNEL_HE: Record<string, string> = { whatsapp: "וואטסאפ", email: "אימייל", phone: "טלפון", sms: "SMS" };

function Field({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-0.5 text-[14px] font-bold text-slate-800">{value}</div></div>;
}

export default async function ProfilePage() {
  const r = await getSellerProfile();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const p = r.data;

  return (
    <>
      <PortalNav active="/seller-portal/profile" />
      <h1 className="text-2xl font-black text-slate-900">הפרופיל שלי</h1>
      <p className="mt-1 text-[13px] text-slate-600">פרטי המכירה שלכם. לעדכון — פנו לברוקר או ערכו כאן.</p>

      <Glass className="mt-6 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="שם" value={p.name} />
          <Field label="עיר" value={p.city ?? "—"} />
          <Field label="כתובת הנכס" value={p.address ?? "—"} />
          <Field label="מחיר מבוקש" value={fmt(p.expectedPrice)} />
          <Field label="מחיר רצוי" value={fmt(p.desiredPrice)} />
          <Field label="תאריך יעד למכירה" value={p.targetSaleDate ?? "—"} />
          <Field label="דחיפות" value={p.urgency ?? "—"} />
          <Field label="מוטיבציה למכירה" value={p.motivation ?? "—"} />
          <Field label="סוג מוכר" value={p.sellerType ?? "—"} />
          <Field label="ערוץ תקשורת מועדף" value={p.preferredChannel ? (CHANNEL_HE[p.preferredChannel] ?? p.preferredChannel) : "—"} />
        </div>
      </Glass>

      <p className="mt-4 text-[12px] text-slate-400">הנתונים משמשים לשיפור אסטרטגיית המכירה עבורכם ואינם נחשפים לגורמים חיצוניים.</p>
    </>
  );
}
