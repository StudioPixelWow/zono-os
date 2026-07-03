// ============================================================================
// 🛒 ZONO — Buyer Portal — PROFILE. 32.3. Budget, areas, types, timeline,
// languages, communication + investment goals. Editable preferences.
// ============================================================================
import { getBuyerProfile } from "@/lib/buyer-portal";
import { PortalNav, Glass, AuthGate } from "@/components/buyer-portal/ui";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const CHANNEL_HE: Record<string, string> = { whatsapp: "וואטסאפ", email: "אימייל", phone: "טלפון", sms: "SMS" };

function Field({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-0.5 text-[14px] font-bold text-slate-800">{value}</div></div>;
}

export default async function ProfilePage() {
  const r = await getBuyerProfile();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const p = r.data;
  const rooms = p.roomsMin != null || p.roomsMax != null ? `${p.roomsMin ?? ""}${p.roomsMax != null && p.roomsMax !== p.roomsMin ? `-${p.roomsMax}` : ""} חדרים` : "—";
  const size = p.sizeMin != null || p.sizeMax != null ? `${p.sizeMin ?? ""}${p.sizeMax != null ? `-${p.sizeMax}` : ""} מ״ר` : "—";
  const budget = p.budgetMin != null || p.budgetMax != null ? `${fmt(p.budgetMin)} – ${fmt(p.budgetMax)}` : "—";
  const musts = [p.mustHaveParking ? "חניה" : null, p.mustHaveElevator ? "מעלית" : null, p.mustHaveSafeRoom ? 'ממ"ד' : null].filter(Boolean).join(", ") || "—";

  return (
    <>
      <PortalNav active="/buyer-portal/profile" />
      <h1 className="text-2xl font-black text-slate-900">הפרופיל שלי</h1>
      <p className="mt-1 text-[13px] text-slate-600">ככל שההעדפות מדויקות יותר, ההתאמות שנמצא לכם טובות יותר. לעדכון — פנו לברוקר או ערכו כאן.</p>

      <Glass className="mt-6 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="שם" value={p.name} />
          <Field label="תקציב" value={budget} />
          <Field label="חדרים" value={rooms} />
          <Field label="גודל" value={size} />
          <Field label="ערים מועדפות" value={p.preferredCities.join(", ") || "—"} />
          <Field label="אזורים מועדפים" value={p.preferredAreas.join(", ") || "—"} />
          <Field label="סוגי נכס" value={p.preferredTypes.join(", ") || "—"} />
          <Field label="לוח זמנים" value={p.timeline ?? "—"} />
          <Field label="חובה שיהיה" value={musts} />
          <Field label="שפות" value={p.languages.join(", ") || "—"} />
          <Field label="ערוץ תקשורת מועדף" value={p.preferredChannel ? (CHANNEL_HE[p.preferredChannel] ?? p.preferredChannel) : "—"} />
          <Field label="אישור עקרוני למשכנתא" value={p.hasPreapproval ? "יש ✓" : "אין"} />
          <Field label="מטרת השקעה" value={p.investmentGoal ?? "—"} />
        </div>
      </Glass>

      <p className="mt-4 text-[12px] text-slate-400">הנתונים משמשים אך ורק לשיפור ההתאמות עבורכם ואינם נחשפים לגורמים חיצוניים.</p>
    </>
  );
}
