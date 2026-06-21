import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { getRecommendationMapPoints } from "@/lib/recommendations/service";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("he-IL");

export default async function RecommendationMapPage() {
  let points: Awaited<ReturnType<typeof getRecommendationMapPoints>> = [];
  try {
    points = await getRecommendationMapPoints();
  } catch (e) {
    console.error("[recommendations/map] load failed:", e);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Recommendation Map</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מפת המלצות</h1>
          <p className="text-muted mt-1 text-sm">צפיפות המלצות, ביקוש וביטחון לפי עיר/שכונה. תצוגת רשימה (מפה גרפית בהמשך).</p>
        </div>
        <Link href="/recommendations" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />חזרה למודיעין</Link>
      </div>

      {points.length === 0 ? (
        <div className="bg-card border-line rounded-[20px] border p-6 text-center">
          <p className="text-muted text-sm">אין נקודות עדיין. צור המלצות ואז לחץ ״רענן מפה״ במודיעין ההמלצות.</p>
        </div>
      ) : (
        <div className="bg-card border-line overflow-hidden rounded-[20px] border">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface text-muted text-[11px] font-bold">
              <tr>{["אזור", "המלצות", "ציון הזדמנות", "ביקוש", "ביטחון"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.id} className="border-line border-t">
                  <td className="text-ink px-3 py-2 font-semibold">{p.neighborhood_name ? `${p.city_name} · ${p.neighborhood_name}` : p.city_name ?? "—"}</td>
                  <td className="text-ink px-3 py-2 font-bold">{fmt(p.recommendation_count)}</td>
                  <td className="px-3 py-2"><Bar value={p.opportunity_score} /></td>
                  <td className="px-3 py-2"><Bar value={p.demand_score} /></td>
                  <td className={cn("px-3 py-2 text-[12px] font-bold", p.confidence_score >= 70 ? "text-success" : p.confidence_score >= 50 ? "text-warning" : "text-muted")}>{Math.round(p.confidence_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-surface h-2 w-20 overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
      <span className="text-muted text-[11px] font-bold">{Math.round(value)}</span>
    </div>
  );
}
