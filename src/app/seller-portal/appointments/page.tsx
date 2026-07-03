// ============================================================================
// 🏷️ ZONO — Seller Portal — APPOINTMENTS. 32.4. Upcoming + past visits/meetings.
// ============================================================================
import { getSellerAppointments } from "@/lib/seller-portal";
import { PortalNav, Glass, AuthGate, EmptyState } from "@/components/seller-portal/ui";

export const dynamic = "force-dynamic";

const KIND_HE: Record<string, string> = { viewing: "צפייה בנכס", open_house: "בית פתוח", meeting: "פגישה", call: "שיחה", signing: "חתימה", valuation: "הערכת שווי", inspection: "בדיקה", other: "אחר" };

function Row({ a }: { a: { id: string; title: string; startAt: string; kind: string; locationText: string | null } }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <div>
        <div className="text-[14px] font-bold text-slate-800">{a.title}</div>
        <div className="text-[12px] text-slate-500">{KIND_HE[a.kind] ?? a.kind} · {new Date(a.startAt).toLocaleString("he-IL")}{a.locationText ? ` · ${a.locationText}` : ""}</div>
      </div>
      {a.locationText && <a href={`https://maps.google.com/?q=${encodeURIComponent(a.locationText)}`} className="text-[12px] font-bold" style={{ color: "var(--sp-accent)" }}>🧭 ניווט</a>}
    </li>
  );
}

export default async function AppointmentsPage() {
  const r = await getSellerAppointments();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const { upcoming, past } = r.data;

  return (
    <>
      <PortalNav active="/seller-portal/appointments" />
      <h1 className="text-2xl font-black text-slate-900">הפגישות שלי</h1>
      <section className="mt-6">
        <h2 className="mb-2 text-[15px] font-black text-slate-800">קרובות</h2>
        {upcoming.length === 0 ? <EmptyState title="אין פגישות מתוכננות" body="צפיות ופגישות עם הברוקר יופיעו כאן עם תזכורת וניווט." /> : <Glass className="p-4"><ul>{upcoming.map((a) => <Row key={a.id} a={a} />)}</ul></Glass>}
      </section>
      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[15px] font-black text-slate-800">קודמות</h2>
          <Glass className="p-4"><ul>{past.map((a) => <Row key={a.id} a={a} />)}</ul></Glass>
        </section>
      )}
    </>
  );
}
