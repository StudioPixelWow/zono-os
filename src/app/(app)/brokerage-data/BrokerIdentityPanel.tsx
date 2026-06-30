"use client";
// ============================================================================
// 🧬 Broker Identity panel (Phase 26.12) — shown inside the broker DNA drawer.
// Resolved office · confidence · evidence sources · public providers (skipped) ·
// observed listings · AI reasoning · alternative candidates · missing evidence.
// Read-only; lazy-loads via getBrokerIdentityAction; "resolve now" recomputes.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { getBrokerIdentityAction, resolveBrokerIdentityAction, type BrokerIdentityView } from "@/lib/brokerage-data/actions";

const STATUS_HE: Record<string, { label: string; tone: string }> = {
  resolved: { label: "שויך למשרד", tone: "bg-emerald-50 text-emerald-700" },
  needs_review: { label: "לבדיקה", tone: "bg-amber-50 text-amber-700" },
  conflicting_evidence: { label: "ראיות סותרות", tone: "bg-rose-50 text-rose-700" },
  insufficient_evidence: { label: "אין ראיות מספיקות", tone: "bg-slate-100 text-slate-600" },
};
const SOURCE_HE: Record<string, string> = {
  google_business: "Google Business", google_maps: "Google Maps", facebook: "Facebook", linkedin: "LinkedIn",
  yad2: "יד2", madlan: "מדלן", official_website: "אתר רשמי", observed_listing: "מודעה שנצפתה",
  shared_phone: "טלפון משותף", shared_domain: "דומיין משותף", ai_reasoning: "הסקת AI",
};

export function BrokerIdentityPanel({ agentId }: { agentId: string }) {
  const [view, setView] = useState<BrokerIdentityView | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const v = await getBrokerIdentityAction(agentId);
      if (alive) { setView(v); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [agentId]);

  const resolveNow = () => start(async () => { await resolveBrokerIdentityAction(agentId); const v = await getBrokerIdentityAction(agentId); setView(v); });

  if (loading) return <section className="border-line bg-surface rounded-2xl border p-3 text-center text-xs text-muted">טוען זהות מתווך…</section>;
  const r = view?.stored;
  const st = r ? STATUS_HE[r.status] ?? STATUS_HE.insufficient_evidence : null;

  return (
    <section className="border-brand/30 bg-brand-soft/30 flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-brand-strong text-sm font-black">🧬 זהות מתווך → משרד</h3>
        <button onClick={resolveNow} disabled={pending} className="border-line bg-surface text-ink rounded-full border px-3 py-1 text-[11px] font-bold disabled:opacity-50">
          {pending ? "מחשב…" : "חשב שיוך"}
        </button>
      </div>

      {!r ? (
        <p className="text-muted text-xs">טרם חושב שיוך משרד למתווך זה. לחץ &quot;חשב שיוך&quot; כדי לאסוף ראיות ולהריץ את מנוע הזהות.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {st && <span className={`rounded-full px-2 py-0.5 font-bold ${st.tone}`}>{st.label}</span>}
            <span className="text-ink font-black">{r.resolvedOfficeName ?? "משרד לא נקבע"}</span>
            <span className="text-muted tabular-nums">ביטחון {Math.round(r.confidence)}%</span>
          </div>
          {r.why && <p className="text-muted text-[11px] leading-relaxed">{r.why}</p>}

          {r.evidence.length > 0 && (
            <div>
              <div className="text-ink mb-1 text-[11px] font-bold">ראיות ({r.evidence.length})</div>
              <div className="flex flex-col gap-1.5">
                {r.evidence.map((e, i) => (
                  <div key={i} className="border-line bg-surface flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]">
                    <span className="min-w-0"><span className="text-ink font-bold">{SOURCE_HE[e.source] ?? e.source}</span>{e.officeName && <span className="text-muted"> · {e.officeName}</span>}<span className="text-muted block truncate">{e.reason}</span></span>
                    <span className="text-muted shrink-0 tabular-nums">{e.weight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {r.providers.length > 0 && (
            <div className="text-[11px]">
              <div className="text-ink mb-1 font-bold">מקורות ציבוריים</div>
              <div className="flex flex-wrap gap-1.5">
                {r.providers.map((p) => (
                  <span key={p.provider} className={`rounded-full px-2 py-0.5 ${p.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {SOURCE_HE[p.provider] ?? p.provider}{p.enabled ? "" : " · לא מחובר"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {r.aiReasoning && (
            <div className="text-[11px]"><div className="text-ink mb-1 font-bold">הסקת AI</div><p className="text-muted leading-relaxed">{r.aiReasoning}</p></div>
          )}

          {r.alternatives.length > 0 && (
            <div className="text-[11px]">
              <div className="text-ink mb-1 font-bold">מועמדים חלופיים</div>
              <div className="flex flex-col gap-1">
                {r.alternatives.map((a, i) => <div key={i} className="text-muted">· {a.officeName} ({Math.round(a.score)}) — {a.rejectedReason}</div>)}
              </div>
            </div>
          )}

          {r.missingEvidence.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-[11px]">
              <div className="mb-1 font-bold text-amber-800">ראיות חסרות לשיוך ודאי</div>
              <div className="flex flex-wrap gap-1.5">{r.missingEvidence.map((mm, i) => <span key={i} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{mm}</span>)}</div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
