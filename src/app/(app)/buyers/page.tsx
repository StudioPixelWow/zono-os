import { queryBuyersBoard, type BuyersBoard } from "@/lib/buyers/board-query";
import { BuyersWorkspace } from "./components/BuyersWorkspace";
import { BuyerIntelligencePanel } from "@/components/broker-intelligence/BuyerIntelligencePanel";

export const dynamic = "force-dynamic";

/**
 * Buyers command center. Scope + insight/KPI compute run on the SERVER
 * (queryBuyersBoard, bounded + RLS-scoped); the client workspace drives all
 * filter / sort / page / view / open state through the URL and paginates the
 * table over the computed set. Aggregate panels (KPIs, cockpit, AI groups)
 * summarize the whole org, so they receive the full server-computed insights.
 */
export default async function BuyersPage() {
  let board: BuyersBoard | null = null;
  let error = false;
  try { board = await queryBuyersBoard(); }
  catch (e) { console.error("[buyers] board failed:", e); error = true; }

  return (
    <div className="flex flex-col gap-5">
      <BuyerIntelligencePanel />
      <BuyersWorkspace board={board} error={error} />
    </div>
  );
}
