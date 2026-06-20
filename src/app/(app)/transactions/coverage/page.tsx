import { getCoverageBoard, type CoverageBoard } from "@/lib/transactions/service";
import { CoverageView } from "./CoverageView";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  let board: CoverageBoard;
  try {
    board = await getCoverageBoard();
  } catch (e) {
    console.error("[transactions] coverage load failed:", e);
    board = { targets: [], logs: [], agentCity: null, needsConfig: true, apifyConfigured: false };
  }
  return <CoverageView board={board} />;
}
