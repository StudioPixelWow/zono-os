import { getDealsBoard, type DealsBoard } from "@/lib/deals/service";
import { DealsView } from "./DealsView";
import { DealIntelligencePanel } from "@/components/broker-intelligence/DealIntelligencePanel";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  let board: DealsBoard;
  try {
    board = await getDealsBoard();
  } catch (e) {
    console.error("[deals] load failed:", e);
    board = { deals: [], pipeline: [], negotiations: [], objections: [], tasks: [], atRisk: [], upcomingClosings: [], revenue: { pipelineValue: 0, weightedRevenue: 0, expectedCommission: 0 } };
  }
  return (
    <div className="flex flex-col gap-5">
      <DealIntelligencePanel />
      <DealsView board={board} />
    </div>
  );
}
