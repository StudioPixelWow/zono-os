import { getRevenueBoard, type RevenueBoard } from "@/lib/revenue/service";
import { RevenueView } from "./RevenueView";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  let board: RevenueBoard;
  try {
    board = await getRevenueBoard();
  } catch (e) {
    console.error("[revenue] load failed:", e);
    board = { profile: null, targets: [], leakage: [], opportunities: [], agents: [], localities: [], propertyTypes: [], growth: [] };
  }
  return <RevenueView board={board} />;
}
