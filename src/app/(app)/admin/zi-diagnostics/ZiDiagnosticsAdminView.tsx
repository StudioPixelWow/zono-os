"use client";
// ============================================================================
// ZI Expert™ Diagnostics admin (Phase 24). Read-only log of recent diagnostic
// runs (redacted, non-sensitive). Managers+ see all org runs via RLS. ZI is
// support-only — this view never triggers actions or mutates data.
// ============================================================================
import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { loadDiagnosticRunsAction } from "@/lib/zi-expert/actions";
import type { DiagnosticRunRow } from "@/lib/zi-expert/diagnostic-repository";

const ISSUE_HE: Record<string, string> = {
  property_radar_empty: "רדאר ריק", map_empty: "מפה ריקה", buyer_matching_zero: "אין התאמות",
  seller_intelligence_empty: "מודיעין מוכרים ריק", journey_not_running: "מסע לא רץ",
  ai_unavailable: "AI לא זמין", provider_sync_failed: "סנכרון נכשל", cron_not_running: "cron לא רץ",
  realtime_not_arriving: "זמן אמת", feature_unavailable: "יכולת לא זמינה", permission_denied: "אין הרשאה",
  credits_exhausted: "מכסה מוצתה", reports_not_generating: "דוחות", notifications_missing: "התראות",
  general: "כללי",
};

const STATUS_STYLE: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
  unknown: "bg-slate-50 text-slate-600 border-slate-200",
};
const STATUS_HE: Record<string, string> = { healthy: "תקין", warning: "אזהרה", critical: "קריטי", unknown: "לא ידוע" };

export function ZiDiagnosticsAdminView() {
  const [rows, setRows] = useState<DiagnosticRunRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => { void loadDiagnosticRunsAction().then((r) => (r.ok ? setRows(r.data) : setErr(r.error))); };
  useEffect(() => { load(); }, []);

  return (
    <div dir="rtl" className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-ink flex items-center gap-2 text-xl font-black">
            <Icon name="Activity" size={22} /> ZI Diagnostics — יומן אבחונים
          </h1>
          <p className="text-muted mt-1 text-sm">
            תיעוד מצומצם ולא רגיש של הרצות אבחון „למה זה לא עובד”. ZI מסביר בלבד — אינו מבצע פעולות.
          </p>
        </div>
        <button onClick={load} className="bg-card border-line text-muted hover:text-brand inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition">
          <Icon name="RefreshCw" size={15} /> רענן
        </button>
      </div>

      {err && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}

      {rows === null ? (
        <p className="text-muted text-sm">טוען…</p>
      ) : rows.length === 0 ? (
        <div className="bg-card border-line rounded-2xl border p-8 text-center">
          <p className="text-ink font-bold">אין הרצות אבחון עדיין</p>
          <p className="text-muted mt-1 text-sm">כשמשתמש ילחץ „בדוק למה זה לא עובד” ב‑ZI, ההרצה תופיע כאן.</p>
        </div>
      ) : (
        <div className="bg-card border-line overflow-hidden rounded-2xl border">
          <table className="w-full text-right text-sm">
            <thead className="border-line text-muted border-b text-[12px]">
              <tr>
                <th className="px-3 py-2.5 font-bold">סטטוס</th>
                <th className="px-3 py-2.5 font-bold">נושא</th>
                <th className="px-3 py-2.5 font-bold">סיכום</th>
                <th className="px-3 py-2.5 font-bold">מסך</th>
                <th className="px-3 py-2.5 font-bold">מתי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-line/60 border-b last:border-0">
                  <td className="px-3 py-2.5">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[r.status] ?? STATUS_STYLE.unknown}`}>
                      {STATUS_HE[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="text-ink px-3 py-2.5 font-semibold">{ISSUE_HE[r.issueType] ?? r.issueType}</td>
                  <td className="text-muted px-3 py-2.5">{r.summary}</td>
                  <td className="text-muted px-3 py-2.5 font-mono text-[11px]" dir="ltr">{r.currentRoute ?? "—"}</td>
                  <td className="text-muted px-3 py-2.5 whitespace-nowrap text-[12px]">{new Date(r.createdAt).toLocaleString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
