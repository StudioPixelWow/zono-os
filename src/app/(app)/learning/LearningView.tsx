"use client";
// ============================================================================
// 🧬 ZONO — Self-Learning AI view (mobile-first RTL). PHASE 54.0.
// Per-dimension winners/losers with sample size, success rate, confidence and
// status (learned / emerging / inconclusive / insufficient / stale). Advisory
// recommendations up top. Nothing auto-executes.
// ============================================================================
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { STATUS_HE, type LearnedPattern, type LearningReport, type DimensionLearning } from "@/lib/self-learning/types";

const STATUS_CLS: Record<string, string> = {
  learned: "bg-success-soft text-success", emerging: "bg-brand-soft text-brand", inconclusive: "bg-surface text-muted",
  insufficient: "bg-surface text-muted", stale: "bg-warning-soft text-warning",
};
const DIR_ICON: Record<string, string> = { boost: "TrendingUp", caution: "AlertTriangle", none: "Minus" };
const rateCls = (v: number) => (v >= 65 ? "text-success" : v <= 35 ? "text-danger" : "text-warning");

export function LearningView({ report }: { report: LearningReport | null }) {
  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO · למידה עצמית</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🧬 מה למדנו</h1>
        <p className="text-muted mt-1 text-sm leading-relaxed">המערכת לומדת מתוצאות אמת אילו זוויות קופי, קבוצות, שעות ואזורים עובדים — עם ספי חזרתיות וביטחון, מניעת דפוסי-שווא וסימון ראיות ישנות. המלצות מייעצות בלבד.</p>
      </div>

      {!report && <p className="text-muted mt-6 text-center text-sm">טעינת הלמידה נכשלה — נסה שוב.</p>}

      {report && !report.hasData && (
        <div className="bg-card border-line mt-4 flex flex-col items-center gap-2 rounded-[20px] border p-8 text-center">
          <span className="bg-surface grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Sparkles" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין מספיק תוצאות ללמידה</p>
          <p className="text-muted max-w-sm text-sm">{report.notes[0]}</p>
        </div>
      )}

      {report && report.hasData && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="אותות" value={report.totals.signals} />
            <Stat label="נלמדו" value={report.totals.learned} />
            <Stat label="מיושנים" value={report.totals.stale} />
          </div>

          {/* Advisory recommendations */}
          {report.recommendations.length > 0 && (
            <div className="bg-card border-line rounded-[20px] border p-4">
              <div className="mb-3 flex items-center gap-2"><span className="text-brand"><Icon name="Sparkles" size={16} /></span><h2 className="text-ink text-sm font-extrabold">המלצות מייעצות</h2></div>
              <div className="space-y-2">
                {report.recommendations.slice(0, 8).map((r, i) => (
                  <div key={i} className="bg-surface flex items-start justify-between gap-2 rounded-xl p-3">
                    <div className="min-w-0">
                      <p className="text-ink text-[13px] font-bold"><span className={cn("me-1", r.direction === "boost" ? "text-success" : "text-warning")}><Icon name={DIR_ICON[r.direction]} size={12} /></span>{r.text}</p>
                      <p className="text-muted text-[11px]">{r.dimensionHe} · ביטחון {r.confidence}</p>
                    </div>
                    {r.targetHref && <Link href={r.targetHref} className="text-brand-strong shrink-0 text-[11px] font-bold">פתח ↗</Link>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-dimension */}
          {report.dimensions.filter((d) => d.patterns.length > 0).map((d) => <DimensionCard key={d.dimension} d={d} />)}

          {report.notes.map((n, i) => <p key={i} className="text-muted text-[11px] leading-relaxed">🔒 {n}</p>)}
        </div>
      )}
    </div>
  );
}

function DimensionCard({ d }: { d: DimensionLearning }) {
  const shown = d.patterns.slice(0, 6);
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-ink text-sm font-extrabold">{d.dimensionHe}</h3>
        {d.learnedCount > 0 && <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[11px] font-bold">{d.learnedCount} נלמדו</span>}
      </div>
      <div className="space-y-2">{shown.map((p) => <PatternRow key={p.value} p={p} />)}</div>
    </div>
  );
}

function PatternRow({ p }: { p: LearnedPattern }) {
  return (
    <div className="bg-surface rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-[13px] font-bold">{p.label}</p>
          <p className="text-muted text-[11px]">{p.successes}/{p.sample} הצלחות · ביטחון {p.confidence}{p.recencyDays != null ? ` · לפני ${p.recencyDays} ימים` : ""}</p>
        </div>
        <div className="shrink-0 text-left">
          <div className={cn("text-lg font-black", rateCls(p.successRate))}>{p.successRate}%</div>
          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold", STATUS_CLS[p.status])}>{STATUS_HE[p.status]}</span>
        </div>
      </div>
      {(p.status === "learned" || p.status === "emerging") && p.direction !== "none" && (
        <p className={cn("mt-1 text-[11px] font-semibold", p.direction === "boost" ? "text-success" : "text-warning")}>{p.recommendation}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-card border-line rounded-2xl border p-3 text-center"><div className="text-brand text-xl font-black">{value}</div><div className="text-muted text-[11px] font-bold">{label}</div></div>;
}
