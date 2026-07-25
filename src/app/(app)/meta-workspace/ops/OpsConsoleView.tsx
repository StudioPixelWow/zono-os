"use client";
// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · Ops Console view (RTL).
// PURE presentational, READ-ONLY. Renders the safe operational summary passed as
// a prop: per-queue health grades + backlog/in-flight/dead-letter, a dead-letter
// panel (safe DTO fields + an explicit "manual redrive only — never auto-replayed"
// note), and webhook freshness. No data fetching, no forms, no mutations, and no
// sensitive field (token/ciphertext/secret/payload) is ever displayed.
// ============================================================================
import type { MetaOpsSummary, OpsGrade } from "@/lib/meta/ops/summary";

const SUBSYSTEM_LABEL: Record<string, string> = {
  publish: "פרסום", inbox: "תיבה מאוחדת", messaging: "הודעות (DM)", engagement: "תגובות", intelligence: "אינטליגנציה", reconcile: "התאמה", insights: "תובנות", listening: "האזנה",
};
const GRADE_LABEL: Record<OpsGrade, string> = { healthy: "תקין", degraded: "מוגבל", unhealthy: "תקלה" };
const GRADE_CLASS: Record<OpsGrade, string> = {
  healthy: "text-green-700 bg-green-50 border-green-200",
  degraded: "text-amber-800 bg-amber-50 border-amber-200",
  unhealthy: "text-red-700 bg-red-50 border-red-200",
};

function minutes(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)} ש׳`;
  return `${Math.round(ms / 60_000)} ד׳`;
}

export function OpsConsoleView({ summary }: { summary: MetaOpsSummary }) {
  const s = summary;
  return (
    <main dir="rtl" className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-extrabold">מרכז תפעול — Meta</h1>
          <p className="text-muted text-sm">בריאות תורים, מכתבים מתים ו-Webhook. תצוגה בלבד.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-bold ${GRADE_CLASS[s.worstGrade]}`}>מצב כללי: {GRADE_LABEL[s.worstGrade]}</span>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <div className="bg-card border-line rounded-2xl border p-4 text-center"><div className="text-muted text-xs">בהמתנה</div><div className="text-ink text-2xl font-extrabold">{s.totalBacklog}</div></div>
        <div className="bg-card border-line rounded-2xl border p-4 text-center"><div className="text-muted text-xs">בעיבוד</div><div className="text-ink text-2xl font-extrabold">{s.totalInFlight}</div></div>
        <div className="bg-card border-line rounded-2xl border p-4 text-center"><div className="text-muted text-xs">מכתבים מתים</div><div className="text-ink text-2xl font-extrabold">{s.totalDeadLetter}</div></div>
      </section>

      <section className="bg-card border-line overflow-hidden rounded-2xl border">
        <table className="w-full text-right text-sm">
          <thead className="bg-surface text-muted text-xs">
            <tr><th className="p-3">תור</th><th className="p-3">מצב</th><th className="p-3">בהמתנה</th><th className="p-3">בעיבוד</th><th className="p-3">מכתבים מתים</th><th className="p-3">הישן ביותר</th></tr>
          </thead>
          <tbody>
            {s.queues.map((q) => (
              <tr key={q.subsystem} className="border-line border-t">
                <td className="text-ink p-3 font-bold">{SUBSYSTEM_LABEL[q.subsystem] ?? q.subsystem}</td>
                <td className="p-3"><span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${GRADE_CLASS[q.grade]}`}>{GRADE_LABEL[q.grade]}</span></td>
                <td className="text-ink p-3">{q.backlog}</td>
                <td className="text-ink p-3">{q.inFlight}</td>
                <td className={`p-3 font-bold ${q.deadLetter > 0 ? "text-red-700" : "text-ink"}`}>{q.deadLetter}</td>
                <td className="text-muted p-3">{minutes(q.oldestDueMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-card border-line rounded-2xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-ink font-extrabold">מכתבים מתים (פרסום)</h2>
          <span className="text-muted text-xs">שחזור ידני בלבד — לעולם לא מופעל אוטומטית</span>
        </div>
        {s.deadLetters.length === 0 ? (
          <p className="text-muted text-sm">אין מכתבים מתים.</p>
        ) : (
          <ul className="space-y-2">
            {s.deadLetters.map((d) => (
              <li key={d.id} className="border-line flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                <span className="text-ink font-bold">{d.jobKind}</span>
                <span className="text-muted">סיבה: {d.reason}</span>
                <span className="text-muted">שגיאה: {d.terminalErrorKind ?? "—"}</span>
                <span className="text-muted">ניסיונות: {d.attemptCount}</span>
                {d.requiresProviderVerification && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">דורש אימות מול הספק</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border-line rounded-2xl border p-4">
        <h2 className="text-ink mb-2 font-extrabold">Webhook</h2>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div><div className="text-muted text-xs">אירוע תקין אחרון</div><div className="text-ink font-bold">{minutes(s.webhook.lastValidAgeMs)}</div></div>
          <div><div className="text-muted text-xs">שיעור חתימות פסולות</div><div className="text-ink font-bold">{Math.round(s.webhook.invalidSignatureRate * 100)}%</div></div>
          <div><div className="text-muted text-xs">אירועים לא משויכים</div><div className="text-ink font-bold">{s.webhook.unmatchedBacklog}</div></div>
        </div>
      </section>

      <p className="text-muted text-center text-xs">עודכן: {new Date(s.generatedAtIso).toLocaleString("he-IL")}</p>
    </main>
  );
}
