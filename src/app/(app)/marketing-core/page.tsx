// ============================================================================
// 📣 ZONO — Marketing Core™ — Marketing Operating System dashboard page. 33.0.
// Server page: composes the marketing workspace from the reused engines and
// renders the dashboard. Nothing publishes; nothing auto-executes. (Distinct
// from the existing /marketing surface — this is the new Marketing OS foundation.)
// ============================================================================
import { getMarketingWorkspace, type MarketingWorkspace } from "@/lib/marketing-core";
import { MarketingDashboard } from "@/components/marketing/MarketingDashboard";

export const dynamic = "force-dynamic";

const EMPTY: MarketingWorkspace = {
  version: "33.0", generatedAt: new Date().toISOString(),
  health: { score: 0, label: "חלש", activeCampaigns: 0, pendingApprovals: 0, coverage: 0, basis: [] },
  campaigns: [], audiences: [], calendar: [], insights: [], pendingApprovals: [], notes: ["טוען נתונים…"],
};

export default async function MarketingCorePage() {
  let workspace = EMPTY;
  try { workspace = await getMarketingWorkspace(); } catch (e) { console.error("[marketing-core] workspace load failed:", e); }
  return <MarketingDashboard workspace={workspace} />;
}
