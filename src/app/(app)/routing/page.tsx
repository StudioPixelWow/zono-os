import { getRoutingBoard, type RoutingBoard } from "@/lib/routing/service";
import { RoutingView } from "./RoutingView";

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  let board: RoutingBoard;
  try {
    board = await getRoutingBoard();
  } catch (e) {
    console.error("[routing] load failed:", e);
    board = { cc: { incoming: 0, queue: 0, recommended: 0, assignedToday: 0, routingAccuracy: 0, overloaded: 0 }, twins: [], incoming: [], territory: [], signals: [] };
  }
  return <RoutingView board={board} />;
}
