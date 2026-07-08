import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { getRecommendationMapPoints } from "@/lib/recommendations/service";
import { HomeHeatmapSection } from "@/components/dashboard-home/components/HomeHeatmapSection";

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
          <p className="text-brand text-xs font-bold">ZONO · אזורי ביקוש</p>
          <h1 className="text-ink mt-1 text-2xl font-black">אזורי ביקוש</h1>
          <p className="text-muted mt-1 text-sm">מפת נכסים חיה + דירוג אזורי ביקוש, הזדמנות וביטחון לפי עיר/שכונה.</p>
        </div>
        <Link href="/recommendations" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />חזרה למודיעין</Link>
      </div>

      {/* Live property map — reuses the shared self-fetching heatmap so this
          "map" screen actually shows a map (real internal + external points). */}
      <HomeHeatmapSection />

      {points.length === 0 ? (
        <div className="bg-card border-line rounded-[20px] border p-8 text-center">
          <div className="bg-brand-soft text-brand mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"><Icon name="MapPin" size={26} /></div>
          <p className="text-ink text-lg font-extrabold">אין עדיין דירוג אזורי ביקוש</p>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">צור המלצות ואז לחץ ״רענן״ במודיעין ההמלצות — האזורים החמים יופיעו כאן מדורגים לפי ביקוש והזדמנות.</p>
          <Link href="/recommendations" className="btn-zono-primary mt-4 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white">פתח מודיעין המלצות</Link>
        </div>
      ) : (
        <div className="bg-card border-line overflow-hidden rounded-[20px] border">
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-ink text-sm font-black">🔥 אזורי ביקוש מדורגים</h2>
            <span className="text-muted text-[12px] font-bold">{points.length} אזורים</span>
          </div>
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
