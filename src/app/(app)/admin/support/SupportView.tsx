"use client";
// ============================================================================
// ZONO — Support Tools (Phase 21, sections 9 & 10). Admin-only. Usage analytics
// (non-sensitive), feedback inbox, and read-only impersonation audit + start/
// end. Quick links to diagnostics / health. Download diagnostics package lives
// on the diagnostics page. No business content is exposed.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { startImpersonationAction, endImpersonationAction, listImpersonationAction } from "@/lib/launch/server/actions";

interface UsageSummary { total: number; byName: { name: string; count: number }[]; byCategory: { name: string; count: number }[] }

export function SupportView({ usage, feedback, impersonation: imp0 }: {
  usage: UsageSummary; feedback: Record<string, unknown>[]; impersonation: Record<string, unknown>[];
}) {
  const [imp, setImp] = useState(imp0);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function refresh() { start(async () => { const r = await listImpersonationAction(); if (r.ok) setImp(r.data.rows); }); }
  function startImp() {
    if (!target.trim()) return;
    setMsg(null);
    start(async () => { const r = await startImpersonationAction(target.trim(), reason || null); if (r.ok) { setMsg("נרשמה גישת תמיכה (קריאה בלבד)."); setTarget(""); setReason(""); refresh(); } else setMsg(r.error); });
  }
  function endImp(id: string) { start(async () => { const r = await endImpersonationAction(id); if (r.ok) refresh(); }); }

  return (
    <div dir="rtl" className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-5">
        <div className="flex items-center gap-3">
          <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="ShieldCheck" size={22} /></span>
          <div>
            <h1 className="text-ink text-lg font-black">כלי תמיכה</h1>
            <p className="text-muted text-xs">ניתוח שימוש, משוב וגישת תמיכה (קריאה בלבד)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/diagnostics" className="bg-surface text-ink border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold"><Icon name="Activity" size={14} /> דיאגנוסטיקה</Link>
          <Link href="/system-health" className="bg-surface text-ink border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold"><Icon name="Activity" size={14} /> בריאות</Link>
        </div>
      </div>

      {/* Usage analytics */}
      <div className="bg-card border-line rounded-2xl border p-4">
        <h2 className="text-ink mb-2 text-sm font-black">ניתוח שימוש · 30 ימים ({usage.total} אירועים)</h2>
        {usage.total === 0 ? <p className="text-muted text-sm">אין עדיין נתוני שימוש.</p> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-muted mb-1 text-xs font-bold">לפי קטגוריה</p>
              {usage.byCategory.map((c) => <div key={c.name} className="text-ink flex justify-between text-sm"><span>{c.name}</span><span className="font-mono">{c.count}</span></div>)}
            </div>
            <div>
              <p className="text-muted mb-1 text-xs font-bold">פעולות מובילות</p>
              {usage.byName.slice(0, 8).map((c) => <div key={c.name} className="text-ink flex justify-between text-sm"><span className="truncate font-mono text-xs" dir="ltr">{c.name}</span><span className="font-mono">{c.count}</span></div>)}
            </div>
          </div>
        )}
        <p className="text-muted mt-2 text-[11px]">לא נאסף תוכן עסקי — מונים ותוויות בלבד.</p>
      </div>

      {/* Feedback inbox */}
      <div className="bg-card border-line rounded-2xl border p-4">
        <h2 className="text-ink mb-2 text-sm font-black">משוב נכנס ({feedback.length})</h2>
        {feedback.length === 0 ? <p className="text-muted text-sm">אין משוב עדיין.</p> : (
          <div className="flex flex-col gap-1.5">
            {feedback.slice(0, 10).map((f) => (
              <div key={String(f.id)} className="border-line flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
                <span className="text-ink truncate text-sm">{String(f.title || f.body || "—")}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">{String(f.feedback_type)}</span>
                  <span className="text-muted text-[11px]">{String(f.status)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Read-only impersonation */}
      <div className="bg-card border-line rounded-2xl border p-4">
        <h2 className="text-ink mb-1 text-sm font-black">גישת תמיכה (קריאה בלבד)</h2>
        <p className="text-muted mb-3 text-[11px]">פעולה זו נרשמת ביומן ביקורת. אין שינוי נתונים — צפייה בלבד.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="מזהה משתמש יעד" dir="ltr" className="bg-surface border-line text-ink min-w-[180px] flex-1 rounded-xl border px-3 py-2 text-sm" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה (אופציונלי)" className="bg-surface border-line text-ink min-w-[180px] flex-1 rounded-xl border px-3 py-2 text-sm" />
          <button onClick={startImp} disabled={pending || !target.trim()} className="bg-brand-strong rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50">התחל גישה</button>
        </div>
        {msg && <p className="text-muted mb-2 text-xs font-semibold">{msg}</p>}
        <div className="flex flex-col gap-1.5">
          {imp.map((r) => (
            <div key={String(r.id)} className="border-line flex items-center justify-between gap-2 border-b py-1.5 text-xs last:border-0">
              <span className="text-muted font-mono" dir="ltr">{String(r.target_user_id ?? "—").slice(0, 8)} · {new Date(String(r.started_at)).toLocaleString("he-IL")}</span>
              {r.ended_at ? <span className="text-muted">הסתיים</span> : <button onClick={() => endImp(String(r.id))} className="text-brand-strong font-bold">סיום</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
