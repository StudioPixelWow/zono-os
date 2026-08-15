import { getCurrentMarketHeatmap, type MarketHeatmapCell } from "@/lib/market/service";
import { getGeoIntelligence } from "@/lib/geo-intelligence";
import { MarketHeatmapView } from "./MarketHeatmapView";
import { GeoIntelligenceView } from "@/components/geo-intelligence/GeoIntelligenceView";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  let cells: MarketHeatmapCell[] = [];
  try {
    cells = await getCurrentMarketHeatmap();
  } catch (e) {
    console.error("[market] heatmap load failed:", e);
  }
  const geo = await getGeoIntelligence().catch(() => null);

  // Honest page-level signals — only surfaced when they actually have a value.
  const sum = (fn: (c: MarketHeatmapCell) => number | null | undefined) =>
    cells.reduce((acc, c) => acc + (fn(c) ?? 0), 0);
  const chips = [
    { label: "אזורי פעילות", value: cells.length },
    { label: "מודעות חיצוניות", value: sum((c) => c.externalListings) },
    { label: "נכסים פנימיים", value: sum((c) => c.internalProperties) },
    { label: "הזדמנויות חמות", value: cells.filter((c) => c.opportunity >= 70).length },
  ].filter((c) => c.value > 0);

  return (
    <div dir="rtl" className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 sm:px-6">
      {/* ── HERO — market pulse ──────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-8 text-white sm:px-9 sm:py-10">
        <div className="absolute -top-24 -left-16 -z-10 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="mb-1 text-[12px] font-bold tracking-wide text-indigo-300">ZONO · מודיעין שוק</div>
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">מפת השוק שלך</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-300">איפה יקר, איפה יש ביקוש, איפה מעט היצע ואיפה כדאי לפעול — תמונת שוק חיה לכל אזורי הפעילות שלך, מנתוני המודעות, הקונים והנכסים שלך.</p>
        {chips.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {chips.map((c) => (
              <div key={c.label} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur-md">
                <div className="text-2xl font-black tabular-nums sm:text-3xl">{c.value.toLocaleString("he-IL")}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-slate-300">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 flex flex-col gap-8">
        {geo && <GeoIntelligenceView areas={geo.areas} insights={geo.insights} dataMode={geo.dataMode} notes={geo.notes} />}
        <section>
          <h2 className="text-ink mb-3 text-lg font-black">פירוט אזורים</h2>
          <MarketHeatmapView cells={cells} />
        </section>
      </div>
    </div>
  );
}
