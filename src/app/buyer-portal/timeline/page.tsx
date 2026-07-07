// ============================================================================
// 🛒 ZONO — Buyer Portal — CLIENT TIMELINE (Client Experience 2.0). PHASE 56.0.
// Unified, live timeline + notification center. Composes the buyer portal's own
// authenticated getters (RLS-scoped) — no new queries, isolation inherited.
// ============================================================================
import { getBuyerExperience } from "@/lib/client-experience";
import { PortalNav, Glass, AuthGate, EmptyState } from "@/components/buyer-portal/ui";
import type { ClientTimelineItem, ClientNotification } from "@/lib/client-experience";

export const dynamic = "force-dynamic";

const fmt = (at: string | null) => (at ? new Date(at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

function NotifRow({ n }: { n: ClientNotification }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <div><div className="text-[14px] font-bold text-slate-800">{n.title}</div>{n.detail && <div className="text-[12px] text-slate-500">{n.detail}</div>}</div>
      {n.requiresApproval && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">דורש אישור</span>}
    </li>
  );
}
function TimelineRow({ t }: { t: ClientTimelineItem }) {
  return (
    <li className="flex items-start gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{t.kindHe}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-bold text-slate-800">{t.title}</span>
          {t.at && <span className="shrink-0 text-[11px] text-slate-400">{fmt(t.at)}</span>}
        </div>
        {t.detail && <div className="text-[12px] text-slate-500">{t.detail}</div>}
        {t.requiresApproval && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">דורש אישור</span>}
      </div>
    </li>
  );
}

export default async function BuyerTimelinePage() {
  const r = await getBuyerExperience();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const exp = r.data;

  return (
    <>
      <PortalNav active="/buyer-portal/timeline" />
      <h1 className="text-2xl font-black text-slate-900">המסלול שלי</h1>
      <p className="mt-1 text-[13px] text-slate-500">כל מה שקורה בתיק שלך במקום אחד — פגישות, מסמכים, הצעות והודעות.</p>

      {exp.notifications.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-[15px] font-black text-slate-800">מרכז ההתראות ({exp.unreadCount})</h2>
          <Glass className="p-4"><ul>{exp.notifications.map((n) => <NotifRow key={n.id} n={n} />)}</ul></Glass>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-[15px] font-black text-slate-800">ציר הזמן</h2>
        {!exp.hasData ? <EmptyState title="אין עדיין פעילות בתיק שלך" body="פגישות, מסמכים והצעות יופיעו כאן ברגע שיתחילו." /> : <Glass className="p-4"><ul>{exp.timeline.map((t) => <TimelineRow key={t.id} t={t} />)}</ul></Glass>}
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">🔒 {exp.notes[0]}</p>
    </>
  );
}
