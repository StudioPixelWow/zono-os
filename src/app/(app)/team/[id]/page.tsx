import { notFound } from "next/navigation";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getAgentTeamProfile } from "@/lib/team/service";

export const dynamic = "force-dynamic";
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");
const TIER_LABEL: Record<string, string> = { elite: "מצטיין", strong: "חזק", stable: "יציב", declining: "בירידה", critical: "קריטי" };
const TREND_LABEL: Record<string, string> = { improving: "במגמת שיפור", flat: "יציב", declining: "במגמת ירידה" };

export default async function AgentTeamProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail = null;
  try { detail = await getAgentTeamProfile(id); } catch (e) { console.error("[team] profile failed:", e); }
  if (!detail) notFound();
  const p = detail.profile;

  const scores: { label: string; v: number }[] = [
    { label: "ביצועים", v: p.performance_score }, { label: "הכנסות", v: p.revenue_score }, { label: "המרה", v: p.conversion_score },
    { label: "פעילות", v: p.activity_score }, { label: "תגובה", v: p.responsiveness_score }, { label: "עומס (קיבולת)", v: p.workload_score },
    { label: "צנרת", v: p.forecast_score }, { label: "שביעות רצון", v: p.client_satisfaction_score }, { label: "אמינות", v: p.reliability_score }, { label: "צורך בליווי", v: p.coaching_score },
  ];
  const strengths = (p.strengths as string[] | null) ?? [];
  const weaknesses = (p.weaknesses as string[] | null) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/team" className="text-muted hover:text-brand flex items-center gap-1 text-sm font-bold"><Icon name="ArrowLeft" size={15} /> חזרה למודיעין צוות</Link>

      <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-ink text-2xl font-black">{p.name}</h1>
            <p className="text-muted mt-1 text-sm">{TIER_LABEL[p.performance_tier]} · {TREND_LABEL[p.growth_trend]} · {p.won_deals} עסקאות שנסגרו</p>
          </div>
          <div className="text-end">
            <p className={cn("text-3xl font-black", tone(p.performance_score))}>{p.performance_score}</p>
            <p className="text-muted text-[11px] font-bold">ציון ביצועים</p>
          </div>
        </div>
        <p className="text-ink mt-3 text-sm">{p.ai_summary}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {scores.map((s) => <div key={s.label} className="bg-surface rounded-xl p-2.5"><p className="text-muted text-[11px] font-bold">{s.label}</p><p className={cn("text-xl font-black", tone(s.v))}>{s.v}</p></div>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="הכנסות" value={formatShekels(p.total_revenue)} icon="TrendingUp" tone="text-success" />
        <Stat label="צנרת צפויה" value={formatShekels(p.forecast_revenue)} icon="Building2" />
        <Stat label="זמן סגירה ממוצע" value={p.avg_days_to_close != null ? `${p.avg_days_to_close} ימים` : "—"} icon="Clock" />
        <Stat label="עסקאות אבודות" value={String(p.lost_deals)} icon="AlertTriangle" tone="text-danger" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="bg-card border-line rounded-[22px] border p-5">
          <h3 className="text-ink mb-2 text-sm font-extrabold">חוזקות וחולשות</h3>
          <div className="flex flex-wrap gap-1.5">{strengths.map((s) => <span key={s} className="bg-success-soft text-success rounded-full px-2.5 py-1 text-[11px] font-bold">✓ {s}</span>)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">{weaknesses.map((s) => <span key={s} className="bg-warning-soft text-warning rounded-full px-2.5 py-1 text-[11px] font-bold">△ {s}</span>)}</div>
          <div className="bg-surface mt-3 rounded-xl p-3"><p className="text-ink text-xs font-bold">תוכנית צמיחה</p><p className="text-muted mt-1 text-[11px]">{p.ai_growth_plan}</p></div>
          <div className="bg-surface mt-2 rounded-xl p-3"><p className="text-ink text-xs font-bold">תוכנית ליווי</p><p className="text-muted mt-1 text-[11px]">{p.ai_coaching_plan}</p></div>
        </div>

        <div className="bg-card border-line rounded-[22px] border p-5">
          <h3 className="text-ink mb-2 text-sm font-extrabold">סיגנלי ליווי</h3>
          {detail.coaching.length === 0 ? <p className="text-muted text-sm">אין סיגנלים פתוחים ✓</p> : (
            <ul className="flex flex-col gap-2">{detail.coaching.map((s) => (
              <li key={s.id} className="border-line rounded-xl border p-2 text-sm"><p className="text-ink font-semibold">{s.title}</p><p className="text-muted text-[11px]">{s.recommendation}</p></li>
            ))}</ul>
          )}
        </div>

        <div className="bg-card border-line rounded-[22px] border p-5">
          <h3 className="text-ink mb-2 text-sm font-extrabold">מומחיות אזורית</h3>
          {detail.localities.length === 0 ? <p className="text-muted text-sm">—</p> : (
            <table className="w-full text-start text-sm"><thead className="text-muted border-line border-b text-xs"><tr>{["אזור", "עסקאות", "הכנסה", "המרה"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-bold">{h}</th>)}</tr></thead>
              <tbody>{detail.localities.map((l) => <tr key={l.locality} className="border-line border-b last:border-0"><td className="text-ink px-2 py-1.5 font-semibold">{l.locality}</td><td className="text-muted px-2 py-1.5">{l.deals}</td><td className="text-muted px-2 py-1.5">{formatShekels(l.revenue)}</td><td className="text-muted px-2 py-1.5">{l.conversion}%</td></tr>)}</tbody>
            </table>
          )}
        </div>

        <div className="bg-card border-line rounded-[22px] border p-5">
          <h3 className="text-ink mb-2 text-sm font-extrabold">מומחיות לפי סוג נכס</h3>
          {detail.propertyTypes.length === 0 ? <p className="text-muted text-sm">—</p> : (
            <ul className="flex flex-col gap-1.5">{detail.propertyTypes.map((t) => (
              <li key={t.type} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink font-semibold">{t.type}</span>
                <span className="text-muted text-[11px]">{t.deals} עסקאות · המרה {t.conversion}%</span>
                <span className="text-success shrink-0 text-[11px] font-bold">{formatShekels(t.revenue)}</span>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: string; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
