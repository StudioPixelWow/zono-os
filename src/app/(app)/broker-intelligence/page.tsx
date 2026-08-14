import { getBrokerBoard, type BrokerBoard } from "@/lib/broker/service";
import { BrokerIntelligenceView } from "./BrokerIntelligenceView";

export const dynamic = "force-dynamic";

export default async function BrokerIntelligencePage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams;
  // Broker profiles are ALREADY org-scoped — every detected broker belongs to the
  // office's own city(ies). We ALWAYS load them all and NEVER server-filter by a
  // city string: scraped brokers store the city in English ("Rehovot"), so a
  // Hebrew "רחובות" filter (from a nav link or the office city) would hide every
  // broker — the exact "0 brokers" bug. The in-view search box filters client-side.
  let board: BrokerBoard = { profiles: [], pendingReviews: [], counts: { profiles: 0, pending: 0, verified: 0 } };
  try {
    board = await getBrokerBoard();
  } catch (e) {
    console.error("[broker] board load failed:", e);
  }
  return <BrokerIntelligenceView board={board} cityFilter={city ?? ""} />;
}
