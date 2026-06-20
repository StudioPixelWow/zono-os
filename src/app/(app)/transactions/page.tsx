import { getTransactionsBoard, type TransactionsBoard } from "@/lib/transactions/service";
import { TransactionsView } from "./TransactionsView";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  let board: TransactionsBoard;
  try {
    board = await getTransactionsBoard();
  } catch (e) {
    console.error("[transactions] load failed:", e);
    board = { transactions: [], total: 0, cities: [], neighborhoods: [], stats: { count: 0, avgPpsqm: null, medianPpsqm: null, avgDeal: null }, coverageConfigured: false, needsConfig: true, agentCity: null, apifyConfigured: false };
  }
  return <TransactionsView board={board} />;
}
