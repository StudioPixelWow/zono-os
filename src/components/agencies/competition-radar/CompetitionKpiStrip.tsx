import { Card } from "@/components/ui/Card";
import type { RadarOverview } from "@/lib/agencies/ui/competitionRadarFormat";

interface Kpi { label: string; value: number; hint: string; accent?: boolean }

/** Six headline metrics for the competition radar. Real counts only. */
export function CompetitionKpiStrip({ overview }: { overview: RadarOverview }) {
  const kpis: Kpi[] = [
    { label: "משרדים מזוהים", value: overview.agencies, hint: "מתחרים שזוהו באזורי הפעילות" },
    { label: "מתווכים משויכים", value: overview.agentsLinked, hint: "אנשי מקצוע מקושרים למשרדים" },
    { label: "אזורי פעילות", value: overview.territories, hint: "שכונות וערים במעקב" },
    { label: "אותות פעילים", value: overview.activeSignals, hint: "שינויים ותנועות שזוהו" },
    { label: "מתחרים בסיכון גבוה", value: overview.highThreat, hint: "ציון איום ≥ 70", accent: true },
    { label: "הזדמנויות אזוריות", value: overview.opportunities, hint: "פערים לניצול", accent: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {kpis.map((k) => (
        <Card key={k.label} padding="sm" className={k.accent ? "border-brand/30 bg-brand-soft/30" : ""}>
          <div className="text-muted text-xs font-semibold">{k.label}</div>
          <div className={`mt-1 text-2xl font-extrabold ${k.accent ? "text-brand-strong" : "text-ink"}`}>{k.value}</div>
          <div className="text-muted/80 mt-0.5 text-[11px] leading-tight">{k.hint}</div>
        </Card>
      ))}
    </div>
  );
}
