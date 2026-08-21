// ============================================================================
// 🧭 מרכז מודיעין שוק — Market Intelligence COMMAND CENTER (external market ONLY).
// ----------------------------------------------------------------------------
// The rebuilt landing: NOT a duplicate of the listings feed and NOT a wall of
// nav chips. A single synthesized command center — primary action metric, KPI
// grid with real deltas, a prioritized opportunity queue, neighborhood ₪/m²
// intelligence, real + honestly-gated trends, and a live feed. All data is real,
// org-scoped and best-effort (getMarketCommandCenter); nothing is CRM. The full
// filterable feed, live map and dashboard remain one click away in the header.
// ============================================================================
import { getMarketCommandCenter } from "@/lib/market-intelligence/service";
import { MarketCommandCenterView } from "./MarketCommandCenterView";
import { MarketIntelNav } from "@/components/market-intelligence/MarketIntelNav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MarketIntelligencePage() {
  const data = await getMarketCommandCenter();
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <MarketIntelNav active="center" />
      <MarketCommandCenterView data={data} />
    </div>
  );
}
