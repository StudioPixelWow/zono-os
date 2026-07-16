"use client";
// ============================================================================
// ☀️ ZONO Daily AI Operating System™ — the new default workspace (RTL). 40.0.
// ONE morning surface: briefing → timeline → a single ranked action feed →
// conversations → deals → growth → approvals → executive → Ask. Re-frames the
// existing broker workspace; official ZONO tokens; deep-links into every flow.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import type { DailyOS as DData, DailyAction, ExecutiveDaily } from "@/lib/daily-os/types";
import type { ScoredEntity } from "@/lib/broker-workspace/types";
import { getExecutiveDailyAction, askDailyAction } from "@/lib/daily-os/actions";

type Tab = "morning" | "actions" | "convo" | "deals" | "growth" | "approvals" | "exec" | "ask";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "morning", label: "בוקר", icon: "☀️" }, { id: "actions", label: "פעולות", icon: "⚡" },
  { id: "convo", label: "שיחות", icon: "💬" }, { id: "deals", label: "עסקאות", icon: "🤝" },
  { id: "growth", label: "צמיחה", icon: "📈" }, { id: "approvals", label: "אישורים", icon: "✅" },
  { id: "exec", label: "מנהל", icon: "🏢" }, { id: "ask", label: "שאל", icon: "🔮" },
];
const priCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const priHe: Record<string, string> = { high: "דחוף", medium: "בינוני", low: "רגיל" };
const scoreCls = (v: number) => (v >= 70 ? "bg-success-soft text-success" : v >= 45 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger");
// Batch 5.6F — keyed by canonical actionClass (structural), not by the retired
// hand-rolled `kind` taxonomy. Unknown classes fall back safely.
const kindIcon: Record<string, string> = { call: "📞", send: "📤", price: "💰", marketing: "📣", mortgage: "🏦", meeting: "🤝", document: "📄", wait: "⏳", journey: "🧭" };
// Canonical urgency → badge. Replaces the 3-level `impRank` guess.
const urgCls: Record<string, string> = { critical: "bg-danger-soft text-danger", high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const urgHe: Record<string, string> = { critical: "קריטי", high: "דחוף", medium: "בינוני", low: "רגיל" };

function Tile({ l, v }: { l: string; v: number | string }) { return <div className="bg-card border-line rounded-2xl border px-2 py-2.5 text-center shadow-[var(--shadow-card)]"><div className="text-brand text-xl font-black">{v}</div><div className="text-muted text-[10px] font-bold">{l}</div></div>; }
function Empty({ t }: { t: string }) { return <div className="bg-card border-line text-muted rounded-2xl border p-6 text-center text-[13px]">{t}</div>; }
function EntityRow({ e }: { e: ScoredEntity }) {
  return <Link href={e.href} className="bg-surface flex items-center gap-3 rounded-2xl p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[12px] font-black ${e.healthScore != null ? scoreCls(e.healthScore) : "bg-surface text-muted"}`}>{e.healthScore ?? "—"}</span><div className="min-w-0 flex-1"><div className="text-ink line-clamp-1 text-[13px] font-bold">{e.name}</div>{e.reason && <div className="text-muted line-clamp-1 text-[11px]">{e.reason}</div>}</div>{e.riskLabel && <span className="bg-danger-soft text-danger shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">{e.riskLabel}</span>}</Link>;
}

export function DailyOS({ data }: { data: DData }) {
  const [tab, setTab] = useState<Tab>("morning");
  const b = data.briefing;

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h1 className="text-ink text-2xl font-black">{b.greeting}</h1><p className="text-muted mt-1 text-[13px]">{b.aiSummary}</p></div>
          <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-xl font-black ${scoreCls(b.dailyScore)}`}>{b.dailyScore}</div>
        </div>
        <div className="bg-card mt-3 rounded-2xl p-3"><div className="text-muted text-[11px] font-bold">🎯 המיקוד להיום</div><div className="text-ink mt-0.5 text-[14px] font-black">{b.focus}</div></div>
      </div>

      <div className="mt-4">
        {tab === "morning" && (
          <div className="space-y-4">
            <Link href="/brain" className="bg-brand flex items-center justify-between gap-3 rounded-2xl p-3.5 text-white shadow-[var(--shadow-card)]">
              <div><div className="text-[11px] font-bold opacity-90">🧠 מוח הברוקר · AI Broker Brain</div><div className="mt-0.5 text-[14px] font-black">אמור מטרה — קבל תוכנית פעולה</div></div>
              <span className="text-[13px] font-black">←</span>
            </Link>
            <div className="grid grid-cols-2 gap-2">
              {b.biggestOpportunity && <Link href={b.biggestOpportunity.href} className="bg-success-soft rounded-2xl p-3"><div className="text-success text-[11px] font-bold">🚀 ההזדמנות הגדולה</div><div className="text-ink mt-0.5 text-[14px] font-black">{b.biggestOpportunity.label}</div><div className="text-muted text-[11px]">{b.biggestOpportunity.detail}</div></Link>}
              {b.biggestRisk && <Link href={b.biggestRisk.href} className="bg-danger-soft rounded-2xl p-3"><div className="text-danger text-[11px] font-bold">⚠️ הסיכון הגדול</div><div className="text-ink mt-0.5 text-[14px] font-black">{b.biggestRisk.label}</div><div className="text-muted text-[11px]">{b.biggestRisk.detail}</div></Link>}
            </div>
            <div className="grid grid-cols-3 gap-2"><Tile l="ציון יומי" v={data.performance.daily} /><Tile l="שיעור מעקב" v={`${data.performance.followUpRatePct}%`} /><Tile l="הזדמנויות" v={data.performance.conversionOpportunities} /></div>
            <section><h2 className="text-ink mb-2 text-[15px] font-black">🗓️ ציר הזמן של היום</h2>{data.timeline.length === 0 ? <Empty t="אין אירועים מתוזמנים היום." /> : <div className="space-y-2">{data.timeline.map((e, i) => (
              <Link key={i} href={e.href} className="bg-surface flex items-center gap-3 rounded-2xl p-3"><span className="text-lg">{e.icon}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-ink line-clamp-1 text-[13px] font-bold">{e.title}</span><span className="text-muted shrink-0 text-[10px]">{new Date(e.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span></div>{e.detail && <div className="text-muted text-[11px]">{e.detail}</div>}</div></Link>
            ))}</div>}
            <Link href="/calendar" className="btn-zono-secondary mt-2 block rounded-xl py-2.5 text-center text-[13px] font-bold">היומן המלא (Calendar OS) ←</Link>
            <Link href="/automation" className="btn-zono-secondary mt-2 block rounded-xl py-2.5 text-center text-[13px] font-bold">מרכז האוטומציות (Automation OS) ←</Link></section>
          </div>
        )}

        {tab === "actions" && (
          <section><h2 className="text-ink mb-2 text-[15px] font-black">⚡ מה לעשות עכשיו ({data.actionFeed.length})</h2>{data.actionFeed.length === 0 ? <Empty t="אין פעולות דחופות. יום טוב להתרחבות." /> : <div className="space-y-2">{data.actionFeed.map((a) => <ActionRow key={a.id} a={a} />)}</div>}</section>
        )}

        {tab === "convo" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2"><Tile l="וואטסאפ" v={data.conversation.whatsappUnread} /><Tile l="ממתין" v={data.conversation.whatsappWaiting} /><Tile l="תגובות FB" v={data.conversation.facebookComments} /><Tile l="לידים FB" v={data.conversation.facebookLeads} /></div>
            <section><h2 className="text-ink mb-2 text-[15px] font-black">ממתינים לתשובה</h2>{data.conversation.waiting.length === 0 ? <Empty t="אין שיחות ממתינות." /> : <div className="space-y-2">{data.conversation.waiting.map((c, i) => <Link key={i} href={c.href} className="bg-surface flex items-center justify-between rounded-2xl p-3"><span className="text-ink text-[13px] font-bold">{c.name}</span><span className="text-muted text-[11px]">{c.reason}</span></Link>)}</div>}</section>
            {data.conversation.drafts.length > 0 && <section><h2 className="text-ink mb-2 text-[15px] font-black">טיוטות / מעקב</h2><div className="space-y-2">{data.conversation.drafts.map((c, i) => <Link key={i} href={c.href} className="bg-surface flex items-center justify-between rounded-2xl p-3"><span className="text-ink text-[13px] font-bold">{c.entityName}</span><span className="text-muted text-[11px]">{c.why}</span></Link>)}</div></section>}
            <Link href="/whatsapp/inbox" className="btn-zono-secondary block rounded-xl py-2.5 text-center text-[13px] font-bold">פתח תיבה מאוחדת ←</Link>
          </div>
        )}

        {tab === "deals" && (
          <div className="space-y-5">
            <DealSec title="🔥 קונים חמים" items={data.deals.hotBuyers} />
            <DealSec title="⚠️ מוכרים בסיכון" items={data.deals.sellersAtRisk} />
            <DealSec title="🏠 נכסים קריטיים" items={data.deals.criticalListings} />
            <DealSec title="📞 מעקב לידים" items={data.deals.leadFollowUps} />
          </div>
        )}

        {tab === "growth" && (
          <div className="space-y-5">
            <section><h2 className="text-ink mb-2 text-[15px] font-black">🗺️ טריטוריה היום</h2>{data.territory.acquisitionStreets.length === 0 && data.territory.opportunities.length === 0 ? <Empty t="אין נתוני טריטוריה." /> : (
              <div className="space-y-2">
                {data.territory.acquisitionStreets.slice(0, 4).map((st, i) => <Link key={i} href={st.href} className="bg-surface flex items-center justify-between rounded-2xl p-3"><span className="text-ink text-[13px] font-bold">🛣️ {st.street}{st.city ? ` · ${st.city}` : ""}</span><span className="text-brand text-[12px] font-black">{st.score}</span></Link>)}
                {data.territory.opportunities.slice(0, 3).map((o, i) => <Link key={i} href={o.href} className="bg-surface rounded-2xl p-3"><div className="text-ink text-[13px] font-bold">{o.title}</div><div className="text-muted text-[11px]">{o.why}</div></Link>)}
              </div>
            )}<Link href="/territory" className="btn-zono-secondary mt-2 block rounded-xl py-2.5 text-center text-[13px] font-bold">מערכת הטריטוריה ←</Link></section>
            <section><h2 className="text-ink mb-2 text-[15px] font-black">📣 שיווק היום</h2><div className="grid grid-cols-4 gap-2"><Tile l="מתוזמן" v={data.marketing.scheduledToday} /><Tile l="תגובות" v={data.marketing.commentsWaiting} /><Tile l="לידים" v={data.marketing.leadApprovals} /><Tile l="קבוצות" v={data.marketing.groupsToPublish} /></div>{data.marketing.tasks.length > 0 && <div className="mt-2 space-y-2">{data.marketing.tasks.slice(0, 4).map((t, i) => <Link key={i} href={t.href} className="bg-surface flex items-center justify-between rounded-2xl p-3"><span className="text-ink text-[13px] font-bold">{t.title}</span><span className="text-muted text-[11px]">{t.detail}</span></Link>)}</div>}<Link href="/facebook" className="btn-zono-secondary mt-2 block rounded-xl py-2.5 text-center text-[13px] font-bold">פלטפורמת פייסבוק ←</Link></section>
          </div>
        )}

        {tab === "approvals" && (
          <section><h2 className="text-ink mb-2 text-[15px] font-black">✅ ממתין לאישורך ({data.approvals.length})</h2>{data.approvals.length === 0 ? <Empty t="אין אישורים ממתינים." /> : <div className="space-y-2">{data.approvals.map((a) => <Link key={a.id} href={a.href} className="bg-card border-line block rounded-2xl border p-3"><div className="text-ink text-[13px] font-black">{a.title}</div><div className="text-muted mt-0.5 text-[11px]">{a.source}{a.why ? ` · ${a.why}` : ""}</div></Link>)}</div>}<div className="text-muted mt-3 text-center text-[11px]">אישור מתבצע במסך היעד — לא מתבצע אוטומטית.</div></section>
        )}

        {tab === "exec" && <ExecTab />}
        {tab === "ask" && <AskTab suggestions={data.ask} />}
        {tab === "morning" && data.notes.length > 0 && <div className="text-muted mt-3 space-y-1 text-[11px]">{data.notes.map((n, i) => <p key={i}>• {n}</p>)}</div>}
      </div>

      <nav className="bg-card/95 border-line fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl justify-between border-t px-1 py-1.5 backdrop-blur">
        {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[9px] font-bold transition ${tab === t.id ? "text-brand bg-brand-soft" : "text-muted"}`}><span className="text-sm leading-none">{t.icon}</span>{t.label}</button>)}
      </nav>
    </div>
  );
}

function ActionRow({ a }: { a: DailyAction }) {
  // Batch 5.6F — renders the CANONICAL recommendation: structural actionClass
  // icon, canonical urgency badge, and the scheduled slot time when the shared
  // scheduler placed it. `href` is nullable on the canonical contract.
  return <Link href={a.href ?? "/today"} className="bg-card border-line flex items-center gap-3 rounded-2xl border p-3"><span className="text-lg">{kindIcon[a.actionClass] ?? "•"}</span><div className="min-w-0 flex-1"><div className="text-ink line-clamp-1 text-[14px] font-bold">{a.title}</div><div className="text-muted line-clamp-1 text-[11px]">{a.why}</div></div>{a.startTime && <span className="text-muted shrink-0 text-[10px] font-bold tabular-nums">{a.startTime}</span>}<span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${urgCls[a.urgency]}`}>{urgHe[a.urgency]}</span></Link>;
}
function DealSec({ title, items }: { title: string; items: ScoredEntity[] }) {
  if (items.length === 0) return null;
  return <section><h2 className="text-ink mb-2 text-[15px] font-black">{title}</h2><div className="space-y-2">{items.slice(0, 5).map((e) => <EntityRow key={e.id} e={e} />)}</div></section>;
}
function ExecTab() {
  const [ed, setEd] = useState<ExecutiveDaily | null>(null);
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);
  if (!loaded) { setLoaded(true); start(async () => { const r = await getExecutiveDailyAction(); setEd(r.ok && r.result ? r.result : null); }); }
  if (pending || !ed) return <div className="text-muted py-8 text-center text-sm">טוען סקירת מנהל…</div>;
  const o = ed.orgScore;
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-4 text-center ${scoreCls(o.overall)}`}><div className="text-[11px] font-bold">בריאות המשרד</div><div className="text-3xl font-black">{o.overall}</div><div className="text-[11px] font-bold">{ed.officeHealth === "strong" ? "חזק" : ed.officeHealth === "fair" ? "יציב" : "חלש"}</div></div>
      <div className="grid grid-cols-4 gap-2"><Tile l="צמיחה" v={o.growth} /><Tile l="ביצוע" v={o.execution} /><Tile l="כיסוי" v={o.coverage} /><Tile l="תחרות" v={o.competitivePosition} /></div>
      {ed.priorities.length > 0 && <section><h2 className="text-ink mb-2 text-[15px] font-black">עדיפויות מובילות</h2><div className="space-y-2">{ed.priorities.map((r, i) => <div key={i} className="bg-card border-line rounded-2xl border p-3"><div className="flex items-start justify-between gap-2"><span className="text-ink text-[13px] font-black">{r.title}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${priCls[r.impact]}`}>{priHe[r.impact]}</span></div><div className="text-muted mt-1 text-[12px]">{r.why}</div></div>)}</div></section>}
      {ed.insights.length > 0 && <section><h2 className="text-ink mb-2 text-[15px] font-black">תובנות חוצות-מודולים</h2><div className="space-y-2">{ed.insights.map((it, i) => <div key={i} className="bg-surface rounded-2xl p-3"><div className="text-ink text-[13px] font-bold">{it.title}</div><div className="text-muted mt-0.5 text-[12px]">{it.recommendation}</div></div>)}</div></section>}
      <Link href="/territory" className="btn-zono-secondary block rounded-xl py-2.5 text-center text-[13px] font-bold">מערכת הטריטוריה ←</Link>
    </div>
  );
}
function AskTab({ suggestions }: { suggestions: string[] }) {
  const [res, setRes] = useState<{ answer: string; limitations: string | null } | null>(null);
  const [pending, start] = useTransition();
  const ask = (q: string) => { if (!q.trim()) return; start(async () => { const r = await askDailyAction(q); setRes(r.ok && r.result ? { answer: r.result.answer, limitations: r.result.limitations } : { answer: "לא ניתן לענות כרגע.", limitations: null }); }); };
  return (
    <div className="space-y-3">
      <div className="bg-brand-soft rounded-2xl p-3"><div className="text-brand text-[13px] font-black">🔮 שאל את ZONO — יודע מה על המסך היום</div></div>
      <div className="flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="bg-surface text-ink rounded-full px-3 py-1.5 text-[11px] font-bold">{s}</button>)}</div>
      {pending && <div className="text-muted text-[12px]">חושב…</div>}
      {res && <div className="bg-card border-line rounded-2xl border p-3"><div className="text-ink whitespace-pre-wrap text-[13px] leading-relaxed">{res.answer}</div>{res.limitations && <div className="text-muted border-line mt-2 border-t pt-2 text-[11px]">מגבלות: {res.limitations}</div>}</div>}
    </div>
  );
}
