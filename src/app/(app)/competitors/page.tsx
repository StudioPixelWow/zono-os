import { getCompetitorBoard } from "@/lib/competitor/service";
import { CompetitorsDashboard } from "./CompetitorsDashboard";
import { CompetitorsView } from "./CompetitorsView";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  let board;
  try {
    board = await getCompetitorBoard();
  } catch (e) {
    console.error("[competitors] load failed:", e);
    board = { cc: { total: 0, dominant: 0, growing: 0, declining: 0, opportunities: 0, avgConcentration: 0 }, competitors: [], localities: [], signals: [] };
  }
  return (
    <div className="flex flex-col gap-8">
      <CompetitorsDashboard board={board} />
      <CompetitorsView board={board} embedded />
    </div>
  );
}
