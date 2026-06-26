import { Card } from "@/components/ui/Card";
import type { ResolutionKpis } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

/** Header KPIs: Pending · Approved · Rejected · Merged · Avg Confidence · AI Accuracy. */
export function ResolutionStats({ kpis }: { kpis: ResolutionKpis }) {
  const items: { label: string; value: string; accent?: boolean }[] = [
    { label: "ממתינים", value: String(kpis.pending), accent: true },
    { label: "אושרו", value: String(kpis.approved) },
    { label: "נדחו", value: String(kpis.rejected) },
    { label: "מוזגו", value: String(kpis.merged) },
    { label: "ביטחון ממוצע", value: pct(kpis.avgConfidence) },
    { label: "דיוק AI", value: pct(kpis.aiAccuracy), accent: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((k) => (
        <Card key={k.label} padding="sm" className={k.accent ? "border-brand/30 bg-brand-soft/30" : ""}>
          <div className="text-muted text-xs font-semibold">{k.label}</div>
          <div className={`mt-1 text-2xl font-extrabold ${k.accent ? "text-brand-strong" : "text-ink"}`}>{k.value}</div>
        </Card>
      ))}
    </div>
  );
}
