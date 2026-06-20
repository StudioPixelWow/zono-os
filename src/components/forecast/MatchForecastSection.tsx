import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getMatchForecast } from "@/lib/forecast/service";

const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

/** Forecast panel for a match (server component). */
export async function MatchForecastSection({ matchId }: { matchId: string }) {
  let f;
  try { f = await getMatchForecast(matchId); } catch (e) { console.error("[forecast] match panel failed:", e); return null; }
  if (!f) return null;

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="TrendingUp" size={16} /></span>
        <h3 className="text-ink text-sm font-extrabold">תחזית עסקה</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="סיכוי סגירה" value={`${f.closing_probability}%`} tone={tone(f.closing_probability)} />
        <Field label="צפי סגירה" value={fmtDate(f.expected_close_date)} />
        <Field label="הכנסה משוקללת" value={formatShekels(f.probability_weighted_revenue)} tone="text-success" />
        <Field label="עמלה צפויה" value={f.estimated_commission ? formatShekels(f.estimated_commission) : "—"} />
        <Field label="בריאות" value={String(f.deal_health_score)} tone={tone(f.deal_health_score)} />
        <Field label="סיכון" value={String(f.deal_risk_score)} tone={f.deal_risk_score >= 60 ? "text-danger" : "text-muted"} />
        <Field label="דחיפות" value={String(f.urgency_score)} tone={tone(f.urgency_score)} />
        <Field label="ביטחון" value={`${f.confidence_score}%`} />
      </div>
      {f.primary_blocker && <p className="text-danger mt-3 text-xs font-bold">חסם: {f.primary_blocker}</p>}
      <div className="bg-brand-soft mt-2 rounded-xl p-3">
        <p className="text-brand-strong flex items-center gap-1.5 text-sm font-bold"><Icon name="Sparkles" size={15} /> פעולה מומלצת</p>
        <p className="text-ink mt-1 text-sm">{f.next_best_action}</p>
        <p className="text-muted mt-1 text-[11px]">{f.ai_recommendation_summary}</p>
      </div>
    </div>
  );
}

function Field({ label, value, tone: t }: { label: string; value: string; tone?: string }) {
  return <div className="bg-surface rounded-xl p-2.5"><p className="text-muted text-[11px] font-bold">{label}</p><p className={cn("text-ink text-sm font-bold", t)}>{value}</p></div>;
}
