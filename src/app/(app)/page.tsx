// ============================================================================
// 🌅 ZONO — default landing = Home Control Center (redesign).
// COMPOSITION ONLY — reuses the EXISTING dashboard-home data pipeline + the
// canonical broker-intelligence recommendation queue + real activity + tasks.
// No new engines, no schema, no AI-logic changes. Every section is fed from a
// real, org-scoped (RLS) service; nothing is mocked. The previous HomeV3 layout
// and its data pipeline are preserved in the codebase (component untouched); the
// Unified Workspace remains reachable at /classic.
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
import { getSocialLeadsBoard, type SocialLeadsBoard } from "@/lib/social/service";
import { getDealsBoard, type DealsBoard } from "@/lib/deals/service";
import { getExecutiveCommandCenter } from "@/lib/decision-intelligence/service";
import { getCurrentMarketHeatmap, type MarketHeatmapCell } from "@/lib/market/service";
import type { AttentionItemRow, OpportunityRow } from "@/lib/decision-intelligence/repository";
import { getBrokerIntelligenceQueue } from "@/lib/broker-intelligence/aggregate-service";
import { activityEventRepository, type ActivityEventRow } from "@/lib/activity/repository";
import { getHomeKpiExtras, listTodayTasks, type HomeTaskItem } from "@/lib/home/home-service";
import { listBuyerBoard } from "@/lib/buyers/repository";
import { getAcquisitionCommandCenter } from "@/lib/acquisition/service";
import { HomeControlCenter } from "@/components/home-control/HomeControlCenter";
import type {
  HomeActivityItem, HomeRec, HomeHero, HomeNowItem, HomePipeline,
  HomeFollowUpItem, HomeAcquisition, HomeNextDeal,
} from "@/components/home-control/types";

export const dynamic = "force-dynamic";

const ilsC = (n: number) =>
  n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${Math.round(n).toLocaleString("he-IL")}`;

// ── Activity-event → home feed item (icon/tone/href from the canonical type). ──
const ACT_ICON: Record<string, { icon: string; tone: HomeActivityItem["tone"] }> = {
  lead: { icon: "Users", tone: "success" }, contact: { icon: "Users", tone: "success" },
  task: { icon: "ListChecks", tone: "brand" }, deal: { icon: "Handshake", tone: "success" },
  property: { icon: "Building", tone: "brand" }, match: { icon: "Sparkles", tone: "brand" },
  message: { icon: "MessageCircle", tone: "brand" }, whatsapp: { icon: "MessageCircle", tone: "brand" },
  meeting: { icon: "Calendar", tone: "warning" }, viewing: { icon: "Calendar", tone: "warning" },
  offer: { icon: "Send", tone: "warning" }, document: { icon: "FileText", tone: "neutral" },
};
function hrefForEntity(entityType: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case "property": return `/properties/${entityId}`;
    case "buyer": return `/buyers/${entityId}`;
    case "seller": return `/sellers/${entityId}`;
    case "match": return `/matches/${entityId}`;
    case "deal": return `/deals`;
    case "lead": return `/leads`;
    default: return null;
  }
}
function mapActivity(rows: ActivityEventRow[]): HomeActivityItem[] {
  return rows.map((r) => {
    const key = (r.entity_type ?? "").toLowerCase();
    const meta = ACT_ICON[key] ?? ACT_ICON[(r.event_type ?? "").split("_")[0]] ?? { icon: "Activity", tone: "neutral" as const };
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      at: r.occurred_at,
      icon: meta.icon,
      tone: meta.tone,
      href: hrefForEntity(r.entity_type, r.entity_id),
    };
  });
}

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

  // ── Real-estate data layer — reuse the proven dashboard-home pipeline. ──────
  let properties: PropertyRow[] = [];
  try { properties = await listProperties({}); } catch (e) { console.error("[home] properties failed:", e); }

  let featuredExternal: ExternalListingRow | null = null;
  try { featuredExternal = await externalListingRepository.randomPrivateOpportunity(); } catch (e) { console.error("[home] featured failed:", e); }

  let competitorRows: CompetitorProfileRow[] = [];
  try { competitorRows = [...(await getCompetitorBoard()).competitors]; } catch (e) { console.error("[home] competitors failed:", e); }

  let buyersCount = 0;
  try { buyersCount = (await listBuyers({})).length; } catch (e) { console.error("[home] buyers failed:", e); }
  let sellersCount = 0;
  try { sellersCount = (await listSellers()).length; } catch (e) { console.error("[home] sellers failed:", e); }

  let socialBoard: SocialLeadsBoard | null = null;
  try { socialBoard = await getSocialLeadsBoard(); } catch (e) { console.error("[home] leads failed:", e); }
  const newLeadsCount = socialBoard?.counts.new ?? 0;

  let dealsBoard: DealsBoard | null = null;
  try { dealsBoard = await getDealsBoard(); } catch (e) { console.error("[home] deals failed:", e); }
  const activeDealsCount = dealsBoard?.deals.length ?? 0;
  const expectedRevenue = dealsBoard?.revenue.weightedRevenue ?? 0;
  const dealProbabilityPct = dealsBoard && dealsBoard.deals.length
    ? Math.round(dealsBoard.deals.reduce((s, d) => s + (d.deal_probability ?? 0), 0) / dealsBoard.deals.length)
    : 0;

  let attentionRows: AttentionItemRow[] = [];
  let opportunityRows: OpportunityRow[] = [];
  try { const cc = await getExecutiveCommandCenter(); attentionRows = cc.attention; opportunityRows = cc.opportunities; } catch (e) { console.error("[home] command center failed:", e); }

  let marketCells: MarketHeatmapCell[] = [];
  try { marketCells = await getCurrentMarketHeatmap(); } catch (e) { console.error("[home] heatmap failed:", e); }

  // ── New surfaces for the redesign — all real, org-scoped, best-effort. ──────
  const kpiExtras = await getHomeKpiExtras();
  let todayTasks: HomeTaskItem[] = [];
  try { todayTasks = await listTodayTasks(6); } catch (e) { console.error("[home] tasks failed:", e); }

  let recommendations: HomeRec[] = [];
  let buyerMatches: HomeRec[] = [];
  let recTotal = 0;
  try {
    const queue = await getBrokerIntelligenceQueue({ limit: 12 });
    recTotal = queue.total;
    const toRec = (r: (typeof queue.items)[number]): HomeRec => ({
      id: r.id, title: r.title, why: r.why, urgency: r.urgency,
      href: r.href, action: r.suggestedAction, area: r.area,
    });
    recommendations = queue.items.slice(0, 3).map(toRec);
    // Client × property = the buyer-matching recommendations (real, evidence-based).
    buyerMatches = queue.items.filter((r) => r.area === "buyer").slice(0, 6).map(toRec);
  } catch (e) { console.error("[home] recommendations failed:", e); }

  let activity: HomeActivityItem[] = [];
  try { activity = mapActivity(await activityEventRepository.listRecentForOrg(8)); } catch (e) { console.error("[home] activity failed:", e); }

  // Follow-up radar — real hot/warm buyers not contacted in ≥7 days.
  let followUps: HomeFollowUpItem[] = [];
  try {
    const board = await listBuyerBoard();
    const DAY = 86_400_000;
    followUps = board.followUp.slice(0, 5).map((b) => {
      const hot = b.temperature === "hot";
      const days = b.last_contacted_at ? Math.floor((Date.now() - new Date(b.last_contacted_at).getTime()) / DAY) : null;
      return {
        id: b.id,
        name: b.full_name || "לקוח",
        tag: hot ? "לקוח חם" : "לקוח חמים",
        tagTone: hot ? "danger" as const : "warning" as const,
        sub: days === null ? "טרם נוצר קשר" : `אין קשר ${days} ימים`,
        action: "פתח לקוח",
        href: `/buyers/${b.id}`,
      };
    });
  } catch (e) { console.error("[home] follow-up radar failed:", e); }

  // Property-acquisition radar — real inventory-acquisition command-center counts.
  let acquisition: HomeAcquisition = { total: 0, highPriority: 0, privateSellers: 0, buyerDemand: 0, doubleSide: 0, contacted: 0 };
  try { acquisition = await getAcquisitionCommandCenter(); } catch (e) { console.error("[home] acquisition failed:", e); }

  // Reuse the dashboard pipeline for the featured + hot property cards.
  const dict = getDashboardDict("he");
  const data = buildDashboardHomeData({
    agentName, cityName, realProperties: properties, featuredExternal,
    buyersCount, sellersCount, newLeadsCount, activeDealsCount, expectedRevenue, dealProbabilityPct,
    attentionRows, opportunityRows, marketCells, competitorRows,
  });

  const kpis = [
    { id: "leads", label: "לידים חדשים", value: String(newLeadsCount), icon: "Users", href: "/leads", hint: "נהל לידים" },
    { id: "tasks", label: "משימות להיום", value: String(kpiExtras.tasksToday), icon: "ListChecks", href: "/action-center", hint: "מרכז הפעולות" },
    { id: "tours", label: "סיורים השבוע", value: String(kpiExtras.toursThisWeek), icon: "Calendar", href: "/viewings", hint: "יומן סיורים" },
    { id: "revenue", label: "מחזור עסקאות", value: ilsC(expectedRevenue), icon: "TrendingUp", href: "/deals", hint: "צנרת עסקאות" },
    { id: "active", label: "עסקאות פעילות", value: String(activeDealsCount), icon: "Handshake", href: "/deals", hint: "עסקאות" },
  ];

  const perf = {
    leadsBySource: (socialBoard?.sourceBreakdown ?? []).slice(0, 5).map((s) => ({ label: s.platform, value: s.count })),
    dealsByStage: (dealsBoard?.pipeline ?? []).slice(0, 6).map((s) => ({ label: s.label, value: s.count })),
    expectedRevenue,
    activeDeals: activeDealsCount,
    newLeads: newLeadsCount,
  };

  // ── Command-center view-models (all real, org-scoped). ──────────────────────
  const dealsNeedingAction = attentionRows.filter((a) => a.entity_type === "deal").length;

  const hero: HomeHero = {
    opportunities: recTotal,
    chips: [
      { id: "leads", label: "לידים חדשים", value: newLeadsCount, tone: "success" as const, href: "/leads" },
      { id: "tours", label: "סיורים השבוע", value: kpiExtras.toursThisWeek, tone: "warning" as const, href: "/viewings" },
      { id: "deals", label: "עסקאות לטיפול", value: dealsNeedingAction, tone: "brand" as const, href: "/deals" },
      { id: "followups", label: "מעקבים פתוחים", value: followUps.length, tone: "danger" as const, href: "/buyers" },
    ].filter((c) => c.value > 0),
  };

  const now: HomeNowItem[] = [
    newLeadsCount > 0 && { id: "leads", icon: "Flame", tone: "danger" as const, label: `${newLeadsCount} לידים חדשים מחכים למענה`, action: "טפל בלידים", href: "/leads" },
    dealsNeedingAction > 0 && { id: "deals", icon: "Handshake", tone: "brand" as const, label: `${dealsNeedingAction} עסקאות דורשות פעולה`, action: "בדוק עסקאות", href: "/deals" },
    followUps.length > 0 && { id: "followups", icon: "Phone", tone: "warning" as const, label: `${followUps.length} לקוחות חמים ממתינים למעקב`, action: "טפל במעקבים", href: "/buyers" },
    acquisition.highPriority > 0 && { id: "acq", icon: "Target", tone: "success" as const, label: `${acquisition.highPriority} הזדמנויות גיוס בעדיפות גבוהה`, action: "פתח רדאר גיוס", href: "/acquisition" },
  ].filter(Boolean) as HomeNowItem[];

  const pipeline: HomePipeline = {
    weightedRevenue: dealsBoard?.revenue.weightedRevenue ?? 0,
    expectedCommission: dealsBoard?.revenue.expectedCommission ?? 0,
    pipelineValue: dealsBoard?.revenue.pipelineValue ?? 0,
    stages: (dealsBoard?.pipeline ?? []).map((s) => ({ stage: s.stage, label: s.label, count: s.count, value: s.value })),
  };

  // Next deal = the highest-value real active deal (deals are sorted by value desc).
  let nextDeal: HomeNextDeal | null = null;
  const topDeal = dealsBoard?.deals[0];
  if (topDeal) {
    const stageLabel = (dealsBoard?.pipeline ?? []).find((s) => s.stage === topDeal.deal_stage)?.label ?? topDeal.deal_stage;
    nextDeal = {
      id: topDeal.id,
      buyerName: topDeal.buyerName || "קונה",
      propertyTitle: topDeal.propertyTitle || "נכס",
      probability: Math.round(topDeal.deal_probability ?? 0),
      commission: Math.round(topDeal.commission_value ?? 0),
      stageLabel,
      href: "/deals",
    };
  }

  return (
    <HomeControlCenter
      dict={dict}
      agentName={agentName}
      hero={hero}
      kpis={kpis}
      recommendations={recommendations}
      buyerMatches={buyerMatches}
      now={now}
      pipeline={pipeline}
      followUps={followUps}
      acquisition={acquisition}
      nextDeal={nextDeal}
      activity={activity}
      tasks={todayTasks}
      featuredProperty={data.featuredProperty}
      hotProperties={data.hotProperties}
      territory={{ areaLabel: cityName ?? null, properties: properties.length, buyers: buyersCount, deals: activeDealsCount }}
      perf={perf}
      summary={{ recTotal, toursThisWeek: kpiExtras.toursThisWeek, newLeads: newLeadsCount }}
    />
  );
}
