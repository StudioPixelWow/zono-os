import { after } from "next/server";
import { listProperties, type PropertyRow } from "@/lib/properties/repository";
import { externalListingRepository, type ExternalListingRow } from "@/lib/external-listings/repository";
import { getSessionContext } from "@/lib/auth/session";
import { runOrchestratorForSession } from "@/lib/orchestrator";
import { getDashboardDict } from "@/lib/dashboard-home/i18n";
import { buildDashboardHomeData } from "@/lib/dashboard-home/data";
import { getAcquisitionBoard } from "@/lib/acquisition/service";
import { getCompetitorBoard, type CompetitorProfileRow } from "@/lib/competitor/service";
import { listBuyers } from "@/lib/buyers/repository";
import { listSellers } from "@/lib/sellers/repository";
import { getSocialLeadsBoard } from "@/lib/social/service";
import { getDealsBoard } from "@/lib/deals/service";
import { getExecutiveCommandCenter } from "@/lib/decision-intelligence/service";
import { getCurrentMarketHeatmap, type MarketHeatmapCell } from "@/lib/market/service";
import type { AttentionItemRow, OpportunityRow } from "@/lib/decision-intelligence/repository";
import { DashboardHomeView } from "@/components/dashboard-home/DashboardHomeView";
import type { ExclusiveDeal, CompetitorThreat } from "@/components/dashboard-home/components/ReferenceSections";

// Reads live data on the server (properties woven into the command center).
export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await getSessionContext();
  const agentName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "סוכן";
  const cityName = profile?.primary_city ?? undefined;

  // ZONO Orchestrator — AFTER the response is sent, refresh intelligence in the
  // background but only if data is stale (>15 min) and no run is active. Never
  // blocks the dashboard render. Revalidation is skipped (invalid in `after`).
  if (profile) {
    after(async () => {
      try { await runOrchestratorForSession("dashboard_load", { skipRevalidation: true, source: "dashboard_load" }); }
      catch { /* best-effort background refresh */ }
    });
  }

  let properties: PropertyRow[] = [];
  try {
    properties = await listProperties({});
  } catch (e) {
    console.error("[home] properties failed:", e);
  }

  // Recommended property = a ROTATING private-owner external opportunity (no
  // agent). force-dynamic + random pick → a different one on each visit.
  let featuredExternal: ExternalListingRow | null = null;
  try {
    featuredExternal = await externalListingRepository.randomPrivateOpportunity();
  } catch (e) {
    console.error("[home] private opportunity failed:", e);
  }

  // "עסקאות שאסור לפספס" — private-seller external opportunities only.
  let exclusiveDeals: ExclusiveDeal[] = [];
  try {
    const cards = await getAcquisitionBoard();
    exclusiveDeals = cards
      .filter((c) => c.sourceType?.startsWith("private") || (c.privateSellerScore ?? 0) >= 60)
      .slice(0, 12)
      .map((c) => ({
        id: c.listingId,
        title: c.title ?? "נכס",
        city: c.city,
        neighborhood: null,
        price: c.price,
        rooms: c.rooms,
        sqm: c.sqm,
        image: c.images?.[0] ?? null,
        listingUrl: c.listingUrl,
        contactName: c.contactName,
        contactPhone: c.contactPhone,
      }));
  } catch (e) {
    console.error("[home] acquisition board failed:", e);
  }

  // "מי מאיים עליך כרגע?" — competitors ranked by threat (share + growth).
  let threats: CompetitorThreat[] = [];
  let competitorRows: CompetitorProfileRow[] = [];
  try {
    const board = await getCompetitorBoard();
    competitorRows = [...board.competitors].sort(
      (a, b) => (0.5 * b.market_share_score + 0.5 * b.growth_score) - (0.5 * a.market_share_score + 0.5 * a.growth_score),
    );
    threats = competitorRows
      .map((c) => ({
        id: c.id,
        name: c.display_name,
        type: c.competitor_type,
        threat: Math.round(0.5 * c.market_share_score + 0.5 * c.growth_score),
        marketShare: Math.round(c.market_share_score),
        growth: Math.round(c.growth_score),
        listings: c.total_listings,
        localities: c.active_localities,
      }))
      .slice(0, 6);
  } catch (e) {
    console.error("[home] competitor board failed:", e);
  }

  // Real KPI counts — each in its own try/catch so one failure can't break the page.
  let buyersCount = 0;
  try { buyersCount = (await listBuyers({})).length; } catch (e) { console.error("[home] buyers failed:", e); }

  let sellersCount = 0;
  try { sellersCount = (await listSellers()).length; } catch (e) { console.error("[home] sellers failed:", e); }

  let newLeadsCount = 0;
  try { newLeadsCount = (await getSocialLeadsBoard()).counts.new; } catch (e) { console.error("[home] social board failed:", e); }

  let activeDealsCount = 0;
  let expectedRevenue = 0;
  let dealProbabilityPct = 0;
  try {
    const deals = await getDealsBoard();
    activeDealsCount = deals.deals.length;
    expectedRevenue = deals.revenue.weightedRevenue;
    dealProbabilityPct = deals.deals.length
      ? Math.round(deals.deals.reduce((s, d) => s + (d.deal_probability ?? 0), 0) / deals.deals.length)
      : 0;
  } catch (e) {
    console.error("[home] deals board failed:", e);
  }

  // Decision intelligence — attention + opportunity signals (already-Hebrew titles).
  let attentionRows: AttentionItemRow[] = [];
  let opportunityRows: OpportunityRow[] = [];
  try {
    const cc = await getExecutiveCommandCenter();
    attentionRows = cc.attention;
    opportunityRows = cc.opportunities;
  } catch (e) {
    console.error("[home] command center failed:", e);
  }

  // Market heatmap — real locality cells for the opportunity map + city pulse.
  let marketCells: MarketHeatmapCell[] = [];
  try { marketCells = await getCurrentMarketHeatmap(); } catch (e) { console.error("[home] market heatmap failed:", e); }

  const dict = getDashboardDict("he");
  const data = buildDashboardHomeData({
    agentName, cityName, realProperties: properties, featuredExternal,
    buyersCount, sellersCount, newLeadsCount, activeDealsCount, expectedRevenue, dealProbabilityPct,
    attentionRows, opportunityRows, marketCells, competitorRows,
  });

  return <DashboardHomeView dict={dict} data={data} exclusiveDeals={exclusiveDeals} threats={threats} />;
}
