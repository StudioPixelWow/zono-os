import { getCurrentMarketHeatmap, type MarketHeatmapCell } from "@/lib/market/service";
import { MarketHeatmapView } from "./MarketHeatmapView";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  let cells: MarketHeatmapCell[] = [];
  try {
    cells = await getCurrentMarketHeatmap();
  } catch (e) {
    console.error("[market] heatmap load failed:", e);
  }
  return <MarketHeatmapView cells={cells} />;
}
