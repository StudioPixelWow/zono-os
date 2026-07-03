// ============================================================================
// 🗺️ ZONO — Geo Intelligence — server service. 32.4.
// REUSES the existing Market Intelligence heatmap (getCurrentMarketHeatmap) and
// maps each real locality snapshot into a multi-metric GeoArea. When the org has
// no snapshots yet, falls back to structured, clearly-labelled mock so the Smart
// Map still works visually. Does not modify the market engine or the shared map.
// ============================================================================
import "server-only";
import { getCurrentMarketHeatmap } from "@/lib/market/service";
import { cellToArea, globalInsights, type MarketCellInput } from "./derive";
import { generateMockAreas } from "./mock";
import { HEATMAP_LAYERS } from "./layers";
import type { GeoIntelligence, GeoArea } from "./types";

export async function getGeoIntelligence(): Promise<GeoIntelligence> {
  let areas: GeoArea[] = [];
  let dataMode: GeoIntelligence["dataMode"] = "mock";
  const notes: string[] = [];

  try {
    const cells = await getCurrentMarketHeatmap();
    if (cells.length > 0) {
      areas = (cells as MarketCellInput[]).map(cellToArea);
      dataMode = "partial"; // real aggregates + evidence-based derived layers
      notes.push("נתוני מחיר, ביקוש, היצע, עסקאות ובלעדיות מבוססים על נתוני השוק שלך. חלק מהשכבות (זמן מכירה, עליית מחירים, ROI לפרסום, פעילות משקיעים) מוערכות מתוך אותם אותות ומסומנות בהתאם.");
    }
  } catch {
    notes.push("לא ניתן לטעון את נתוני השוק — מוצגים נתוני הדגמה.");
  }

  if (areas.length === 0) {
    areas = generateMockAreas();
    dataMode = "mock";
    notes.push("אין עדיין נתוני שוק בארגון — מוצגת מפת הדגמה מסודרת. חשבו מדדי שוק כדי לראות נתונים אמיתיים.");
  }

  return {
    version: "32.4",
    generatedAt: new Date().toISOString(),
    areas,
    insights: globalInsights(areas),
    dataMode,
    notes,
  };
}

export { HEATMAP_LAYERS };
