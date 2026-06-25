"use client";
// ============================================================================
// ZONO — System Diagnostics (Phase 21, section 8). Verifies Environment, DB,
// RLS, Providers, Maps, AI, Realtime, Storage, Cron, Permissions, Queues and
// Feature Flags with real probes. Includes a "download diagnostics package"
// (JSON) for support. No business content is included.
// ============================================================================
import { useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { runDiagnosticsAction } from "@/lib/launch/server/actions";
import type { DiagnosticsReport, DiagStatus } from "@/lib/launch";

const STYLE: Record<DiagStatus, string> = {
  pass: "bg-emerald-500/15 text-emerald-300", warning: "bg-amber-500/15 text-amber-300",
  fail: "bg-red-500/15 text-red-300", unknown: "bg-slate-500/15 text-slate-300",
};
const LABEL: Record<DiagStatus, string> = { pass: "תקין", warning: "אזהרה", fail: "כשל", unknown: "לא ידוע" };
const ICON: Record<DiagStatus, string> = { pass: "CheckCircle", warning: "AlertTriangle", fail: "AlertCircle", unknown: "HelpCircle" };

export function DiagnosticsView({ report: r0 }: { report: DiagnosticsReport }) {
  const [report, setReport] = useState(r0);
  const [pending, start] = useTransition();

  function refresh() { start(async () => { const r = await runDiagnosticsAction(); if (r.ok) setReport(r.data); }); }
  function download() {
    const pkg = { generatedAt: report.generatedAt, overall: report.overall, checks: report.checks, appUserAgent: typeof navigator !== "undefined" ? navigator.userAgent : "" };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `zono-diagnostics-${Date.now()}.json`; a.click();
  }

  return (
    <div dir="rtl" className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-5">
        <div className="flex items-center gap-3">
          <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="Activity" size={22} /></span>
          <div>
            <h1 className="text-ink text-lg font-black">דיאגנוסטיקת מערכת</h1>
            <p className="text-muted text-xs">עודכן {new Date(report.generatedAt).toLocaleTimeString("he-IL")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${STYLE[report.overall]}`}>{LABEL[report.overall]}</span>
          <button onClick={download} className="bg-surface text-ink border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold"><Icon name="Download" size={14} /> הורדת חבילה</button>
          <button onClick={refresh} disabled={pending} className="bg-surface text-ink border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold disabled:opacity-50"><Icon name="RefreshCw" size={14} /> {pending ? "…" : "רענן"}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {report.checks.map((c) => (
          <div key={c.key} className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink text-sm font-extrabold">{c.label}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${STYLE[c.status]}`}><Icon name={ICON[c.status]} size={12} /> {LABEL[c.status]}</span>
            </div>
            <div className="text-muted flex items-center justify-between text-xs">
              <span>{c.detail ?? "—"}</span>
              {c.latencyMs != null && <span className="font-mono">{c.latencyMs}ms</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
