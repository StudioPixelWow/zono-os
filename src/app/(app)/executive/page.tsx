// ============================================================================
// 🧠 ZONO — Executive Intelligence OS™ page (/executive). SCREEN 14.
// The office-manager cockpit: one office score, health, biggest risk/opportunity,
// broker comparison, approval center — all CONSUMED from existing engines. Money
// / pipeline + deals-at-risk are REUSED from the Deals board (not recomputed).
// Nothing recomputed, nothing auto-executed.
// ============================================================================
import { getExecutiveOS } from "@/lib/executive-os/service";
import { getDealsBoard } from "@/lib/deals/service";
import { ExecutiveOSView, type ExecDealsSummary } from "./ExecutiveOSView";

export const dynamic = "force-dynamic";

export default async function ExecutivePage() {
  const [os, board] = await Promise.all([
    getExecutiveOS(),
    getDealsBoard().catch(() => null),
  ]);

  // Real money/pipeline + at-risk deals, straight from the Deals board. `null`
  // when the board can't load → the view shows an honest "not enough data" state.
  const deals: ExecDealsSummary | null = board
    ? {
        activeCount: board.deals.length,
        pipelineValue: board.revenue.pipelineValue,
        weightedRevenue: board.revenue.weightedRevenue,
        expectedCommission: board.revenue.expectedCommission,
        atRisk: board.atRisk.slice(0, 6).map((d) => ({
          id: d.id,
          title: `${d.buyerName ?? "קונה"} ← ${d.propertyTitle ?? "נכס"}`,
          risk: d.deal_risk,
          value: d.deal_value,
          buyerId: d.buyer_id,
          propertyId: d.property_id,
          nextAction: d.next_best_action,
        })),
      }
    : null;

  return <ExecutiveOSView os={os} deals={deals} />;
}
