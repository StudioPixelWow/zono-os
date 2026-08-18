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
import { getBrokerWhatsapp } from "@/lib/whatsapp/inbox-service";
import { resolveSessionCtx, readSessionSnapshot } from "@/lib/whatsapp/provider/session";
import { getMarketingBoard } from "@/lib/marketing/service";
import { getOfficeActivation } from "@/lib/activation/activation-server";
import { getCityDiscovery } from "@/lib/activation/city-discovery-server";
import { buildOfficeTheme, OFFICE_THEME_DEFAULTS } from "@/lib/brand-identity/office-theme";
import { HomeControlCenter } from "@/components/home-control/HomeControlCenter";
import { NewOfficeCommandCenter } from "@/components/home-control/NewOfficeCommandCenter";
import { OnboardingNextStep } from "@/components/onboarding/OnboardingNextStep";
import type {
  HomeActivityItem, HomeRec, HomeHero, HomeNowItem, HomePipeline,
  HomeFollowUpItem, HomeAcquisition, HomeNextDeal, HomePrivateListing,
  HomeWhatsapp, HomeMarketing, HomeMarketingItem, HomeDormantLead, HomeZonoWork,
} from "@/components/home-control/types";

// Owner phone → wa.me international (IL): 05X… → 9725X…; already-972 kept.
function ownerWhatsappUrl(phone: string | null, title: string, city: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  let intl = digits;
  if (intl.startsWith("972")) { /* keep */ }
  else if (intl.startsWith("0")) intl = "972" + intl.slice(1);
  else if (intl.length === 9) intl = "972" + intl;
  else return null;
  const where = city ? ` ב${city}` : "";
  const msg = `שלום, ראיתי את המודעה על ${title}${where} ואשמח לפרטים נוספים 🙂`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}
function firstImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const f = images[0];
  if (typeof f === "string") return f;
  if (f && typeof f === "object") { const o = f as Record<string, unknown>; return (o.url as string) ?? (o.src as string) ?? (o.image as string) ?? null; }
  return null;
}

export const dynamic = "force-dynamic";

const ilsC = (n: number) =>
  n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${Math.round(n).toLocaleString("he-IL")}`;

// ── Activity-event → home feed item (icon/tone/href from the canonical type). ──
const ACT_ICON: Record<string, { icon: string; tone: HomeActivityItem["tone"] }> = {
  lead: { icon: "Users", tone: "success" }, contact: { icon: "Users", tone: "success" },
  task: { icon: "ListChecks", tone: "brand" }, deal: { icon: "Handshake", tone: "success" },
  property: { icon: "Building", tone: "brand" }, match: { icon: "GitCompareArrows", tone: "brand" },
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
// "ZONO worked for you" — real counts of what happened in the last 24h, grouped.
function buildZonoWork(rows: ActivityEventRow[]): HomeZonoWork {
  const DAY = 86_400_000;
  const recent = rows.filter((r) => Date.now() - new Date(r.occurred_at).getTime() <= DAY);
  const buckets: Record<string, { icon: string; label: string; tone: "brand" | "success" | "warning"; n: number }> = {
    match: { icon: "GitCompareArrows", label: "התאמות חדשות נמצאו", tone: "brand", n: 0 },
    lead: { icon: "Users", label: "לידים ולקוחות עודכנו", tone: "success", n: 0 },
    property: { icon: "Building", label: "נכסים חדשים זוהו באזור שלך", tone: "brand", n: 0 },
    task: { icon: "ListChecks", label: "מעקבים ומשימות תוזמנו", tone: "warning", n: 0 },
    deal: { icon: "Handshake", label: "עסקאות התקדמו", tone: "success", n: 0 },
  };
  const keyFor = (r: ActivityEventRow): string | null => {
    const e = (r.entity_type ?? "").toLowerCase();
    if (e === "match") return "match";
    if (e === "buyer" || e === "seller" || e === "lead" || e === "contact") return "lead";
    if (e === "property") return "property";
    if (e === "task" || e === "meeting" || e === "viewing") return "task";
    if (e === "deal" || e === "offer") return "deal";
    return null;
  };
  for (const r of recent) { const k = keyFor(r); if (k) buckets[k].n++; }
  const items = Object.entries(buckets)
    .filter(([, v]) => v.n > 0)
    .map(([id, v]) => ({ id, icon: v.icon, label: `${v.n} ${v.label}`, tone: v.tone }));
  return { windowLabel: "ב-24 השעות האחרונות", items, total: recent.length };
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
  // ── P9.0B — FIRST-LOGIN WOW branch ─────────────────────────────────────────
  // A brand-new office (no operational business data yet) gets the personalized
  // command center, and we SHORT-CIRCUIT the entire ~20-service intelligence
  // stack (Phase 13 perf) — an empty office never pays for engines that have
  // nothing to show. "activating"/"active" offices fall through to the full
  // dashboard (which now renders honest zero-states). Best-effort: any failure
  // degrades to the normal dashboard.
  try {
    const act = await getOfficeActivation();
    if (act && act.activation.phase === "new") {
      const theme = buildOfficeTheme(act.brand.primary, act.brand.secondary, act.brand.accent);
      // P9.0D — real city-discovery status so a fresh office sees "ZONO is
      // scanning your city" (honest counts) instead of a cold empty area.
      const discovery = await getCityDiscovery(act.identity.orgId, act.identity.city, act.identity.localityCode);
      // P9.0D — refresh discovery on EVERY entry for a new office too (the phase
      // short-circuit below would otherwise skip the dashboard-load orchestrator).
      // Non-blocking + staleness-gated inside the orchestrator; scrapes at most
      // once per stale window. This is why a returning user sees fresh listings.
      after(async () => {
        try { await runOrchestratorForSession("dashboard_load", { skipRevalidation: true, source: "dashboard_load" }); }
        catch { /* best-effort */ }
      });
      return (
        <NewOfficeCommandCenter
          identity={act.identity}
          activation={act.activation}
          trial={act.trial}
          discovery={discovery}
          themeVars={{ ...OFFICE_THEME_DEFAULTS, ...theme.vars }}
          hasBrand={theme.hasBrand}
        />
      );
    }
  } catch (e) {
    console.error("[home] activation resolve failed — falling back to dashboard:", e);
  }

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

  // "נכסים חדשים באזור" — private-owner (no-broker) listings + WhatsApp to owner.
  let privateListings: HomePrivateListing[] = [];
  try {
    const rows = await externalListingRepository.listPrivateOwnerListings(5, cityName);
    privateListings = rows.map((l) => ({
      id: l.id,
      title: (l.title ?? "").trim() || "נכס ללא כותרת",
      city: l.city ?? null,
      neighborhood: l.neighborhood ?? null,
      price: l.price ?? null,
      rooms: l.rooms ?? null,
      sqm: l.sqm ?? l.area_sqm ?? null,
      floor: l.floor ?? null,
      imageUrl: firstImageUrl(l.images),
      ownerName: l.contact_name ?? null,
      whatsappUrl: ownerWhatsappUrl(l.contact_phone ?? null, (l.title ?? "").trim() || "הנכס", l.city ?? null),
      href: `/external-listings/${l.id}`,
    }));
  } catch (e) { console.error("[home] private listings failed:", e); }

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

  // Recent activity — reused for the feed AND the "ZONO worked for you" summary.
  let activity: HomeActivityItem[] = [];
  let zonoWork: HomeZonoWork = { windowLabel: "ב-24 השעות האחרונות", items: [], total: 0 };
  try {
    const rows = await activityEventRepository.listRecentForOrg(60);
    activity = mapActivity(rows.slice(0, 8));
    zonoWork = buildZonoWork(rows);
  } catch (e) { console.error("[home] activity failed:", e); }

  // Dormant / lead-rescue — buyers gone cold (≥30d) worth bringing back.
  let dormantLeads: HomeDormantLead[] = [];

  // Follow-up radar — real hot/warm buyers not contacted in ≥7 days.
  let followUps: HomeFollowUpItem[] = [];
  try {
    const board = await listBuyerBoard();
    const DAY = 86_400_000;
    dormantLeads = board.dormant.slice(0, 5).map((b) => {
      const days = b.last_contacted_at ? Math.floor((Date.now() - new Date(b.last_contacted_at).getTime()) / DAY) : null;
      return {
        id: b.id,
        name: b.full_name || "לקוח",
        sub: days === null ? "טרם נוצר קשר" : `אין קשר ${days} ימים`,
        href: `/buyers/${b.id}`,
      };
    });
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

  // WhatsApp — the conversations waiting for the agent (real inbox engine).
  let whatsapp: HomeWhatsapp = { connected: false, waiting: 0, urgent: 0, today: 0, conversations: [] };
  try {
    const wa = await getBrokerWhatsapp(profile?.id ?? null);
    const conversations = wa.waitingConversations.slice(0, 4).map((c) => ({
      id: c.id, name: c.contactName, reason: c.reason, href: c.href, urgency: c.urgency,
    }));
    let sessionConnected = false;
    try {
      const ctx = await resolveSessionCtx();
      if (ctx) sessionConnected = (await readSessionSnapshot(ctx, "bridge")).state === "connected";
    } catch { /* ignore — fall back to activity signal */ }
    whatsapp = {
      connected: sessionConnected || wa.waiting + wa.urgent + wa.today + wa.unread > 0 || conversations.length > 0,
      waiting: wa.waiting, urgent: wa.urgent, today: wa.today, conversations,
    };
  } catch (e) { console.error("[home] whatsapp failed:", e); }

  // Marketing — what's worth promoting now (opportunity signals + property DNA).
  let marketing: HomeMarketing = { hasData: false, items: [] };
  try {
    const mb = await getMarketingBoard();
    const items: HomeMarketingItem[] = [];
    for (const o of mb.opportunities.slice(0, 5)) {
      const eid = (o.entity_id as string | null) ?? null;
      const href = o.entity_type === "property" && eid ? `/properties/${eid}` : "/marketing";
      items.push({
        id: o.id, title: (o.title as string) ?? "הזדמנות שיווק",
        detail: (o.description as string) ?? "", action: (o.recommended_action as string) ?? "פתח שיווק",
        href, score: Math.round((o.impact_score as number) ?? 0),
      });
    }
    // If no opportunity signals, fall back to the top promote-worthy properties.
    if (items.length === 0) {
      for (const d of mb.propertyDna.filter((p) => p.score >= 55).slice(0, 4)) {
        items.push({
          id: d.propertyId, title: d.title || "נכס לקידום",
          detail: d.summary ?? "נכס עם ציון שיווק גבוה — כדאי לקדם", action: "קדם את הנכס",
          href: `/properties/${d.propertyId}`, score: Math.round(d.score),
        });
      }
    }
    marketing = { hasData: items.length > 0, items: items.slice(0, 4) };
  } catch (e) { console.error("[home] marketing failed:", e); }

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
    <>
    <OnboardingNextStep />
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
      privateListings={privateListings}
      whatsapp={whatsapp}
      marketing={marketing}
      dormantLeads={dormantLeads}
      zonoWork={zonoWork}
      territory={{ areaLabel: cityName ?? null, properties: properties.length, buyers: buyersCount, deals: activeDealsCount }}
      perf={perf}
      summary={{ recTotal, toursThisWeek: kpiExtras.toursThisWeek, newLeads: newLeadsCount }}
    />
    </>
  );
}
