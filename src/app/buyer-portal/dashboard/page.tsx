// ============================================================================
// 🛒 ZONO — Buyer Portal — DASHBOARD. 32.3. Personalized, evidence-only.
// Welcome-back + journey stage + readiness + AI summary + recommended actions +
// AI recommendations + appointments + conversations + insights + notifications.
// ============================================================================
import { getBuyerDashboard } from "@/lib/buyer-portal";
import { PortalNav, Glass, Stat, RecoCard, AuthGate, EmptyState } from "@/components/buyer-portal/ui";
import AskBuyer from "@/components/buyer-portal/AskBuyer";

export const dynamic = "force-dynamic";

const NOTIF_ICON: Record<string, string> = { new_match: "✨", price_drop: "📉", sold: "🔴", appointment: "📅", message: "💬", opportunity: "🎯" };

export default async function DashboardPage() {
  const r = await getBuyerDashboard();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const d = r.data.dashboard;

  return (
    <>
      <PortalNav active="/buyer-portal/dashboard" />

      {/* Welcome hero */}
      <section className="relative overflow-hidden rounded-[2rem] p-8 text-white shadow-2xl" style={{ background: "var(--bp-gradient)" }}>
        <p className="text-[13px] font-bold opacity-80">{d.stageLabel} · {d.readinessLabel}</p>
        <h1 className="mt-1 text-3xl font-black">{d.welcome.greeting}</h1>
        {d.welcome.resume && <p className="mt-2 text-[15px] opacity-90">↩︎ {d.welcome.resume}</p>}
        <p className="mt-3 max-w-2xl text-[14px] opacity-90">{d.aiSummary}</p>
      </section>

      {/* Stats */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="מוכנות לרכישה" value={`${d.readiness}`} sub={d.readinessLabel} />
        <Stat label="התאמות מושלמות" value={`${d.recommendations.perfect.length}`} />
        <Stat label="פגישות קרובות" value={`${d.upcomingAppointments.length}`} />
        <Stat label="ביטחון AI" value={`${d.confidence}%`} />
      </section>

      {/* Notifications */}
      {d.notifications.length > 0 && (
        <section className="mt-6 flex flex-wrap gap-2">
          {d.notifications.map((n) => (
            <span key={n.id} className="rounded-full border border-white/50 bg-white/70 px-3 py-1 text-[12px] font-semibold text-slate-700 backdrop-blur-md">{NOTIF_ICON[n.type] ?? "🔔"} {n.title} — {n.detail}</span>
          ))}
        </section>
      )}

      {/* Recommended actions (approval-gated) */}
      {d.recommendedActions.length > 0 && (
        <Glass className="mt-6 p-5">
          <h2 className="text-lg font-black text-slate-800">הצעדים המומלצים לכם</h2>
          <ol className="mt-2 space-y-2">
            {d.recommendedActions.map((a) => (
              <li key={a.order} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-black text-white" style={{ background: "var(--bp-gradient)" }}>{a.order}</span>
                <div><div className="text-[14px] font-bold text-slate-800">{a.title}</div><div className="text-[12px] text-slate-500">{a.why}{a.requiresApproval ? " · באישורכם בלבד" : ""}</div></div>
              </li>
            ))}
          </ol>
        </Glass>
      )}

      {/* Recommendations */}
      <RecoBlock title="התאמות מושלמות" items={d.recommendations.perfect} />
      <RecoBlock title="התאמות מתפתחות" items={d.recommendations.emerging} />
      <RecoBlock title="הזדמנויות נסתרות" items={d.recommendations.hidden} />

      {/* Two-column: appointments + conversations */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <Glass className="p-5">
          <h2 className="text-[15px] font-black text-slate-800">פגישות קרובות</h2>
          {d.upcomingAppointments.length === 0 ? <p className="mt-2 text-[13px] text-slate-500">אין פגישות מתוכננות.</p> : (
            <ul className="mt-2 space-y-2">{d.upcomingAppointments.map((a) => <li key={a.id} className="text-[13px] text-slate-700">📅 {a.title} · {new Date(a.startAt).toLocaleString("he-IL")}{a.locationText ? ` · ${a.locationText}` : ""}</li>)}</ul>
          )}
        </Glass>
        <Glass className="p-5">
          <h2 className="text-[15px] font-black text-slate-800">שיחות אחרונות</h2>
          {d.recentConversations.length === 0 ? <p className="mt-2 text-[13px] text-slate-500">אין שיחות עדיין.</p> : (
            <ul className="mt-2 space-y-2">{d.recentConversations.map((c, i) => <li key={i} className="text-[13px] text-slate-700">{c.fromBroker ? "📨" : "🗨️"} {c.summary} · {new Date(c.at).toLocaleDateString("he-IL")}</li>)}</ul>
          )}
        </Glass>
      </section>

      {/* Market updates + insights */}
      {(d.marketUpdates.length > 0 || d.insights.length > 0) && (
        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {[...d.marketUpdates, ...d.insights].slice(0, 6).map((b, i) => (
            <Glass key={i} className="p-4"><h3 className="text-[14px] font-black text-slate-800">{b.title}</h3><p className="mt-1 text-[13px] text-slate-600">{b.body}</p></Glass>
          ))}
        </section>
      )}

      {/* Ask AI */}
      <section className="mt-8"><AskBuyer suggestions={["אילו נכסים הכי מתאימים לי?", "מה הצעד הבא שלי?", "איך מתכוננים להצעה?", "מה כדאי לבדוק בצפייה?"]} /></section>

      {d.recommendations.perfect.length === 0 && d.recommendations.emerging.length === 0 && !d.welcome.returning && (
        <section className="mt-8"><EmptyState title="בואו נתחיל" body="עדכנו את ההעדפות שלכם בפרופיל כדי שנמצא לכם התאמות מדויקות." /></section>
      )}
    </>
  );
}

function RecoBlock({ title, items }: { title: string; items: { id: string; title: string; price: number | null; image: string | null; city: string | null; neighborhood: string | null; matchScore: number; tier: string; why: string[] }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-black text-slate-800">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => <RecoCard key={p.id} {...p} />)}
      </div>
    </section>
  );
}
