import { getForecastBoard, type ForecastBoard } from "@/lib/forecast/service";
import { ForecastView } from "./ForecastView";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  let board: ForecastBoard;
  try {
    board = await getForecastBoard();
  } catch (e) {
    console.error("[forecast] load failed:", e);
    board = { snapshot: null, confidence: 0, likely: [], atRisk: [], intervention: [], signals: [] };
  }
  return <ForecastView board={board} />;
}
