"use client";
// ============================================================================
// ZONO — Health Center (Enterprise Reliability Platform™). Renders the overall
// system status, per-component health (DB, Realtime, Cron, Providers, Queues,
// AI, Journey, Property Radar, Shared Cache, Office Intelligence, Storage) and
// any operational alerts. Read-only; refresh re-runs the server probes.
// ============================================================================
import { useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { getSystemHealthAction } from "@/lib/platform/server/actions";
import type { HealthReport, HealthStatus, PlatformAlert } from "@/lib/platform/types";

const STATUS_HE: Record<HealthStatus, string> = { healthy: "תקין", warning: "אזהרה", critical: "קריטי", unknown: "לא ידוע" };
const STATUS_STYLE: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  unknown: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
const STATUS_ICON: Record<HealthStatus, string> = { healthy: "CheckCircle", warning: "AlertTriangle", critical: "AlertCircle", unknown: "HelpCircle" };

export function HealthCenterView({ report: initialReport, alerts: initialAlerts }: { report: HealthReport; alerts: PlatformAlert[] }) {
  const [report, setReport] = useState(initialReport);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await getSystemHealthAction();
      if (res.ok) { setReport(res.data.report); setAlerts(res.data.alerts); }
    });
  }

  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      {/* Header + overall */}
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-5">
        <div className="flex items-center gap-3">
          <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="Activity" size={22} /></span>
          <div>
            <h1 className="text-ink text-lg font-black">מרכז בריאות מערכת</h1>
            <p className="text-muted text-xs">Enterprise Reliability Platform™ · עודכן {new Date(report.generatedAt).toLocaleTimeString("he-IL")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${STATUS_STYLE[report.overall]}`}>
            <Icon name={STATUS_ICON[report.overall]} size={15} /> {STATUS_HE[report.overall]}
          </span>
          <button onClick={refresh} disabled={pending} className="bg-surface text-ink border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold disabled:opacity-50">
            <Icon name="RefreshCw" size={14} /> {pending ? "מרענן…" : "רענן"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {alerts.map((a) => (
            <div key={a.key} className={`flex items-start gap-2.5 rounded-2xl border p-3 ${a.severity === "critical" ? STATUS_STYLE.critical : STATUS_STYLE.warning}`}>
              <Icon name={a.severity === "critical" ? "AlertCircle" : "AlertTriangle"} size={17} />
              <div>
                <p className="text-sm font-extrabold">{a.title}</p>
                <p className="text-xs opacity-90">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Components grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {report.components.map((c) => (
          <div key={c.key} className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink text-sm font-extrabold">{c.label}</span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[c.status]}`}>
                <Icon name={STATUS_ICON[c.status]} size={12} /> {STATUS_HE[c.status]}
              </span>
            </div>
            <div className="text-muted flex items-center justify-between text-xs">
              <span>{c.detail ?? "—"}</span>
              {c.latencyMs != null && <span className="font-mono">{c.latencyMs}ms</span>}
            </div>
          </div>
        ))}
      </div>

      <p className="text-muted text-center text-[11px]">
        רכיב במצב &quot;לא ידוע&quot; מציין שלא ניתן לקבוע את מצבו בבטחה (לרוב חסר משתנה סביבה) — לא נחשב לתקין.
      </p>
    </div>
  );
}
