"use client";
// ============================================================================
// 🔬 National Brokerage Research™ tab (Phase 26.13b, RTL). Owner/QA.
// Provider status · research queue · recent · single-broker test ("בדוק מתווך
// בודד") with preview + Apply gating. Honestly shows when public web search is
// not configured (research can't run). Read-only until you press Apply.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { getResearchSnapshotAction, researchSingleBrokerAction, runBrokerResearchAction } from "@/lib/brokerage-data/actions";
import type { ResearchSnapshot } from "@/lib/brokerage-data/broker-research/engine";
import type { ResearchReport } from "@/lib/brokerage-data/broker-research/engine";

const STATUS_HE: Record<string, string> = {
  resolved: "שויך", needs_review: "לבדיקה", insufficient_evidence: "אין ראיות", conflicting_evidence: "ראיות סותרות",
};
const fmt = (n: number) => n.toLocaleString("he-IL");

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" }) {
  const c = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-ink";
  return <div className="border-line bg-surface rounded-xl border px-3 py-2.5"><div className={`text-lg font-black tabular-nums ${c}`}>{fmt(value)}</div><div className="text-muted mt-0.5 text-[11px]">{label}</div></div>;
}

export function ResearchView() {
  const router = useRouter();
  const [snap, setSnap] = useState<ResearchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [ref, setRef] = useState("");
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [testPending, startTest] = useTransition();
  const [testErr, setTestErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => { setLoading(true); const v = await getResearchSnapshotAction(); if (alive) { setSnap(v); setLoading(false); } })();
    return () => { alive = false; };
  }, []);

  const runBatch = () => start(async () => {
    setMsg(null);
    try {
      const r = await runBrokerResearchAction();
      setMsg(r.ok ? (r.note ?? `מחקר הסתיים — ${r.diagnostics?.brokersProcessed ?? 0} מתווכים · ${r.diagnostics?.publicResultsFound ?? 0} תוצאות · ${r.diagnostics?.candidatesCreated ?? 0} מועמדים`) : (r.error ?? "נכשל"));
      const v = await getResearchSnapshotAction(); setSnap(v); router.refresh();
    } catch (e) {
      // Guarantees the spinner clears even if the server action rejects (e.g. a
      // platform request timeout) — otherwise the button looks stuck forever.
      setMsg(e instanceof Error ? `ההרצה נכשלה: ${e.message}` : "ההרצה נכשלה (שגיאת רשת/שרת).");
    }
  });

  const runTest = (apply: boolean) => startTest(async () => {
    setTestErr(null);
    try {
      const r = await researchSingleBrokerAction(ref.trim(), apply);
      if (!r.ok) { setTestErr(r.error ?? "נכשל"); return; }
      setReport(r.report ?? null);
      if (apply) { const v = await getResearchSnapshotAction(); setSnap(v); router.refresh(); }
    } catch (e) {
      // Never let the "חוקר…" spinner hang: surface any thrown/rejected error.
      setTestErr(e instanceof Error ? `המחקר נכשל: ${e.message}` : "המחקר נכשל (שגיאת רשת/שרת — נסה שוב).");
    }
  });

  if (loading) return <section className="border-line bg-surface text-muted rounded-2xl border p-4 text-center text-sm">טוען מחקר…</section>;
  if (!snap) return null;

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <section className="border-brand/40 bg-brand-soft/40 flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-brand-strong text-lg font-black">🔬 מחקר מתווכים לאומי</h2>
          <p className="text-muted mt-1 max-w-2xl text-[11px] leading-relaxed">מחקר תחילה ← ראיות ← הסקת AI ← שיוך. שאילתות חיפוש בטוחות נשלחות לספק חיפוש אמיתי; רק המקורות שנאספו נשלחים ל‑AI עם ציטוטים. OpenAI אינו מנוע חיפוש.</p>
        </div>
        <Button onClick={runBatch} disabled={pending || !snap.searchConfigured} className="!min-w-[200px] shrink-0">{pending ? "מריץ…" : "🚀 הפעל מחקר לאומי"}</Button>
      </section>

      {!snap.searchConfigured && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-sm font-bold text-amber-900">
          ⚠ Public web search is not configured, so broker-office research cannot run.<br />
          <span className="text-[12px] font-normal">הגדר ספק חיפוש אחד: <code>SERPAPI_API_KEY</code> / <code>TAVILY_API_KEY</code> / <code>EXA_API_KEY</code> / <code>BING_SEARCH_KEY</code> / (<code>GOOGLE_CSE_KEY</code>+<code>GOOGLE_CSE_CX</code>), וגם <code>ZONO_PUBLIC_SEARCH_ENABLED=1</code>. כרגע פעיל רק מקור המודעות (Yad2/Madlan).</span>
        </div>
      )}
      {msg && <p className="text-sm font-bold text-emerald-700">{msg}</p>}

      {/* Provider status */}
      <section className="border-line bg-card rounded-2xl border p-4">
        <h3 className="text-ink mb-2 text-sm font-black">סטטוס ספקים</h3>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {snap.providers.map((p) => (
            <span key={p.provider} className={`rounded-full px-2 py-0.5 font-bold ${p.configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {p.label}{p.configured ? " ✓" : " · לא מחובר"}
            </span>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="נחקרו" value={snap.counts.researched} />
        <Stat label="ממתינים בתור" value={snap.unresearched} tone="amber" />
        <Stat label="לבדיקה" value={snap.counts.needsReview} tone="amber" />
        <Stat label="אין ראיות" value={snap.counts.insufficient} />
        <Stat label="מועמדים שנוצרו" value={snap.counts.candidates} tone="green" />
      </div>

      {/* Single-broker test */}
      <section className="border-line bg-card rounded-2xl border p-4">
        <h3 className="text-ink mb-2 text-sm font-black">🧪 בדוק מתווך בודד</h3>
        <div className="flex flex-wrap gap-2">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="שם מתווך או broker_id (למשל: אייל שמול)"
            className="border-line bg-surface text-ink min-w-[260px] flex-1 rounded-xl border px-3 py-2 text-sm" />
          <Button variant="ghost" size="sm" onClick={() => runTest(false)} disabled={testPending || !ref.trim()}>{testPending ? "חוקר…" : "חקור (תצוגה מקדימה)"}</Button>
          {report && <Button size="sm" onClick={() => runTest(true)} disabled={testPending}>החל שיוך (Apply)</Button>}
        </div>
        {testErr && <p className="mt-2 text-sm font-bold text-rose-700">{testErr}</p>}

        {report && (
          <div className="mt-3 flex flex-col gap-3 text-[12px]">
            {report.note && <p className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-amber-800">{report.note}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink font-black">{report.dossier.brokerName}</span>
              <span className="text-muted">{report.dossier.city ?? "—"}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 font-bold">{STATUS_HE[report.dossier.status] ?? report.dossier.status}</span>
              {report.applied && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">הוחל ✓</span>}
            </div>

            <Block title={`שאילתות (${report.dossier.queries.length})`}>{report.dossier.queries.map((q, i) => <div key={i} className="text-muted">• {q}</div>)}</Block>

            <Block title="ספקים שנבדקו">{report.dossier.providers.map((p) => <span key={p.provider} className={`mr-1 inline-block rounded-full px-2 py-0.5 ${p.configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.label}{p.configured ? ` (${p.resultCount})` : " · לא מחובר"}</span>)}</Block>

            <Block title={`ראיות (${report.dossier.evidence.length})`}>
              {report.dossier.evidence.length === 0 ? <span className="text-muted">לא נמצאו ראיות.</span> :
                report.dossier.evidence.slice(0, 12).map((e, i) => (
                  <div key={i} className="border-line bg-surface rounded-lg border px-2 py-1.5">
                    <div className="text-ink font-bold">{e.provider}{e.extractedOfficeName ? ` · משרד: ${e.extractedOfficeName}` : ""}</div>
                    {e.title && <div className="text-muted truncate">{e.title}</div>}
                    {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="text-brand-strong truncate block" dir="ltr">{e.url}</a>}
                    {e.snippet && <div className="text-muted">{e.snippet}</div>}
                  </div>
                ))}
            </Block>

            {report.dossier.possibleOffices.length > 0 && (
              <Block title="משרדים אפשריים">{report.dossier.possibleOffices.map((o, i) => <div key={i} className="text-muted">• {o.officeName} ({Math.round(o.confidence)}%) — {o.sources.join(", ")}</div>)}</Block>
            )}
            {report.dossier.aiSummary && <Block title="הסקת AI (על המקורות בלבד)"><p className="text-muted leading-relaxed">{report.dossier.aiSummary}</p></Block>}
            {report.dossier.missingEvidence.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2"><div className="mb-1 font-bold text-amber-800">ראיות חסרות</div><div className="flex flex-wrap gap-1">{report.dossier.missingEvidence.map((mm, i) => <span key={i} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{mm}</span>)}</div></div>
            )}
          </div>
        )}
      </section>

      {/* Recent researched */}
      <section className="border-line bg-card rounded-2xl border p-4">
        <h3 className="text-ink mb-2 text-sm font-black">מתווכים שנחקרו לאחרונה</h3>
        {snap.recent.length === 0 ? <div className="text-muted text-xs">עדיין לא בוצע מחקר.</div> : (
          <div className="flex flex-col gap-1.5">
            {snap.recent.map((r) => (
              <div key={r.agentId} className="border-line bg-surface flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                <span className="text-ink truncate font-bold">{r.brokerName}<span className="text-muted font-normal"> · {r.city ?? "—"}</span></span>
                <span className="flex shrink-0 items-center gap-2 text-[11px]"><span className="text-muted">{r.evidenceItems} ראיות</span><span className="bg-surface rounded-full px-2 py-0.5 font-bold">{STATUS_HE[r.status] ?? r.status}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="text-ink mb-1 font-bold">{title}</div><div className="flex flex-col gap-1">{children}</div></div>;
}
