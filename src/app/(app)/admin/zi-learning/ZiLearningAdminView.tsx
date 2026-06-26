"use client";
// ============================================================================
// ZI Interactive Learning admin (Phase 25). Read-only: content counts +
// most-requested topics (questions ZI couldn't answer well → content gaps).
// Authoring of org content is a later phase; this surfaces what to write next.
// ============================================================================
import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { loadLearningAdminAction, type LearningAdminData } from "@/lib/zi-expert/actions";

export function ZiLearningAdminView() {
  const [data, setData] = useState<LearningAdminData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void loadLearningAdminAction().then((r) => (r.ok ? setData(r.data) : setErr(r.error))); }, []);

  return (
    <div dir="rtl" className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-ink flex items-center gap-2 text-xl font-black"><Icon name="ListChecks" size={22} /> ZI Learning — מרכז למידה</h1>
        <p className="text-muted mt-1 text-sm">סקירה של תוכן הלמידה והנושאים שהכי ביקשו עליהם הסבר. ZI מלמד ומסביר — לא מבצע פעולות.</p>
      </div>

      {err && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}

      {!data ? <p className="text-muted text-sm">טוען…</p> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="סיורים מודרכים" value={data.walkthroughs} icon="ListChecks" />
            <Stat label="מדריכים" value={data.tutorials} icon="FileText" />
            <Stat label="מונחים במילון" value={data.glossary} icon="FileText" />
            <Stat label="שאלות נפוצות" value={data.faq} icon="HelpCircle" />
          </div>

          <div className="bg-card border-line rounded-2xl border p-4">
            <p className="text-ink mb-2 text-sm font-extrabold">הנושאים המבוקשים ביותר (פערי תוכן)</p>
            {data.mostRequested.length === 0 ? (
              <p className="text-muted text-sm">אין עדיין שאלות פתוחות — מעולה. כשמשתמשים יסמנו „לא עזר/חסר מידע”, הנושאים יופיעו כאן.</p>
            ) : (
              <ol className="list-inside list-decimal space-y-1">
                {data.mostRequested.map((q, i) => <li key={i} className="text-ink text-sm">{q}</li>)}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className="text-brand-strong mb-1 inline-flex"><Icon name={icon} size={16} /></span>
      <p className="text-brand-strong text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
