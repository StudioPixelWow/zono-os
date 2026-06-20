import { getMarketingBoard, type MarketingBoard } from "@/lib/marketing/service";
import { MarketingView } from "./MarketingView";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  let board: MarketingBoard;
  try {
    board = await getMarketingBoard();
  } catch (e) {
    console.error("[marketing] load failed:", e);
    board = { health: 0, communities: [], topCommunities: [], segments: [], opportunities: [], propertyDna: [] };
  }
  return <MarketingView board={board} />;
}
