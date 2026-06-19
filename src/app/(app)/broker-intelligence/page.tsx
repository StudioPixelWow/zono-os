import { getBrokerBoard, type BrokerBoard } from "@/lib/broker/service";
import { BrokerIntelligenceView } from "./BrokerIntelligenceView";

export const dynamic = "force-dynamic";

export default async function BrokerIntelligencePage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams;
  let board: BrokerBoard = { profiles: [], pendingReviews: [], counts: { profiles: 0, pending: 0, verified: 0 } };
  try {
    board = await getBrokerBoard(city);
  } catch (e) {
    console.error("[broker] board load failed:", e);
  }
  return <BrokerIntelligenceView board={board} cityFilter={city ?? ""} />;
}
