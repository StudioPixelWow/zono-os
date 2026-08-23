import { querySellersBoard, type SellersBoard } from "@/lib/sellers/board-query";
import { SellersWorkspace } from "./components/SellersWorkspace";
import { SellerIntelligencePanel } from "@/components/broker-intelligence/SellerIntelligencePanel";

export const dynamic = "force-dynamic";

/**
 * Sellers command center. Scope + insight/KPI compute run on the SERVER
 * (querySellersBoard, bounded + RLS-scoped, folding in property counts, the
 * intelligence board and per-seller profiles); the client workspace drives all
 * filter / sort / page / view / open state through the URL and paginates the
 * table over the computed set.
 */
export default async function SellersPage() {
  let board: SellersBoard | null = null;
  let error = false;
  try { board = await querySellersBoard(); }
  catch (e) { console.error("[sellers] board failed:", e); error = true; }

  return (
    <div className="flex flex-col gap-5">
      <SellerIntelligencePanel />
      <SellersWorkspace board={board} error={error} />
    </div>
  );
}
