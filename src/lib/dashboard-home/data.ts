// ============================================================================
// ZONO — Home dashboard data. Production-shaped mock so the redesigned homepage
// renders rich, realistic content today and swaps to live data later. Real
// property rows (when available) are woven into the featured + hot + journey
// surfaces so every property shows a real image; the rest is structured mock.
// Hebrew strings here are CONTENT (names, neighborhoods), not UI labels — UI
// labels resolve through the i18n dictionary via *Key fields.
// ============================================================================
import type { PropertyRow } from "@/lib/properties/labels";
import { propertyAddressLine, propertyLocation } from "@/lib/properties/labels";
import type { ExternalListingRow } from "@/lib/external-listings/repository";
import type {
  ActivityEvent, AttentionItem, BuyerIntelligenceItem, CompetitorInsight, DashboardHomeData,
  DashboardKpi, HeatMapZone, MarketTrend, MissionTask, OpportunitySignal,
  PropertyCard, PropertyJourneyItem, SellerIntelligenceItem,
} from "./types";

const img = (seed: string) => `https://picsum.photos/seed/zono-${seed}/800/520`;
const avatar = (seed: string) => `https://i.pravatar.cc/80?img=${seed}`;

function rowToCard(r: PropertyRow): PropertyCard {
  const loc = propertyLocation(r);
  const score = r.zono_score ?? r.quality_score ?? 80;
  return {
    id: r.id,
    imageUrl: r.primary_image_url,
    title: r.title,
    city: r.city ?? loc.city ?? "",
    neighborhood: r.neighborhood ?? loc.neighborhood ?? "",
    addressLine: propertyAddressLine(r),
    price: r.price ?? 0,
    rooms: r.rooms,
    sizeSqm: r.size_sqm,
    floor: r.floor,
    statusKey: `status.${r.status}`,
    badgeKey: score >= 88 ? "badge.hot" : r.has_exclusivity ? "badge.exclusive" : null,
    aiMatchScore: score,
    aiInsightKey: score >= 88 ? "aiInsight.highInterest" : "aiInsight.matchesActiveBuyers",
    href: `/properties/${r.id}`,
  };
}

/** Private-owner external listing → featured "recommended acquisition" card. */
function externalToCard(l: ExternalListingRow): PropertyCard {
  const firstImage = Array.isArray(l.images) && l.images.length > 0 && typeof l.images[0] === "string" ? (l.images[0] as string) : null;
  const addr = [l.street, l.street_number].filter(Boolean).join(" ") || l.address || l.neighborhood || l.city || l.title || "נכס בבעלות פרטית";
  return {
    id: l.id,
    imageUrl: firstImage,
    title: l.title || addr,
    city: l.city ?? "",
    neighborhood: l.neighborhood ?? "",
    addressLine: addr,
    price: l.price ?? 0,
    rooms: l.rooms,
    sizeSqm: l.sqm ?? l.area_sqm,
    floor: l.floor,
    statusKey: "status.active",
    badgeKey: "badge.ai_pick",
    aiMatchScore: Math.round(l.opportunity_score) || null,
    aiInsightKey: "aiInsight.privateOwner",
    href: `/external-listings/${l.id}`,
  };
}

const MOCK_PROPERTIES: PropertyCard[] = [
  { id: "m1", imageUrl: img("p1"), title: "דירת 4 חדרים", city: "קרית ביאליק", neighborhood: "נאות אפק", addressLine: "נאות אפק 12, קרית ביאליק", price: 2850000, rooms: 4, sizeSqm: 98, floor: 3, statusKey: "status.published", badgeKey: "badge.hot", aiMatchScore: 94, aiInsightKey: "aiInsight.highInterest", href: "/properties" },
  { id: "m2", imageUrl: img("p2"), title: "דירת 3 חדרים", city: "קרית ביאליק", neighborhood: "רמת אפק", addressLine: "רמת אפק 7, קרית ביאליק", price: 1890000, rooms: 3, sizeSqm: 72, floor: 8, statusKey: "status.active", badgeKey: "badge.price_drop", aiMatchScore: 88, aiInsightKey: "aiInsight.priceBelowMarket", href: "/properties" },
  { id: "m3", imageUrl: img("p3"), title: "דירת 5 חדרים", city: "קרית ביאליק", neighborhood: "גנים", addressLine: "גנים 5/8, קרית ביאליק", price: 3590000, rooms: 5, sizeSqm: 120, floor: 16, statusKey: "status.published", badgeKey: "badge.new", aiMatchScore: 91, aiInsightKey: "aiInsight.manyViews", href: "/properties" },
  { id: "m4", imageUrl: img("p4"), title: "דירת 4 חדרים", city: "קרית ביאליק", neighborhood: "רמת אפק", addressLine: "רמת אפק 22, קרית ביאליק", price: 2450000, rooms: 4, sizeSqm: 95, floor: 12, statusKey: "status.ready", badgeKey: "badge.ai_pick", aiMatchScore: 86, aiInsightKey: "aiInsight.matchesActiveBuyers", href: "/properties" },
  { id: "m5", imageUrl: img("p5"), title: "פנטהאוז 6 חדרים", city: "קרית ביאליק", neighborhood: "נאות אפק", addressLine: "נאות אפק 7/7, קרית ביאליק", price: 4950000, rooms: 6, sizeSqm: 160, floor: 24, statusKey: "status.published", badgeKey: "badge.exclusive", aiMatchScore: 96, aiInsightKey: "aiInsight.highInterest", href: "/properties" },
  { id: "m6", imageUrl: img("p6"), title: "דירת 4 חדרים", city: "קרית מוצקין", neighborhood: "גושן", addressLine: "גושן 90, קרית מוצקין", price: 1990000, rooms: 4, sizeSqm: 90, floor: 2, statusKey: "status.active", badgeKey: "badge.new", aiMatchScore: 84, aiInsightKey: "aiInsight.matchesActiveBuyers", href: "/properties" },
];

const HEAT_ZONES: HeatMapZone[] = [
  { id: "z1", name: "נאות אפק", top: 30, left: 60, radius: 90, tone: "positive", deltaPct: 22, avgPrice: 2950000, pricePerSqm: 21800, activeProperties: 14, recentTransactions: 9, topCompetitors: ["דוד כהן", "שירן לוי"], aiInsightKey: "competitors.insight.competitionRising", recommendedActionKey: "journey.action.publishNow" },
  { id: "z2", name: "גנים", top: 52, left: 40, radius: 70, tone: "positive", deltaPct: 15, avgPrice: 2400000, pricePerSqm: 19200, activeProperties: 11, recentTransactions: 7, topCompetitors: ["רמי אברהם"], aiInsightKey: "opportunity.reason.areaLikelyListings", recommendedActionKey: "journey.action.callLeads" },
  { id: "z3", name: "רמת אפק", top: 44, left: 30, radius: 64, tone: "opportunity", deltaPct: 8, avgPrice: 2150000, pricePerSqm: 18400, activeProperties: 9, recentTransactions: 5, topCompetitors: ["גלית ישראלי"], aiInsightKey: "opportunity.reason.sellersMatchDemand", recommendedActionKey: "journey.action.sendOffer" },
  { id: "z4", name: "מרכז", top: 62, left: 24, radius: 56, tone: "agent", deltaPct: 3, avgPrice: 1980000, pricePerSqm: 17100, activeProperties: 7, recentTransactions: 4, topCompetitors: ["אבי מלכה"], aiInsightKey: "aiInsight.matchesActiveBuyers", recommendedActionKey: "journey.action.scheduleTour" },
  { id: "z5", name: "נווה ים", top: 70, left: 50, radius: 60, tone: "negative", deltaPct: -4, avgPrice: 1760000, pricePerSqm: 15900, activeProperties: 6, recentTransactions: 3, topCompetitors: ["דוד כהן"], aiInsightKey: "aiInsight.priceBelowMarket", recommendedActionKey: "journey.action.publishNow" },
  { id: "z6", name: "שיכון ותיקים", top: 34, left: 22, radius: 52, tone: "negative", deltaPct: -6, avgPrice: 1650000, pricePerSqm: 14800, activeProperties: 5, recentTransactions: 2, topCompetitors: ["שירן לוי"], aiInsightKey: "aiInsight.priceBelowMarket", recommendedActionKey: "journey.action.orderPhotos" },
];

const OPPORTUNITIES: OpportunitySignal[] = [
  { id: "o1", kind: "hot_buyers", icon: "Users", count: 4, reasonKey: "opportunity.reason.buyersReturned", confidence: 92, href: "/buyers" },
  { id: "o2", kind: "potential_sellers", icon: "Home", count: 6, reasonKey: "opportunity.reason.sellersMatchDemand", confidence: 84, href: "/sellers" },
  { id: "o3", kind: "likely_listings", icon: "Building2", count: 3, reasonKey: "opportunity.reason.areaLikelyListings", confidence: 78, href: "/acquisition" },
  { id: "o4", kind: "deals_at_risk", icon: "AlertTriangle", count: 2, reasonKey: "opportunity.reason.dealsLowEngagement", confidence: 71, href: "/deals" },
];

const COMPETITORS: CompetitorInsight[] = [
  { id: "c1", name: "דוד כהן", agency: "אנגלו סכסון", avatarUrl: avatar("11"), newListings: 8, avgPrice: 2300000, exclusiveEstimate: 5, priceDrops: 1, movementScore: 2, movement: "up" },
  { id: "c2", name: "שירן לוי", agency: "רי/מקס", avatarUrl: avatar("12"), newListings: 5, avgPrice: 1800000, exclusiveEstimate: 3, priceDrops: 1, movementScore: 1, movement: "up" },
  { id: "c3", name: "רמי אברהם", agency: "סנצ׳ורי 21", avatarUrl: avatar("13"), newListings: 4, avgPrice: 2100000, exclusiveEstimate: 2, priceDrops: 0, movementScore: -1, movement: "down" },
  { id: "c4", name: "גלית ישראלי", agency: "עצמאית", avatarUrl: avatar("14"), newListings: 3, avgPrice: 1600000, exclusiveEstimate: 2, priceDrops: 3, movementScore: 3, movement: "up" },
  { id: "c5", name: "אבי מלכה", agency: "יד2 פרו", avatarUrl: avatar("15"), newListings: 2, avgPrice: 1400000, exclusiveEstimate: 1, priceDrops: 2, movementScore: -1, movement: "down" },
];

const MARKET_TRENDS: MarketTrend[] = [
  { id: "t1", labelKey: "trend.price_per_sqm", current: "₪18,420", deltaPct: 7, trend: "up", points: [0.3, 0.4, 0.38, 0.5, 0.55, 0.62, 0.7] },
  { id: "t2", labelKey: "trend.deal_pace", current: "32", deltaPct: 11, trend: "up", points: [0.4, 0.45, 0.5, 0.48, 0.6, 0.66, 0.72] },
  { id: "t3", labelKey: "trend.days_on_market", current: "41", deltaPct: -8, trend: "down", points: [0.7, 0.66, 0.6, 0.55, 0.5, 0.46, 0.42] },
  { id: "t4", labelKey: "trend.inventory", current: "214", deltaPct: 4, trend: "up", points: [0.45, 0.5, 0.52, 0.55, 0.58, 0.6, 0.63] },
  { id: "t5", labelKey: "trend.demand_supply", current: "1.4x", deltaPct: 16, trend: "up", points: [0.35, 0.4, 0.48, 0.52, 0.6, 0.68, 0.74] },
];

const SELLERS: SellerIntelligenceItem[] = [
  { id: "s1", name: "משפחת ברק", propertyImageUrl: img("s1"), bucket: "hot", relationshipScore: 88, trustScore: 84, urgencyScore: 76, recommendedActionKey: "sellerIntel.action.scheduleMeeting", href: "/sellers" },
  { id: "s2", name: "יוסי מזרחי", propertyImageUrl: img("s2"), bucket: "at_risk", relationshipScore: 54, trustScore: 60, urgencyScore: 82, recommendedActionKey: "sellerIntel.action.callNow", href: "/sellers" },
  { id: "s3", name: "משפחת אזולאי", propertyImageUrl: img("s3"), bucket: "follow_up", relationshipScore: 70, trustScore: 66, urgencyScore: 58, recommendedActionKey: "sellerIntel.action.sendUpdate", href: "/sellers" },
  { id: "s4", name: "רונית שגב", propertyImageUrl: img("s4"), bucket: "unresponsive", relationshipScore: 40, trustScore: 48, urgencyScore: 64, recommendedActionKey: "sellerIntel.action.reEngage", href: "/sellers" },
];

const BUYERS: BuyerIntelligenceItem[] = [
  { id: "b1", name: "משפחת כהן", avatarUrl: avatar("21"), bucket: "hot", budget: 2600000, preferredArea: "נאות אפק", matchCount: 5, lastActivityKey: "buyerIntel.activity.viewedToday", href: "/buyers" },
  { id: "b2", name: "משפחת לוי", avatarUrl: avatar("22"), bucket: "returning", budget: 4000000, preferredArea: "חיפה", matchCount: 3, lastActivityKey: "buyerIntel.activity.returnedViews", href: "/buyers" },
  { id: "b3", name: "עמיר ש.", avatarUrl: avatar("23"), bucket: "new_match", budget: 1600000, preferredArea: "רמת אפק", matchCount: 4, lastActivityKey: "buyerIntel.activity.newMatch", href: "/buyers" },
  { id: "b4", name: "דנה ופז", avatarUrl: avatar("24"), bucket: "dormant", budget: 2200000, preferredArea: "גנים", matchCount: 2, lastActivityKey: "buyerIntel.activity.noActivity", href: "/buyers" },
];

// TODO(intel): derive `attention` from the real seller/buyer intelligence boards
// (listSellerIntelBoard / listBuyerIntelBoard "needs attention" buckets) once the
// home page is wired to them. Production-shaped mock until then — mirrors the
// reference "מה דורש טיפול היום?" row 1:1.
const ATTENTION: AttentionItem[] = [
  { id: "at1", titleKey: "todayAttention.kind.churnRisk", tone: "danger", name: "יוסי לוי", phone: "050-1234567", propertyContext: "דירה 4 חד׳, קרית ביאליק", reasonKey: "todayAttention.reason.noContact", daysSince: 18, ctaKey: "todayAttention.cta.callNow", ctaIcon: "Phone", href: "/sellers" },
  { id: "at2", titleKey: "todayAttention.kind.noLeads", tone: "warning", name: "גלית אבן", phone: "054-9876543", propertyContext: "דירה 3 חד׳, ראשון לציון", reasonKey: "todayAttention.reason.noLeads", daysSince: 28, ctaKey: "todayAttention.cta.sendUpdate", ctaIcon: "Send", href: "/properties" },
  { id: "at3", titleKey: "todayAttention.kind.readyForMeeting", tone: "success", name: "רועי מזרחי", phone: "052-6543210", propertyContext: "דירה 5 חד׳, קרית ביאליק", reasonKey: "todayAttention.reason.highIntent", daysSince: 2, ctaKey: "todayAttention.cta.scheduleMeeting", ctaIcon: "Calendar", href: "/buyers" },
  { id: "at4", titleKey: "todayAttention.kind.noMarketingUpdate", tone: "warning", name: "אמיר רוזן", phone: "053-3216549", propertyContext: "דירה 4 חד׳, חיפה", reasonKey: "todayAttention.reason.staleMarketing", daysSince: 21, ctaKey: "todayAttention.cta.sendUpdate", ctaIcon: "Send", href: "/properties" },
  { id: "at5", titleKey: "todayAttention.kind.priceDrop", tone: "danger", name: "דנה כהן", phone: "050-9876543", propertyContext: "דירה 3 חד׳, חיפה", reasonKey: "todayAttention.reason.priceAboveMarket", daysSince: 3, ctaKey: "todayAttention.cta.suggestPrice", ctaIcon: "Tag", href: "/properties" },
];

const MISSIONS: MissionTask[] = [
  { id: "mt1", labelKey: "missionControl.mission.callHotLeads", icon: "Phone", done: false, time: "10:00" },
  { id: "mt2", labelKey: "missionControl.mission.uploadPhotos", icon: "Image", done: true, time: "11:30" },
  { id: "mt3", labelKey: "missionControl.mission.scheduleTour", icon: "Calendar", done: false, time: "14:00" },
  { id: "mt4", labelKey: "missionControl.mission.updatePrice", icon: "Tag", done: false, time: "15:30" },
  { id: "mt5", labelKey: "missionControl.mission.sendOffers", icon: "Send", done: false, time: "17:00" },
];

const ACTIVITY: ActivityEvent[] = [
  { id: "a1", kind: "call", icon: "Phone", entity: "ליד · קרית ביאליק", detailKey: "recentActivity.detail.callMade", time: "לפני שעה", propertyImageUrl: null },
  { id: "a2", kind: "whatsapp", icon: "MessageCircle", entity: "משפחת כהן", detailKey: "recentActivity.detail.whatsappReply", time: "לפני שעתיים", propertyImageUrl: img("a2") },
  { id: "a3", kind: "ai_recommendation", icon: "Sparkles", entity: "ZONO AI", detailKey: "recentActivity.detail.aiSuggested", time: "לפני 3 שעות", propertyImageUrl: null },
  { id: "a4", kind: "seller_action", icon: "FileCheck2", entity: "מוכר · נאות אפק", detailKey: "recentActivity.detail.sellerSigned", time: "אתמול", propertyImageUrl: img("a4") },
  { id: "a5", kind: "buyer_action", icon: "Eye", entity: "קונה פעיל", detailKey: "recentActivity.detail.buyerViewed", time: "אתמול", propertyImageUrl: img("a5") },
];

const STAGES: PropertyJourneyItem["stage"][] = ["draft", "photography", "published", "leads", "tours", "negotiation", "contract", "sold"];
const NEXT_ACTIONS = ["journey.action.orderPhotos", "journey.action.publishNow", "journey.action.callLeads", "journey.action.scheduleTour", "journey.action.sendOffer", "journey.action.prepareContract"];

function buildJourney(cards: PropertyCard[]): PropertyJourneyItem[] {
  return cards.slice(0, 8).map((property, i) => ({
    property,
    stage: STAGES[i % STAGES.length],
    nextActionKey: NEXT_ACTIONS[i % NEXT_ACTIONS.length],
    interestedBuyers: i % 2 === 0
      ? [{ id: `jb${i}a`, name: "כ", avatarUrl: avatar(String(30 + i)) }, { id: `jb${i}b`, name: "ל", avatarUrl: avatar(String(40 + i)) }]
      : [],
    alertKey: !property.imageUrl ? "journey.alert.noPhotos" : i === 1 ? "journey.alert.highDemand" : null,
    alertTone: !property.imageUrl ? "negative" : i === 1 ? "opportunity" : null,
  }));
}

const KPIS: DashboardKpi[] = [
  { id: "k1", labelKey: "kpi.activeDeals", value: "23", trend: "up", deltaPct: 5, icon: "Handshake", hintKey: "kpi.activeDeals.hint" },
  { id: "k2", labelKey: "kpi.expectedRevenue", value: "₪246K", trend: "up", deltaPct: 12, icon: "Wallet", hintKey: "kpi.expectedRevenue.hint" },
  { id: "k3", labelKey: "kpi.activeProperties", value: "38", trend: "up", deltaPct: 8, icon: "Building2", hintKey: "kpi.activeProperties.hint" },
  { id: "k4", labelKey: "kpi.activeBuyers", value: "142", trend: "up", deltaPct: 6, icon: "Users", hintKey: "kpi.activeBuyers.hint" },
  { id: "k5", labelKey: "kpi.activeSellers", value: "27", trend: "up", deltaPct: 4, icon: "UserCheck", hintKey: "kpi.activeSellers.hint" },
  { id: "k6", labelKey: "kpi.newLeadsWeek", value: "31", trend: "up", deltaPct: 18, icon: "UserPlus", hintKey: "kpi.newLeadsWeek.hint" },
];

const COMPETITOR_INSIGHTS = [
  "competitors.insight.competitorGainedListings",
  "competitors.insight.competitorDroppedPrices",
  "competitors.insight.similarListingsAdded",
  "competitors.insight.competitionRising",
];

/** Build the homepage snapshot. Real property rows are woven into the property
 *  surfaces (featured/hot/journey); everything else is production-shaped mock. */
export function buildDashboardHomeData(opts: { agentName: string; cityName?: string; realProperties?: PropertyRow[]; featuredExternal?: ExternalListingRow | null }): DashboardHomeData {
  const realCards = (opts.realProperties ?? []).map(rowToCard);
  const cards = realCards.length >= 5 ? realCards : [...realCards, ...MOCK_PROPERTIES].slice(0, 6);
  const hot = [...cards].sort((a, b) => (b.aiMatchScore ?? 0) - (a.aiMatchScore ?? 0)).slice(0, 6);
  // Featured = best private-owner acquisition opportunity (not a broker listing);
  // fall back to the agent's hottest property only if there's no private lead.
  const featuredProperty = opts.featuredExternal ? externalToCard(opts.featuredExternal) : hot[0] ?? null;
  return {
    agentName: opts.agentName,
    cityName: opts.cityName || "קרית ביאליק",
    kpis: KPIS,
    featuredProperty,
    heatZones: HEAT_ZONES,
    cityTrendPct: 11,
    opportunities: OPPORTUNITIES,
    cityNow: { newListings: 17, priceDrops: 3, hotNeighborhood: "נאות אפק", topTransaction: 3450000, avgPricePerSqm: 18420, demandTrendPct: 12 },
    attention: ATTENTION,
    hotProperties: hot,
    competitors: COMPETITORS,
    competitorInsightKeys: COMPETITOR_INSIGHTS,
    journey: buildJourney(cards),
    marketTrends: MARKET_TRENDS,
    sellers: SELLERS,
    buyers: BUYERS,
    missions: MISSIONS,
    dealProbabilityPct: 81,
    activity: ACTIVITY,
  };
}
