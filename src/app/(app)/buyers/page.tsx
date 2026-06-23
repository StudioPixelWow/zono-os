import { listBuyers, type BuyerRow } from "@/lib/buyers/repository";
import { listBuyerMatchCounts, type BuyerMatchCounts } from "@/lib/buyers/matches";
import { listBuyerIntelBoard } from "@/lib/buyer-intelligence/service";
import { BuyersWorkspace, type IntelMembership } from "./components/BuyersWorkspace";

export const dynamic = "force-dynamic";

/**
 * Buyers command center. All filtering/search/sorting happens client-side in
 * BuyersWorkspace for instant UX, so the server just loads the org's buyers
 * (RLS-scoped), the intelligence-board membership (when the digital twin exists),
 * and per-buyer match counts. Each fetch fails soft so the page always renders.
 */
export default async function BuyersPage() {
  let rows: BuyerRow[] = [];
  let error = false;
  try {
    rows = await listBuyers({});
  } catch (e) {
    console.error("[buyers] list failed:", e);
    error = true;
  }

  let intel: IntelMembership | null = null;
  try {
    const board = await listBuyerIntelBoard();
    intel = {
      needingAttention: board.needingAttention.map((i) => i.buyerId),
      closeToPurchase: board.closeToPurchase.map((i) => i.buyerId),
      financingRisks: board.financingRisks.map((i) => i.buyerId),
      highEngagement: board.highEngagement.map((i) => i.buyerId),
      noActivity: board.noActivity.map((i) => i.buyerId),
    };
  } catch (e) {
    console.error("[buyers] intel board failed:", e);
  }

  let matchCounts: BuyerMatchCounts = {};
  try {
    matchCounts = await listBuyerMatchCounts();
  } catch (e) {
    console.error("[buyers] match counts failed:", e);
  }

  return <BuyersWorkspace buyers={rows} intel={intel} matchCounts={matchCounts} error={error} />;
}
