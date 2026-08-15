"use client";
// ============================================================================
// 🔮 ZONO — Prediction Engine view (mobile-first RTL). PHASE 52.0.
// Each card shows the forecast probability + confidence, data sufficiency,
// evidence, what's missing, risk, an approval-gated action, and expiration.
// No certainty theater; nothing auto-executes.
// ============================================================================
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import type { Prediction, PredictionReport } from "@/lib/prediction-engine/types";

const SUFF_HE: Record<string, string> = { high: "נתונים גבוהים", medium: "נתונים בינוניים", low: "נתונים דלים", none: "אין נתונים" };
const SUFF_CLS: Record<string, string> = { high: "bg-success-soft text-success", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted", none: "bg-danger-soft text-danger" };
const RISK_HE: Record<string, string> = { high: "סיכון גבוה", medium: "סיכון בינוני", low: "סיכון נמוך" };
const RISK_CLS: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const TREND: Record<string, string> = { up: "↑", down: "↓", flat: "→", unknown: "•" };
const probCls = (v: number) => (v >= 70 ? "text-danger" : v >= 45 ? "text-warning" : "text-success");

function expiry(iso: string | null): string {
  if (!iso) return "";
  const days = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 86400000));
  return `תוקף ${days} ימים`;
}

export function PredictionsView({ report }: { report: PredictionReport | null }) {
  const preds = report?.predictions ?? [];
  const real = preds.filter((p) => p.probability != null).sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
  const insufficient = preds.filter((p) => p.probability == null);
  const featured = real[0] ?? null;
  const rest = real.slice(1);
  const chips = report ? [
    { label: "תחזיות פעילות", value: report.counts.total },
    { label: "ניתנות לפעולה", value: report.counts.actionable },
    { label: "נתונים גבוהים", value: report.counts.highConfidence },
  ].filter((c) => c.value > 0) : [];

  return (
    <div dir="rtl" className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 sm:px-6">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-8 text-white sm:px-9 sm:py-10">
        <div className="absolute -top-24 -left-16 -z-10 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="mb-1 text-[12px] font-bold tracking-wide text-indigo-300">ZONO · מנוע התחזיות</div>
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">מה ZONO רואה שעומד לקרות?</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-300">ZONO מנתחת את הפעילות באזור שלך ומזהה שינויים, סיכונים והזדמנויות לפני שהם הופכים לברורים — תחזיות הסתברותיות מבוססות אותות, לא ודאויות.</p>
        {chips.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {chips.map((c) => (
              <div key={c.label} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur-md">
                <div className="text-2xl font-black tabular-nums sm:text-3xl">{c.value}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-slate-300">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {!report && <p className="text-muted mt-6 text-center text-sm">טעינת התחזיות נכשלה — נסה שוב.</p>}

      {report && (
        <div className="mt-6 space-y-6">
          {featured && (
            <section>
              <h2 className="text-ink mb-3 text-[17px] font-black">התחזית החשובה ביותר כרגע</h2>
              <div className="rounded-3xl ring-2 ring-[color:var(--brand)]/25">
                <PredictionCard p={featured} featured />
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h2 className="text-ink mb-3 text-[15px] font-black">תחזיות נוספות</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {rest.map((p) => <PredictionCard key={p.kind} p={p} />)}
              </div>
            </section>
          )}

          {insufficient.length > 0 && (
            <div className="bg-card border-line rounded-[20px] border p-4">
              <div className="mb-2 flex items-center gap-2"><span className="text-muted"><Icon name="Minus" size={15} /></span><h3 className="text-ink text-sm font-extrabold">ZONO עדיין אוספת נתונים ({insufficient.length})</h3></div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {insufficient.map((p) => (
                  <div key={p.kind} className="bg-surface rounded-xl p-3">
                    <p className="text-ink text-[13px] font-bold">{p.label}</p>
                    <p className="text-muted text-[12px]">{p.outcome}</p>
                    {p.missingData[0] && <p className="text-muted mt-0.5 text-[11px]">חסר: {p.missingData[0]}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.notes.map((n, i) => <p key={i} className="text-muted text-[11px] leading-relaxed">🔒 {n}</p>)}
        </div>
      )}
    </div>
  );
}

function PredictionCard({ p, featured = false }: { p: Prediction; featured?: boolean }) {
  return (
    <div className={cn("bg-card border-line h-full rounded-[20px] border", featured ? "p-5 sm:p-6" : "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-ink font-extrabold", featured ? "text-lg" : "text-sm")}>{p.label}</p>
          <p className={cn("text-muted mt-0.5", featured ? "text-[13px]" : "text-[12px]")}>{p.outcome}</p>
        </div>
        <div className="shrink-0 text-left">
          <div className={cn("font-black", featured ? "text-4xl" : "text-2xl", probCls(p.probability ?? 0))}>{p.probability}% <span className="text-muted text-sm font-bold">{TREND[p.trend]}</span></div>
          <div className="text-muted text-[10px] font-bold">רמת ביטחון {p.confidence}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", SUFF_CLS[p.dataSufficiency])}>{SUFF_HE[p.dataSufficiency]}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", RISK_CLS[p.risk.level])}>{RISK_HE[p.risk.level]}</span>
        {p.expiresAt && <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">{expiry(p.expiresAt)}</span>}
      </div>

      {p.subjects.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.subjects.map((s, i) => <Link key={i} href={s.href} className="bg-surface text-ink hover:border-brand-light border-line rounded-full border px-2.5 py-1 text-[11px] font-bold">{s.name}{s.score != null ? ` · ${s.score}` : ""}</Link>)}
        </div>
      )}

      {p.evidence.length > 0 && <p className="text-muted mt-2 text-[11px]">📎 {p.evidence.join(" · ")}</p>}
      {p.missingData.length > 0 && <p className="text-muted mt-1 text-[11px]">חסר לחיזוי מדויק: {p.missingData.join(" · ")}</p>}
      <p className="text-muted mt-1 text-[11px]">⚠️ {p.risk.note}</p>

      {p.action && (
        <div className="mt-2 flex items-center gap-2">
          {p.action.href ? <Link href={p.action.href} className="bg-brand-soft text-brand inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[12px] font-bold">{p.action.label} ↗</Link> : <span className="text-brand text-[12px] font-bold">{p.action.label}</span>}
          {p.action.requiresApproval && <span className="text-muted text-[10px] font-bold">דורש אישור</span>}
        </div>
      )}
    </div>
  );
}
