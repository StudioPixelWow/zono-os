import { getDistributionBoard, type DistributionBoard } from "@/lib/distribution/service";
import { DistributionView } from "./DistributionView";

export const dynamic = "force-dynamic";

export default async function DistributionPage() {
  let board: DistributionBoard;
  try {
    board = await getDistributionBoard();
  } catch (e) {
    console.error("[distribution] load failed:", e);
    board = { communities: [], reviewQueue: [], approved: [], opportunities: [], plans: [] };
  }
  return <DistributionView board={board} />;
}
