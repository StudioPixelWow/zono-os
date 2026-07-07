// ============================================================================
// 🌅 ZONO — default landing = Home V3 (THE MORNING + Premium RE Workspace).
// PHASE 61.RESTORE. COMPOSITION ONLY — reuses the EXISTING dashboard-home data
// pipeline (the loved premium sections) + the EXISTING Daily OS read (the morning
// layer). No new engines, no schema, no AI-logic changes. The previous Unified
// Workspace is preserved at /classic; Daily OS remains at /today (deep surface).
// ============================================================================
import { after } from "next/server";
import { listProperties, type PropertyRow } from "@/lib/properties/repository";
import { externalListingRepository, type ExternalListingRow } from "@/lib/external-listings/repository";
import { getSessionContext } from "@/lib/auth/session";
import { runOrchestratorForSession } from "@/lib/orchestrator";
import { getDashboardDict } from "@/lib/dashboard-home/i18n";
import { buildDashboardHomeData } from "@/lib/dashboard-home/data";
import { getCompetitorBoard, type CompetitorProfileRow } from "@/lib/competitor/service";
import { listBuyers } from "@/lib/buyers/repository";
import { listSellers } from "@/lib/sellers/repository";
import { getSocialLeadsBoard } from "@/lib/social/service";
import { getDealsBoard } from "@/lib/deals/service";
import { getExecutiveCommandCenter } from "@/lib/decision-intelligence/service";
import { getCurrentMarketHeatmap, type MarketHeatmapCell } from "@/lib/market/service";
import type { AttentionItemRow, OpportunityRow } from "@/lib/decision-intelligence/repository";
import { getDailyOS } from "@/lib/daily-os/service";
import type { DailyOS } from "@/lib/daily-os/types";
import { HomeV3 } from "@/components/home-v3/HomeV3";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await getSessionContext();
  const agentName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "סוכן";
  const cityName = profile?.primary_city ?? undefined;

  // Background intelligence refresh (existing behavior; never blocks render).
  if (profile) {
    after(async () => {
      try { await runOrchestratorForSession("dashboard_load", { skipRevalidation: true, source: "dashboard_load" }); }
      catch { /* best-effort */ }
    });
  }

  // ── Morning layer (Daily OS) — the emotional briefing + decisions. ──────────
  let daily: DailyOS | null = null;
  try { daily = await getDailyOS(); } catch (e) { console.error("[home-v3] daily os failed:", e); }

  // ── Rich real-estate layer — reuse the proven dashboard-home pipeline. ──────
  let properties: PropertyRow[] = [];
  try { properties = await listProperties({}); } catch (e) { console.error("[home-v3] properties failed:", e); }

  let featuredExternal: ExternalListingRow | null = null;
  try { featuredExternal = await externalListingRepository.randomPrivateOpportunity(); } catch (e) { console.error("[home-v3] featured failed:", e); }

  let competitorRows: CompetitorProfileRow[] = [];
  try { competitorRows = [...(await getCompetitorBoard()).competitors]; } catch (e) { console.error("[home-v3] competitors failed:", e); }

  let buyersCount = 0;
  try { buyersCount = (await listBuyers({})).length; } catch (e) { console.error("[home-v3] buyers failed:", e); }
  let sellersCount = 0;
  try { sellersCount = (await listSellers()).length; } catch (e) { console.error("[home-v3] sellers failed:", e); }
  let newLeadsCount = 0;
  try { newLeadsCount = (await getSocialLeadsBoard()).counts.new; } catch (e) { console.error("[home-v3] leads failed:", e); }

  let activeDealsCount = 0, expectedRevenue = 0, dealProbabilityPct = 0;
  try {
    const deals = await getDealsBoard();
    activeDealsCount = deals.deals.length;
    expectedRevenue = deals.revenue.weightedRevenue;
    dealProbabilityPct = deals.deals.length ? Math.round(deals.deals.reduce((s, d) => s + (d.deal_probability ?? 0), 0) / deals.deals.length) : 0;
  } catch (e) { console.error("[home-v3] deals failed:", e); }

  let attentionRows: AttentionItemRow[] = [];
  let opportunityRows: OpportunityRow[] = [];
  try { const cc = await getExecutiveCommandCenter(); attentionRows = cc.attention; opportunityRows = cc.opportunities; } catch (e) { console.error("[home-v3] command center failed:", e); }

  let marketCells: MarketHeatmapCell[] = [];
  try { marketCells = await getCurrentMarketHeatmap(); } catch (e) { console.error("[home-v3] heatmap failed:", e); }

  const dict = getDashboardDict("he");
  const data = buildDashboardHomeData({
    agentName, cityName, realProperties: properties, featuredExternal,
    buyersCount, sellersCount, newLeadsCount, activeDealsCount, expectedRevenue, dealProbabilityPct,
    attentionRows, opportunityRows, marketCells, competitorRows,
  });

  return <HomeV3 dict={dict} data={data} daily={daily} />;
}
