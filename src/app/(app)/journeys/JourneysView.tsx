"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { recomputeAllJourneysAction } from "@/lib/journey-intelligence/actions";
import type { JourneyCommandCenter, JourneyCard, RiskCard, OppCard } from "@/lib/journey-intelligence/service";

type Tab = "buyers" | "sellers" | "stuck" | "ready" | "risks" | "opportunities" | "milestones" | "analytics";
const SEV_TONE: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const VEL_TONE: Record<string, string> = { fast: "bg-success-soft text-success", normal: "bg-surface text-muted", slow: "bg-warning-soft text-warning", stuck: "bg-danger-soft text-danger", regression: "bg-danger-soft text-danger" };
const fmtMoney = (n: number | null) => n && n > 0 ? `₪${n.toLocaleString("he-IL")}` : "—";
const hrefFor = (t: string, id: string) => t === "seller" ? `/sellers/${id}` : t === "buyer" ? `/buyers/${id}` : "#";

export function JourneysView({ cc }: { cc: JourneyCommandCenter }) {
  const [tab, setTab] = useState<Tab>("buyers");
  const r = useActionRunner();
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  const tabs: { id: Tab; label: string; icon: string; n?: number }[] = [
    { id: "buyers", label: "קונים", icon: "Users", n: cc.buyers.length },
    { id: "sellers", label: "מוכרים", icon: "Handshake", n: cc.sellers.length },
    { id: "stuck", label: "תקועים", icon: "AlertTriangle", n: cc.stuck.length },
    { id: "ready", label: "מוכנים", icon: "Flame", n: cc.ready.length },
    { id: "risks", label: "סיכונים", icon: "TrendingDown", n: cc.risks.length },
    { id: "opportunities", label: "הזדמנויות", icon: "TrendingUp", n: cc.opportunities.length },
    { id: "milestones", label: "אבני דרך", icon: "MapPin", n: cc.milestones.length },
    { id: "analytics", label: "אנליטיקה", icon: "BarChart3" },
  ];

  // A journey only exists for a real buyer/seller row. When the org has none at
  // all, show one strong, honest empty state instead of a wall of zeroed KPIs
  // and empty tabs.
  const hasAnyJourney =
    cc.buyers.length > 0 ||
    cc.sellers.length > 0 ||
    cc.stuck.length > 0 ||
    cc.ready.length > 0;

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand text-white grid h-9 w-9 place-items-center rounded-xl"><Icon name="Route" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">מודיעין מסעות</h1>
          </div>
          <p className="text-muted text-sm">לכל קונה, מוכר וליד יש מסע חי — לא רק סטטוס. ZONO יודע איפה הם, באיזה קצב הם נעים, מה חוסם אותם, מה צריך לקרות הבא, ומי יניב את ההכנסה הגבוהה ביותר.</p>
        </div>
        <Button size="sm" variant="ghost" loading={r.busyId === "recompute"} onClick={() => wrap(() => recomputeAllJourneysAction(), "recompute", "מחשב מסעות...")}>
          <Icon name="Sparkles" size={14} />חשב מסעות מחדש
        </Button>
      </header>

      <ActionFeedback runner={r} />

      {!hasAnyJourney ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-3xl border px-6 py-16 text-center shadow-sm">
          <span className="bg-brand-soft text-brand-strong grid h-16 w-16 place-items-center rounded-2xl"><Icon name="Route" size={30} /></span>
          <h2 className="text-ink text-xl font-black">אין עדיין מסעות פעילים</h2>
          <p className="text-muted max-w-md text-sm">מסעות יווצרו אוטומטית לאחר יצירת נכס, קונה, מוכר או ליד.</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Link href="/buyers/new" className="bg-brand text-white rounded-xl px-4 py-2 text-sm font-bold">הוסף קונה</Link>
            <Link href="/sellers/new" className="bg-surface text-ink border-line rounded-xl border px-4 py-2 text-sm font-bold">הוסף מוכר</Link>
            <Link href="/properties/new" className="bg-surface text-ink border-line rounded-xl border px-4 py-2 text-sm font-bold">הוסף נכס</Link>
          </div>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="קונים מוכנים" value={cc.kpis.readyBuyers} tone="text-success" />
        <Kpi label="מוכרים מוכנים" value={cc.kpis.readySellers} tone="text-success" />
        <Kpi label="מסעות תקועים" value={cc.kpis.stuckJourneys} tone="text-danger" />
        <Kpi label="סיכוני מסע" value={cc.kpis.journeyRisks} tone="text-danger" />
        <Kpi label="הזדמנויות" value={cc.kpis.journeyOpportunities} tone="text-warning" />
        <Kpi label="עמלה צפויה (מוכנים)" value={fmtMoney(cc.kpis.expectedCommission)} tone="text-brand-strong" />
      </div>

      <nav className="border-line flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>
            <Icon name={t.icon} size={15} />{t.label}{t.n ? <span className="bg-surface text-muted rounded-full px-1.5 text-[10px]">{t.n}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "buyers" && <JourneyList list={cc.buyers} empty="אין מסעות קונים פעילים" />}
      {tab === "sellers" && <JourneyList list={cc.sellers} empty="אין מסעות מוכרים פעילים" />}
      {tab === "stuck" && <JourneyList list={cc.stuck} empty="אין מסעות תקועים — מצוין!" />}
      {tab === "ready" && <JourneyList list={cc.ready} empty="אין לקוחות בשלים לסגירה כרגע" />}
      {tab === "risks" && (cc.risks.length === 0 ? <Empty text="אין סיכוני מסע פעילים" /> : <div className="flex flex-col gap-2">{cc.risks.map((x) => <RiskRow key={x.id} x={x} />)}</div>)}
      {tab === "opportunities" && (cc.opportunities.length === 0 ? <Empty text="אין הזדמנויות פתוחות" /> : <div className="flex flex-col gap-2">{cc.opportunities.map((o) => <OppRow key={o.id} o={o} />)}</div>)}
      {tab === "milestones" && (cc.milestones.length === 0 ? <Empty text="אין אבני דרך שהושגו" /> : <div className="flex flex-col gap-2">{cc.milestones.map((m, i) => <div key={i} className="bg-card border-line flex items-center justify-between gap-2 rounded-2xl border p-3 shadow-sm"><span className="text-ink text-sm font-bold"><Icon name="MapPin" size={14} /> {m.milestone_label}</span><span className="text-muted text-[11px]">{m.reached_at ? new Date(m.reached_at).toLocaleDateString("he-IL") : ""}</span></div>)}</div>)}
      {tab === "analytics" && <Analytics cc={cc} />}
      </>
      )}
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return <div className="bg-card border-line flex flex-col gap-0.5 rounded-2xl border p-3 shadow-sm"><span className="text-muted text-[11px] font-bold">{label}</span><span className={`text-xl font-black ${tone}`}>{value}</span></div>;
}
function Empty({ text }: { text: string }) { return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">{text}</div>; }

function JourneyList({ list, empty }: { list: JourneyCard[]; empty: string }) {
  if (list.length === 0) return <Empty text={empty} />;
  return <div className="flex flex-col gap-2">{list.map((j) => <JourneyRow key={j.id} j={j} />)}</div>;
}
function JourneyRow({ j }: { j: JourneyCard }) {
  return (
    <a href={hrefFor(j.entity_type, j.entity_id)} className="bg-card border-line block rounded-2xl border p-4 shadow-sm hover:border-brand">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink font-black">{j.label}</span>
            <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{j.stage_label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${VEL_TONE[j.velocity_state] ?? "bg-surface text-muted"}`}>{j.velocity_label}</span>
            {j.days_since_activity != null && <span className="text-muted text-[11px]">{j.days_since_activity} ימים מאז פעילות</span>}
          </div>
          {j.next_best_action && <p className="text-brand-strong mt-1 text-[12px]">← {j.next_best_action}</p>}
          <div className="bg-surface mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${j.progress}%` }} /></div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-left">
          <span className="text-success text-lg font-black">{j.conversion_score}</span>
          <span className="text-muted text-[10px]">המרה</span>
          {j.probability_convert != null && <span className="text-muted text-[11px]">{j.probability_convert}% סיכוי</span>}
          {j.expected_commission != null && <span className="text-brand-strong text-[11px]">{fmtMoney(j.expected_commission)}</span>}
        </div>
      </div>
    </a>
  );
}

function RiskRow({ x }: { x: RiskCard }) {
  return (
    <a href={hrefFor(x.entity_type, x.entity_id)} className="bg-card border-line block rounded-2xl border p-4 shadow-sm hover:border-brand">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="text-ink font-bold">{x.risk_type}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SEV_TONE[x.severity] ?? "bg-surface text-muted"}`}>{x.severity === "high" ? "גבוה" : x.severity === "medium" ? "בינוני" : "נמוך"}</span></div>
        <span className="text-danger text-lg font-black">{x.score}</span>
      </div>
      {x.reason && <p className="text-muted mt-1 text-[12px]">{x.reason}</p>}
      {x.recommended_action && <p className="text-brand-strong mt-0.5 text-[12px]">← {x.recommended_action}</p>}
    </a>
  );
}
function OppRow({ o }: { o: OppCard }) {
  return (
    <a href={hrefFor(o.entity_type, o.entity_id)} className="bg-card border-line block rounded-2xl border p-4 shadow-sm hover:border-brand">
      <div className="flex items-center justify-between gap-2"><span className="text-ink font-bold">{o.opportunity_type}</span><span className="text-success text-lg font-black">{o.score}</span></div>
      {o.reason && <p className="text-muted mt-1 text-[12px]">{o.reason}</p>}
      {o.recommended_action && <p className="text-brand-strong mt-0.5 text-[12px]">← {o.recommended_action}</p>}
    </a>
  );
}

function Analytics({ cc }: { cc: JourneyCommandCenter }) {
  const a = cc.analytics;
  const maxB = Math.max(1, ...a.byStageBuyer.map((s) => s.count));
  const maxS = Math.max(1, ...a.byStageSeller.map((s) => s.count));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="המרה ממוצעת" value={a.avgConversion} tone="text-success" />
        <Kpi label="בריאות ממוצעת" value={a.avgHealth} tone="text-brand-strong" />
        <Kpi label="מסעות פעילים" value={cc.kpis.activeJourneys} tone="text-ink" />
      </div>
      <Funnel title="משפך קונים" rows={a.byStageBuyer} max={maxB} />
      <Funnel title="משפך מוכרים" rows={a.byStageSeller} max={maxS} />
    </div>
  );
}
function Funnel({ title, rows, max }: { title: string; rows: { stage: string; label: string; count: number }[]; max: number }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <p className="text-ink mb-2 text-sm font-black">{title}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map((s) => (
          <div key={s.stage} className="flex items-center gap-2">
            <span className="text-muted w-28 shrink-0 text-[12px]">{s.label}</span>
            <div className="bg-surface h-4 flex-1 overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${(s.count / max) * 100}%` }} /></div>
            <span className="text-ink w-6 text-left text-[12px] font-bold">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
