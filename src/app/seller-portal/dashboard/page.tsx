// ============================================================================
// 🏷️ ZONO — Seller Portal — DASHBOARD. 32.4. Personalized, evidence-only.
// Welcome-back + AI summary + today's activity + property health + market
// performance + buyer demand + valuation/price position + recommendation +
// appointments + conversations + notifications. Buyers anonymized.
// ============================================================================
import { getSellerDashboard } from "@/lib/seller-portal";
import { PortalNav, Glass, Stat, BuyerCard, AuthGate, EmptyState } from "@/components/seller-portal/ui";
import AskSeller from "@/components/seller-portal/AskSeller";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const NOTIF_ICON: Record<string, string> = { new_buyer: "🧲", viewing: "📅", price_reco: "🏷️", market: "📊", valuation: "📐", message: "💬", workflow: "⚙️" };
const POS_HE: Record<string, string> = { above: "מעל השוק", within: "בתוך טווח השוק", below: "מתחת לשוק", unknown: "—" };

export default async function DashboardPage() {
  const r = await getSellerDashboard();
  if (r.state !== "ready") return <AuthGate state={r.state} email={r.state === "unlinked" ? r.email : null} />;
  const d = r.data.dashboard;

  return (
    <>
      <PortalNav active="/seller-portal/dashboard" />

      {/* Welcome hero */}
      <section className="relative overflow-hidden rounded-[2rem] p-8 text-white shadow-2xl" style={{ background: "var(--sp-gradient)" }}>
        <p className="text-[13px] font-bold opacity-80">מצב הנכס · {d.propertyHealth.label}</p>
        <h1 className="mt-1 text-3xl font-black">{d.welcome.greeting}</h1>
        {d.welcome.resume && <p className="mt-2 text-[15px] opacity-90">↩︎ {d.welcome.resume}</p>}
        <p className="mt-3 max-w-2xl text-[14px] opacity-90">{d.aiSummary}</p>
      </section>

      {/* Stats */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="מחיר מבוקש" value={fmt(d.valuation.asking)} />
        <Stat label="הערכת שווי" value={fmt(d.valuation.estimated)} sub={POS_HE[d.valuation.position]} />
        <Stat label="קונים תואמים" value={`${d.buyerDemand.total}`} />
        <Stat label="ביקוש" value={d.marketPerformance.demandScore != null ? `${d.marketPerformance.demandScore}/100` : "—"} />
      </section>

      {/* Notifications */}
      {d.notifications.length > 0 && (
        <section className="mt-6 flex flex-wrap gap-2">
          {d.notifications.map((n) => (
            <span key={n.id} className="rounded-full border border-white/50 bg-white/70 px-3 py-1 text-[12px] font-semibold text-slate-700 backdrop-blur-md">{NOTIF_ICON[n.type] ?? "🔔"} {n.title} — {n.detail}</span>
          ))}
        </section>
      )}

      {/* AI recommendation + today activity */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {d.recommendation && (
          <Glass className="p-5">
            <h2 className="text-lg font-black text-slate-800">המלצת AI</h2>
            <p className="mt-1 text-[14px] font-bold" style={{ color: "var(--sp-accent)" }}>{d.recommendation.title}</p>
            <p className="text-[12px] text-slate-500">{d.recommendation.why}{d.recommendation.requiresApproval ? " · באישורכם בלבד" : ""}</p>
          </Glass>
        )}
        <Glass className="p-5">
          <h2 className="text-lg font-black text-slate-800">הפעילות היום</h2>
          {d.todayActivity.length === 0 ? <p className="mt-2 text-[13px] text-slate-500">אין עדיין פעילות היום.</p> : (
            <ul className="mt-2 space-y-1 text-[13px] text-slate-700">{d.todayActivity.map((e, i) => <li key={i}>• {e.title}</li>)}</ul>
          )}
        </Glass>
      </section>

      {/* Recommended actions */}
      {d.recommendedActions.length > 0 && (
        <Glass className="mt-4 p-5">
          <h2 className="text-lg font-black text-slate-800">הצעדים המומלצים</h2>
          <ol className="mt-2 space-y-2">
            {d.recommendedActions.map((a) => (
              <li key={a.order} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-black text-white" style={{ background: "var(--sp-gradient)" }}>{a.order}</span>
                <div><div className="text-[14px] font-bold text-slate-800">{a.title}</div><div className="text-[12px] text-slate-500">{a.why}{a.requiresApproval ? " · באישורכם בלבד" : ""}</div></div>
              </li>
            ))}
          </ol>
        </Glass>
      )}

      {/* Buyer demand */}
      <BuyerBlock title="קונים מובילים" items={d.buyerDemand.perfect} />
      <BuyerBlock title="קונים מתפתחים" items={d.buyerDemand.emerging} />

      {/* Appointments + conversations */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <Glass className="p-5">
          <h2 className="text-[15px] font-black text-slate-800">פגישות קרובות</h2>
          {d.upcomingAppointments.length === 0 ? <p className="mt-2 text-[13px] text-slate-500">אין פגישות מתוכננות.</p> : (
            <ul className="mt-2 space-y-2">{d.upcomingAppointments.map((a) => <li key={a.id} className="text-[13px] text-slate-700">📅 {a.title} · {new Date(a.startAt).toLocaleString("he-IL")}</li>)}</ul>
          )}
        </Glass>
        <Glass className="p-5">
          <h2 className="text-[15px] font-black text-slate-800">שיחות אחרונות</h2>
          {d.recentConversations.length === 0 ? <p className="mt-2 text-[13px] text-slate-500">אין שיחות עדיין.</p> : (
            <ul className="mt-2 space-y-2">{d.recentConversations.map((c, i) => <li key={i} className="text-[13px] text-slate-700">{c.fromBroker ? "📨" : "🗨️"} {c.summary} · {new Date(c.at).toLocaleDateString("he-IL")}</li>)}</ul>
          )}
        </Glass>
      </section>

      {/* Insights */}
      {d.insights.length > 0 && (
        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {d.insights.map((b, i) => <Glass key={i} className="p-4"><h3 className="text-[14px] font-black text-slate-800">{b.title}</h3><p className="mt-1 text-[13px] text-slate-600">{b.body}</p></Glass>)}
        </section>
      )}

      {/* Ask AI */}
      <section className="mt-8"><AskSeller suggestions={["איך מתפקד הנכס שלי?", "האם כדאי לשנות מחיר?", "מדוע הביקוש השתנה?", "מה הצעד הבא?"]} /></section>

      {!d.welcome.returning && d.buyerDemand.total === 0 && (
        <section className="mt-8"><EmptyState title="הנכס שלכם בדרך" body="ברגע שיתחילו צפיות ופניות, כל הפעילות והקונים יופיעו כאן." /></section>
      )}
    </>
  );
}

function BuyerBlock({ title, items }: { title: string; items: { rank: number; score: number; tier: string; label: string; why: string[] }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-black text-slate-800">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map((b) => <BuyerCard key={b.rank} {...b} />)}</div>
    </section>
  );
}
