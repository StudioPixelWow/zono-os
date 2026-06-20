import { getRadarBoard, type RadarBoard } from "@/lib/transactions/service";
import { RadarView } from "./RadarView";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  let board: RadarBoard;
  try {
    board = await getRadarBoard();
  } catch (e) {
    console.error("[transactions] radar load failed:", e);
    board = { alerts: [], counts: {} };
  }
  return <RadarView board={board} />;
}
