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

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO · מנוע התחזיות</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🔮 תחזיות</h1>
        <p className="text-muted mt-1 text-sm leading-relaxed">תחזיות הסתברותיות מבוססות אותות קיימים — נטישת מוכרים, סגירת קונים, המרת לידים, מהירות מכירה, שחיקת קמפיינים, עומס, מעקבים, עסקאות וטריטוריה. לא ודאויות.</p>
      </div>

      {report && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="תחזיות" value={report.counts.total} />
          <Stat label="ניתנות לפעולה" value={report.counts.actionable} />
          <Stat label="נתונים גבוהים" value={report.counts.highConfidence} />
        </div>
      )}

      {!report && <p className="text-muted mt-6 text-center text-sm">טעינת התחזיות נכשלה — נסה שוב.</p>}

      {report && (
        <div className="mt-4 space-y-3">
          {real.map((p) => <PredictionCard key={p.kind} p={p} />)}

          {insufficient.length > 0 && (
            <div className="bg-card border-line rounded-[20px] border p-4">
              <div className="mb-2 flex items-center gap-2"><span className="text-muted"><Icon name="Minus" size={15} /></span><h3 className="text-ink text-sm font-extrabold">אין עדיין מספיק נתונים ({insufficient.length})</h3></div>
              <div className="space-y-2">
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

function PredictionCard({ p }: { p: Prediction }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-sm font-extrabold">{p.label}</p>
          <p className="text-muted mt-0.5 text-[12px]">{p.outcome}</p>
        </div>
        <div className="shrink-0 text-left">
          <div className={cn("text-2xl font-black", probCls(p.probability ?? 0))}>{p.probability}% <span className="text-muted text-sm font-bold">{TREND[p.trend]}</span></div>
          <div className="text-muted text-[10px] font-bold">ביטחון {p.confidence}</div>
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

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-card border-line rounded-2xl border p-3 text-center"><div className="text-brand text-xl font-black">{value}</div><div className="text-muted text-[11px] font-bold">{label}</div></div>;
}
