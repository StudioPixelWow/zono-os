import { getViewingsBoard, type ViewingsBoard } from "@/lib/viewings/service";
import { ViewingsView } from "./ViewingsView";

export const dynamic = "force-dynamic";

const EMPTY: ViewingsBoard = { today: [], upcoming: [], awaitingConfirmation: [], completed: [], cancelled: [], total: 0 };

export default async function ViewingsPage() {
  let board: ViewingsBoard = EMPTY;
  try {
    board = await getViewingsBoard();
  } catch (e) {
    console.error("[viewings] load failed:", e);
  }
  return <ViewingsView board={board} />;
}
