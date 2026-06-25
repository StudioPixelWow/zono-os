"use client";
// ============================================================================
// ZONO — Executive Business Intelligence™ dashboard. Consumes the deterministic
// engines; AI summarizes only. Period-aware KPIs, pipeline, forecast, revenue,
// ROI, productivity, health, risk, timeline, benchmarks, report center, map.
// ============================================================================
import { useCallback, useState, useTransition } from "react";
import { BrainCircuit, RefreshCw, Layers, TrendingUp, TrendingDown, Minus, FileDown } from "lucide-react";
import { ZonoMap } from "@/components/maps/ZonoMap";
import { AiActionButton } from "@/components/ai-copilot/AiCopilotPanel";
import {
  getExecutiveDashboardAction, runBiSnapshotAction, generateBiReportAction, aiExecutiveBriefAction,
} from "@/lib/business-intelligence/actions";
import type { ExecutiveDashboard, Period, ExecKpi } from "@/lib/business-intelligence/types";
import type { ReportType } from "@/lib/business-intelligence/exports";

const PERIODS: { p: Period; l: string }[] = [
  { p: "today", l: "היום" }, { p: "week", l: "שבוע" }, { p: "month", l: "חודש" }, { p: "quarter", l: "רבעון" }, { p: "year", l: "שנה" },
];
const SEV: Record<string, string> = { urgent: "border-red-300 bg-red-50", high: "border-amber-300 bg-amber-50", medium: "border-sky-200 bg-sky-50", low: "border-black/10 bg-white" };
const fmtKpi = (k: ExecKpi) => k.format === "currency" ? `₪${Math.round(k.value).toLocaleString("he-IL")}` : k.format === "percent" ? `${k.value}%` : k.value.toLocaleString("he-IL");
const DirIcon = ({ d }: { d: string }) => d === "up" ? <TrendingUp size={11} className="text-emerald-600" /> : d === "down" ? <TrendingDown size={11} className="text-red-500" /> : <Minus size={11} className="text-ink/30" />;

export function ExecutiveIntelligenceView({ initial }: { initial: ExecutiveDashboard }) {
  const [data, setData] = useState(initial);
  const [period, setPeriod] = useState<Period>("month");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [report, setReport] = useState<{ content: string; format: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => { setBusy(true); const r = await getExecutiveDashboardAction(); if (r.ok) setData(r.data); setBusy(false); }, []);
  const snapshot = () => start(async () => { await runBiSnapshotAction(); setNote("צילום יומי נשמר."); await refresh(); });
  const genReport = (t: ReportType, f: "json" | "csv" | "markdown") => start(async () => { const r = await generateBiReportAction(t, f); if (r.ok) setReport({ content: r.data.content, format: r.data.format }); else setNote(r.error); });

  const kpis = data.kpis[period];
  const h = data.health;
  const updatedAt = new Date(data.generatedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4">
      {/* Header */}
      <section className="zono-gradient relative overflow-hidden rounded-[20px] p-5 text-white">
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-white/80"><BrainCircuit size={16} /> מודיעין עסקי למנהלים</p>
            <h1 className="mt-1 text-2xl font-black">המוח העסקי של ZONO</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-white/60">עודכן {updatedAt}</span>
            <button onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-2.5 py-2 text-[12px] font-black text-white hover:bg-white/30"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> רענן</button>
            <button onClick={snapshot} disabled={pending} className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-2.5 py-2 text-[12px] font-black text-white hover:bg-white/30 disabled:opacity-50"><Layers size={13} /> צילום יומי</button>
          </div>
        </div>
        <ul className="relative mt-3 flex flex-col gap-1.5">
          {data.summary.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm font-semibold text-white/95"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />{s}</li>)}
        </ul>
        <div className="relative mt-3 flex flex-wrap gap-2">
          {([["explain_business", "הסבר לי את העסק"], ["weekly_brief", "תדריך שבועי"], ["revenue_summary", "סיכום הכנסות"], ["risk_summary", "סיכום סיכונים"], ["growth_opportunities", "הזדמנויות צמיחה"]] as const).map(([k, l]) => (
            <AiActionButton key={k} label={l} title={`${l} — ZONO Copilot`} run={() => aiExecutiveBriefAction(k)} className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-3 py-1.5 text-[12px] font-black text-white hover:bg-white/30" />
          ))}
        </div>
      </section>
      {note && <p className="rounded-xl bg-brand-soft px-3 py-2 text-[12px] font-bold text-brand-strong">{note}</p>}

      {/* Period toggle + KPI grid */}
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((x) => <button key={x.p} onClick={() => setPeriod(x.p)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${period === x.p ? "bg-brand-strong text-white" : "bg-black/5 text-ink/60 hover:bg-black/10"}`}>{x.l}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.key} className="flex flex-col items-start rounded-2xl border border-black/5 bg-white p-2.5">
            <span className="text-[10px] font-bold text-ink/55">{k.label}</span>
            <span className="text-lg font-black text-brand-strong">{fmtKpi(k)}</span>
            {k.changePercent != null && <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-ink/45"><DirIcon d={k.direction} /> {Math.abs(k.changePercent)}%</span>}
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-1 text-sm font-black text-ink">פייפליין עסקי</h2>
        <p className="mb-2 text-[10px] font-medium text-ink/40">{data.pipeline.note}</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {data.pipeline.stages.map((s) => (
            <div key={s.key} className="min-w-[92px] shrink-0 rounded-xl border border-black/5 p-2 text-center">
              <p className="text-[10px] font-bold text-ink/50">{s.label}</p>
              <p className="text-base font-black text-brand-strong">{s.count}</p>
              <p className="text-[9px] font-bold text-ink/40">המרה {s.conversionPct}%</p>
              <p className="text-[9px] text-ink/35">₪{Math.round(s.value).toLocaleString("he-IL")}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Forecast + Health */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[20px] border border-black/5 bg-white p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink">תחזית עסקית <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">ודאות {data.forecast.confidencePct}%</span></h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["נכסים", data.forecast.listings], ["פגישות", data.forecast.meetings], ["בלעדיות", data.forecast.exclusives], ["עסקאות", data.forecast.deals], ["ביקוש קונים", data.forecast.buyerDemand], ["פעילות שוק", data.forecast.marketActivity]].map(([l, v], i) => (
              <div key={i} className="rounded-xl border border-black/5 p-2"><p className="text-base font-black text-brand-strong">{v}</p><p className="text-[10px] font-bold text-ink/50">{l}</p></div>
            ))}
          </div>
          <div className="mt-2 rounded-xl bg-black/[0.03] p-2.5">
            <p className="mb-1 text-[10px] font-black text-ink/45">הנחות החישוב</p>
            <ul className="flex flex-col gap-0.5 text-[11px] text-ink/55">{data.forecast.assumptions.slice(0, 5).map((a, i) => <li key={i}>• {a}</li>)}</ul>
          </div>
        </section>

        <section className="rounded-[20px] border border-black/5 bg-white p-4">
          <h2 className="mb-2 text-sm font-black text-ink">בריאות המשרד</h2>
          <div className="mb-2 flex items-center gap-3">
            <div className="relative grid h-20 w-20 place-items-center rounded-full" style={{ background: `conic-gradient(var(--brand-strong, #6d28d9) ${h.total * 3.6}deg, #00000010 0)` }}>
              <div className="grid h-15 w-15 place-items-center rounded-full bg-white"><span className="text-lg font-black text-brand-strong">{h.total}</span></div>
            </div>
            <div><p className="text-[13px] font-black text-ink">{h.band === "excellent" ? "מצוין" : h.band === "good" ? "טוב" : h.band === "fair" ? "סביר" : "בסיכון"}</p><p className="text-[11px] text-ink/45">ציון משוקלל 0–100</p></div>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {h.components.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-[11px]"><span className="w-28 shrink-0 font-bold text-ink/60">{c.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-brand-strong" style={{ width: `${c.score}%` }} /></div>
                <span className="w-7 text-left font-black text-brand-strong">{c.score}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Revenue + ROI */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[20px] border border-black/5 bg-white p-4">
          <h2 className="mb-1 text-sm font-black text-ink">הכנסות</h2>
          <p className="mb-2 text-[10px] font-medium text-ink/40">{data.revenue.note}</p>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[["צפויה", data.revenue.expectedRevenue], ["עמלה", data.revenue.expectedCommission], ["אבודה", data.revenue.lostRevenue], ["בסיכון", data.revenue.revenueAtRisk]].map(([l, v], i) => (
              <div key={i} className="rounded-xl border border-black/5 p-2"><p className="text-sm font-black text-brand-strong">₪{Math.round(v as number).toLocaleString("he-IL")}</p><p className="text-[10px] font-bold text-ink/50">{l}</p></div>
            ))}
          </div>
          {data.revenue.byAgent.length > 0 && (
            <div className="mt-3"><p className="mb-1 text-[11px] font-black text-ink/50">לפי סוכן</p>
              <ul className="flex flex-col gap-1">{data.revenue.byAgent.slice(0, 6).map((r) => (
                <li key={r.key} className="flex items-center justify-between text-[12px]"><span className="font-bold text-ink">{r.label}</span><span className="text-ink/50">₪{r.revenue.toLocaleString("he-IL")} · {r.sharePercent}%</span></li>
              ))}</ul>
            </div>
          )}
        </section>

        <section className="rounded-[20px] border border-black/5 bg-white p-4">
          <h2 className="mb-1 text-sm font-black text-ink">ROI ופרודוקטיביות</h2>
          <p className="mb-2 text-[10px] font-medium text-ink/40">{data.roi.note}</p>
          <div className="mb-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-brand-soft/40 p-2"><p className="text-base font-black text-brand-strong">{data.roi.totalHoursSaved}</p><p className="text-[10px] font-bold text-ink/50">שעות נחסכו</p></div>
            <div className="rounded-xl bg-brand-soft/40 p-2"><p className="text-base font-black text-brand-strong">₪{data.roi.totalMoneySaved.toLocaleString("he-IL")}</p><p className="text-[10px] font-bold text-ink/50">חיסכון כספי</p></div>
          </div>
          <ul className="flex flex-col gap-1">{data.roi.rows.slice(0, 6).map((r) => (
            <li key={r.key} className="flex items-center justify-between text-[12px]"><span className="font-bold text-ink">{r.label}</span><span className="text-ink/50">{r.hoursSaved} שע׳ · ₪{r.moneySaved.toLocaleString("he-IL")}</span></li>
          ))}</ul>
        </section>
      </div>

      {/* Risk + Timeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[20px] border border-black/5 bg-white p-4">
          <h2 className="mb-2 text-sm font-black text-ink">תחזית סיכונים</h2>
          {data.risks.length === 0 ? <p className="rounded-xl bg-emerald-50 px-3 py-5 text-center text-sm font-bold text-emerald-700">אין סיכונים מהותיים ✓</p> : (
            <ul className="flex flex-col gap-2">{data.risks.map((r) => (
              <li key={r.key} className={`rounded-2xl border p-3 ${SEV[r.severity]}`}>
                <div className="flex items-center justify-between"><p className="text-[13px] font-black text-ink">{r.label}</p><span className="text-[12px] font-black text-brand-strong">{r.scorePercent}%</span></div>
                <p className="mt-0.5 text-[12px] text-ink/65">{r.reason}</p>
                <p className="mt-1 text-[12px] font-bold text-brand-strong">{r.recommendedAction}</p>
              </li>
            ))}</ul>
          )}
        </section>

        <section className="rounded-[20px] border border-black/5 bg-white p-4">
          <h2 className="mb-2 text-sm font-black text-ink">ציר זמן מנהלים</h2>
          <ul className="flex flex-col gap-2">{data.timeline.map((e, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl border border-black/5 p-2.5"><DirIcon d={e.direction} />
              <div><p className="text-[13px] font-black text-ink">{e.title}</p><p className="text-[11px] text-ink/50">{e.detail}</p></div>
            </li>
          ))}</ul>
          {data.benchmarks.length > 0 && (
            <div className="mt-3"><p className="mb-1 text-[11px] font-black text-ink/50">השוואות</p>
              <ul className="flex flex-col gap-1">{data.benchmarks.slice(0, 6).map((b) => (
                <li key={b.metric} className="flex items-center justify-between text-[12px]"><span className="font-bold text-ink">{b.label}</span><span className="inline-flex items-center gap-1 text-ink/50"><DirIcon d={b.direction} />{b.deltaPct == null ? "—" : `${b.deltaPct}%`}</span></li>
              ))}</ul>
            </div>
          )}
        </section>
      </div>

      {/* Report center */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-2 text-sm font-black text-ink">מרכז דוחות</h2>
        <div className="flex flex-wrap gap-1.5">
          {([["executive_daily", "יומי"], ["executive_weekly", "שבועי"], ["executive_monthly", "חודשי"], ["board", "דירקטוריון"], ["investor", "משקיעים"], ["office", "משרד"], ["area", "אזור"]] as const).map(([t, l]) => (
            <div key={t} className="inline-flex items-center gap-0.5 rounded-lg border border-black/10 p-0.5">
              <span className="px-1.5 text-[12px] font-bold text-ink/70">{l}</span>
              <button onClick={() => genReport(t, "markdown")} disabled={pending} className="rounded bg-black/5 px-1.5 py-1 text-[10px] font-bold text-ink/60 hover:bg-black/10">MD</button>
              <button onClick={() => genReport(t, "csv")} disabled={pending} className="rounded bg-black/5 px-1.5 py-1 text-[10px] font-bold text-ink/60 hover:bg-black/10">CSV</button>
              <button onClick={() => genReport(t, "json")} disabled={pending} className="rounded bg-black/5 px-1.5 py-1 text-[10px] font-bold text-ink/60 hover:bg-black/10">JSON</button>
            </div>
          ))}
        </div>
        {report && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-bold text-ink/50">תצוגה ({report.format})</span>
              <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(report.content)}`} download={`zono-report.${report.format === "markdown" ? "md" : report.format}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1 text-[11px] font-bold text-brand-strong"><FileDown size={12} /> הורד</a>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/[0.03] p-3 text-[11px] text-ink/70">{report.content.slice(0, 4000)}</pre>
          </div>
        )}
      </section>

      {/* Map analytics */}
      <section className="rounded-[20px] border border-black/5 bg-white p-4">
        <h2 className="mb-2 text-sm font-black text-ink">מפת אנליטיקה</h2>
        <ZonoMap points={data.mapPoints.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, title: p.title, details: p.details, tone: p.tone }))} heightClass="h-[340px]" emptyMessage="אין נקודות עם מיקום מדויק להצגה כעת." />
      </section>
    </div>
  );
}
