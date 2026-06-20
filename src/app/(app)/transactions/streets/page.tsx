import { getStreetsBoard } from "@/lib/transactions/service";
import { StreetsView } from "./StreetsView";

export const dynamic = "force-dynamic";

export default async function StreetsPage() {
  let board: { streets: Awaited<ReturnType<typeof getStreetsBoard>>["streets"] };
  try {
    board = await getStreetsBoard();
  } catch (e) {
    console.error("[transactions] streets load failed:", e);
    board = { streets: [] };
  }
  return <StreetsView streets={board.streets} />;
}
