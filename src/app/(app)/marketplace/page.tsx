// ============================================================================
// 🛒 ZONO — Marketplace Intelligence page (/marketplace). PHASE 58.0.
// External marketplace understanding → acquisition + buyer-match opportunities.
// Internal routing first; no scraping; alerts approval-gated.
// ============================================================================
import { getMarketplaceIntel } from "@/lib/marketplace-intelligence/service";
import type { MarketplaceReport } from "@/lib/marketplace-intelligence/types";
import { MarketplaceView } from "./MarketplaceView";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  let report: MarketplaceReport | null = null;
  try { report = await getMarketplaceIntel(); } catch (e) { console.error("[marketplace] load failed:", e); }
  return <MarketplaceView report={report} />;
}
