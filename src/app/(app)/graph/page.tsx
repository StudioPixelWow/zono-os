import { getGraphBoard, type GraphBoard } from "@/lib/graph/service";
import { GraphView } from "./GraphView";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  let board: GraphBoard;
  try {
    board = await getGraphBoard();
  } catch (e) {
    console.error("[graph] load failed:", e);
    board = { cc: { nodes: 0, edges: 0, signals: 0, buyerClusters: 0, sellerClusters: 0, localities: 0 }, signals: [], localityDna: [] };
  }
  return <GraphView board={board} />;
}
