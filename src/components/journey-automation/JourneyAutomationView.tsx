"use client";
// ============================================================================
// ZONO — Journey Automation OS™ dashboard. Running/completed/failed/waiting/
// delayed/cancelled, avg duration, SLA compliance, success %, business metrics,
// workflows (activate/pause), audit log, and the durable delay-queue runner.
// ============================================================================
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { Workflow, RefreshCw, Play, Pause, Plus, Activity, Clock, ShieldCheck, Sparkles, Layers } from "lucide-react";
import {
  getJourneyDashboardAction, setJourneyStatusAction, seedDefaultJourneysAction,
  runJourneyQueueAction, cancelExecutionAction,
} from "@/lib/journey-automation/server-actions";
import { auditLabel, actorLabel } from "@/lib/journey-automation/audit";
import { triggerLabel } from "@/lib/journey-automation/triggers";
import type { AutomationDashboard, WorkflowSummary } from "@/lib/journey-automation/types";

const STATUS_META: Record<string, { label: string; c: string }> = {
  running: { label: "פעיל", c: "bg-sky-100 text-sky-700" },
  completed: { label: "הושלם", c: "bg-emerald-100 text-emerald-700" },
  failed: { label: "נכשל", c: "bg-red-100 text-red-700" },
  waiting: { label: "ממתין", c: "bg-amber-100 text-amber-700" },
  delayed: { label: "מושהה", c: "bg-violet-100 text-violet-700" },
  cancelled: { label: "בוטל", c: "bg-black/10 text-ink/50" },
};

export function JourneyAutomationView({ initial, workflows }: { initial: AutomationDashboard; workflows: WorkflowSummary[] }) {
  const [data, setData] = useState(initial);
  const [wfs, setWfs] = useState(workflows);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    const res = await getJourneyDashboardAction();
    if (res.ok) setData(res.data);
    setBusy(false);
  }, []);

  const toggle = (id: string, status: string) => start(async () => {
    await setJourneyStatusAction(id, status === "active" ? "paused" : "active");
    setWfs((cur) => cur.map((w) => (w.id === id ? { ...w, status: status === "active" ? "paused" : "active" } : w)));
  });
  const seed = () => start(async () => { const r = await seedDefaultJourneysAction(); setNote(r.ok ? `נוצרו ${r.data.created} מסעות ברירת מחדל.` : r.error); await refresh(); });
  const runQueue = () => start(async () => { const r = await runJourneyQueueAction(); setNote(r.ok ? `עובדו ${r.data.processed} פעולות מושהות.` : r.error); await refresh(); });
  const cancel = (id: string) => start(async () => { await cancelExecutionAction(id); await refresh(); });

  const c = data.counts;
  const m = data.metrics;
  const statCards = [
    { icon: <Activity size={14} />, label: "פעילים", value: c.running },
    { icon: <Clock size={14} />, label: "מושהים", value: c.delayed + c.waiting },
    { icon: <RefreshCw size={14} />, label: "הושלמו", value: c.completed },
    { icon: <ShieldCheck size={14} />, label: "עמידת SLA", value: `${data.slaCompliancePct}%` },
    { icon: <Sparkles size={14} />, label: "הצלחת אוטומציה", value: `${data.automationSuccessPct}%` },
    { icon: <Clock size={14} />, label: "משך ממוצע", value: `${Math.round(data.avgDurationMs)}ms` },
  ];

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4">
      <section className="zono-gradient relative overflow-hidden rounded-[20px] p-5 text-white">
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-white/80"><Workflow size={16} /> Journey Automation OS™</p>
            <h1 className="mt-1 text-2xl font-black">תזמור כל המנועים — מסע אחד חכם</h1>
            <p className="mt-1 text-[12px] font-medium text-white/70">האוטומציה צורכת את פלטי המנועים הדטרמיניסטיים — לעולם לא מחליפה אותם.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/journey-builder" className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-[12px] font-black text-brand-strong hover:bg-white/90"><Plus size={14} /> בונה מסעות</Link>
            <button onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-2.5 py-2 text-[12px] font-black text-white hover:bg-white/30"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> רענן</button>
            <button onClick={runQueue} disabled={pending} className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-2.5 py-2 text-[12px] font-black text-white hover:bg-white/30 disabled:opacity-50"><Layers size={13} /> הרץ תור</button>
          </div>
        </div>
        {note && <p className="relative mt-3 rounded-xl bg-white/15 px-3 py-1.5 text-[12px] font-bold text-white">{note}</p>}
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((s, i) => (
          <div key={i} className="flex flex-col items-start rounded-2xl border border-black/5 bg-white p-2.5">
            <span className="flex items-center gap-1 text-[10px] font-bold text-ink/55">{s.icon} {s.label}</span>
            <span className="text-lg font-black text-brand-strong">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Business metrics */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-2 text-sm font-black text-ink">ערך עסקי שנוצר</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 text-center">
          {[
            { l: "משימות אוטומטיות", v: m.tasksAutomated }, { l: "שיחות נחסכו", v: m.callsSaved },
            { l: "וואטסאפ", v: m.whatsappsGenerated }, { l: "פגישות", v: m.meetingsScheduled },
            { l: "תזכורות", v: m.remindersCreated }, { l: "דק׳ תגובה נחסכו", v: m.responseTimeSavedMinutes },
            { l: "שעות נחסכו", v: m.hoursSaved },
          ].map((x, i) => (
            <div key={i} className="rounded-xl border border-black/5 p-2">
              <p className="text-base font-black text-brand-strong">{x.v}</p>
              <p className="text-[10px] font-bold text-ink/50">{x.l}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Workflows */}
        <section className="rounded-[20px] border border-black/5 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-black text-ink">מסעות</h2>
            {wfs.length === 0 && <button onClick={seed} disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1 text-[12px] font-bold text-brand-strong"><Plus size={12} /> טען ברירות מחדל</button>}
          </div>
          {wfs.length === 0 ? (
            <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין מסעות עדיין. טען מסעות ברירת מחדל או צור בבונה.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {wfs.map((w) => (
                <li key={w.id} className="flex items-center justify-between rounded-2xl border border-black/5 p-3">
                  <div>
                    <p className="text-[13px] font-black text-ink">{w.name}</p>
                    <p className="text-[11px] font-bold text-ink/45">{w.triggerType ? triggerLabel(w.triggerType) : "—"} · גרסה {w.activeVersion}</p>
                  </div>
                  <button onClick={() => toggle(w.id, w.status)} disabled={pending} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${w.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-black/5 text-ink/60"}`}>
                    {w.status === "active" ? <><Pause size={12} /> פעיל</> : <><Play size={12} /> מושהה</>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Audit log */}
        <section className="rounded-[20px] border border-black/5 bg-white p-4">
          <h2 className="mb-2 text-sm font-black text-ink">יומן ביקורת</h2>
          {data.recentAudit.length === 0 ? (
            <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין רישומים עדיין.</p>
          ) : (
            <ul className="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
              {data.recentAudit.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-black/[0.03]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-strong" />
                  <span className="font-bold text-ink">{auditLabel(a.eventType)}</span>
                  {a.reason && <span className="truncate text-ink/50">· {a.reason}</span>}
                  <span className="ms-auto shrink-0 text-[10px] text-ink/35">{actorLabel(a.actor)} · {new Date(a.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent executions */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-2 text-sm font-black text-ink">הרצות אחרונות</h2>
        {data.recentExecutions.length === 0 ? (
          <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין הרצות עדיין. הפעל מסע מהבונה או טריגר ידני.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[12px]">
              <thead><tr className="text-ink/55">
                <th className="px-2 py-1 font-bold">מסע</th><th className="px-2 py-1 font-bold">טריגר</th><th className="px-2 py-1 font-bold">ישות</th>
                <th className="px-2 py-1 font-bold">סטטוס</th><th className="px-2 py-1 font-bold">צעדים</th><th className="px-2 py-1 font-bold">מצב</th><th className="px-2 py-1 font-bold"></th>
              </tr></thead>
              <tbody>
                {data.recentExecutions.map((e) => (
                  <tr key={e.id} className="border-t border-black/5">
                    <td className="px-2 py-1.5 font-bold text-ink">{e.workflowName ?? "—"}</td>
                    <td className="px-2 py-1.5">{e.triggerType ? triggerLabel(e.triggerType) : "—"}</td>
                    <td className="px-2 py-1.5 text-ink/60">{e.entityLabel ?? "—"}</td>
                    <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_META[e.status]?.c ?? ""}`}>{STATUS_META[e.status]?.label ?? e.status}{e.slaBreached ? " · SLA" : ""}</span></td>
                    <td className="px-2 py-1.5">{e.stepsDone}/{e.stepsTotal}</td>
                    <td className="px-2 py-1.5">{e.mode === "simulation" ? "סימולציה" : "ביצוע"}</td>
                    <td className="px-2 py-1.5">{(e.status === "running" || e.status === "delayed" || e.status === "waiting") && <button onClick={() => cancel(e.id)} disabled={pending} className="rounded-lg bg-black/5 px-2 py-1 text-[11px] font-bold text-ink/60 hover:bg-black/10">בטל</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
