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

  return (
    <div className="flex flex-col gap-8">
      {geo && <GeoIntelligenceView areas={geo.areas} insights={geo.insights} dataMode={geo.dataMode} notes={geo.notes} />}
      <div>
        <h2 className="text-ink mb-3 text-lg font-black">פירוט אזורים</h2>
        <MarketHeatmapView cells={cells} />
      </div>
    </div>
  );
}
