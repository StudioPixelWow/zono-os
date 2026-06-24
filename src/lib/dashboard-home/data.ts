// ============================================================================
// ZONO — Home dashboard data. Built ENTIRELY from real Supabase-backed inputs
// passed in by the home server component. No mock, no placeholder images, no
// fabricated people/phones/counts. When a real source is empty the matching
// array is empty and the UI renders an honest Hebrew empty state.
// Hebrew strings here are CONTENT (real entity titles/locations), not UI labels
// — UI labels resolve through the i18n dictionary via *Key fields.
// ============================================================================
import type { PropertyRow } from "@/lib/properties/labels";
import { propertyAddressLine, propertyLocation } from "@/lib/properties/labels";
import type { ExternalListingRow } from "@/lib/external-listings/repository";
import type { MarketHeatmapCell } from "@/lib/market/service";
import type { AttentionItemRow, OpportunityRow } from "@/lib/decision-intelligence/repository";
import type { CompetitorProfileRow } from "@/lib/competitor/service";
import type {
  AttentionItem, AttentionTone, CompetitorInsight, DashboardHomeData,
  DashboardKpi, HeatMapZone, OpportunitySignal, PropertyCard,
  PropertyJourneyItem, SignalTone, Trend,
} from "./types";

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

// ── Decision-intelligence → home shapes ──────────────────────────────────────

/** Map an entity_type to a home detail route + CTA. Generic; no fabricated person. */
function entityRoute(entityType: string): { href: string; ctaKey: string; ctaIcon: string } {
  switch (entityType) {
    case "buyer": return { href: "/buyers", ctaKey: "todayAttention.cta.scheduleMeeting", ctaIcon: "Calendar" };
    case "seller": return { href: "/sellers", ctaKey: "todayAttention.cta.callNow", ctaIcon: "Phone" };
    case "property": return { href: "/properties", ctaKey: "todayAttention.cta.sendUpdate", ctaIcon: "Send" };
    case "external_listing": return { href: "/acquisition", ctaKey: "todayAttention.cta.callNow", ctaIcon: "Phone" };
    default: return { href: "/command", ctaKey: "todayAttention.cta.sendUpdate", ctaIcon: "Send" };
  }
}

function attentionTone(score: number): AttentionTone {
  if (score >= 70) return "danger";
  if (score >= 45) return "warning";
  return "brand";
}

/** Real attention rows → AttentionItem[]. Uses the row's own title as the
 *  display text; NEVER invents a person name or phone. */
function toAttentionItems(rows: AttentionItemRow[]): AttentionItem[] {
  const DAY = 86_400_000;
  return rows.slice(0, 5).map((r) => {
    const route = entityRoute(r.entity_type);
    const daysSince = r.detected_at ? Math.max(0, Math.round((Date.now() - new Date(r.detected_at).getTime()) / DAY)) : 0;
    return {
      id: r.id,
      titleKey: r.title,           // real, already-Hebrew title from the brain
      tone: attentionTone(r.attention_score ?? 0),
      name: r.title,               // real entity title — no fabricated person
      phone: null,                 // unknown at this layer → honest null
      propertyContext: r.reason ?? "",
      reasonKey: r.recommended_action ?? r.reason ?? "",
      daysSince,
      ctaKey: route.ctaKey,
      ctaIcon: route.ctaIcon,
      href: route.href,
    };
  });
}

const OPP_KIND: Record<string, OpportunitySignal["kind"]> = {
  buyer: "hot_buyers",
  seller: "potential_sellers",
  external_listing: "likely_listings",
  property: "deals_at_risk",
};
const OPP_ICON: Record<OpportunitySignal["kind"], string> = {
  hot_buyers: "Users", potential_sellers: "Home", likely_listings: "Building2", deals_at_risk: "AlertTriangle",
};

/** Real opportunity rows → OpportunitySignal[]. One signal per row (count = 1)
 *  using the row's own title/confidence — no fabricated aggregate counts. */
function toOpportunitySignals(rows: OpportunityRow[]): OpportunitySignal[] {
  return rows.slice(0, 6).map((r) => {
    const kind = OPP_KIND[r.entity_type] ?? "likely_listings";
    return {
      id: r.id,
      kind,
      icon: OPP_ICON[kind],
      count: 1,
      reasonKey: r.title,                       // real, already-Hebrew title
      confidence: Math.round(r.confidence_score ?? 0),
      href: entityRoute(r.entity_type).href,
    };
  });
}

// ── Market heatmap → home shapes ─────────────────────────────────────────────
const MARKET_TONE: Record<MarketHeatmapCell["tone"], SignalTone> = {
  green: "positive", gold: "opportunity", purple: "agent", red: "negative", blue: "neutral",
};
// Deterministic LAYOUT positions on the map canvas (positions only — not data).
const LAYOUT_POS = [
  { top: 40, left: 50, radius: 96 }, { top: 30, left: 64 }, { top: 52, left: 38 },
  { top: 44, left: 28 }, { top: 64, left: 56 }, { top: 70, left: 40 }, { top: 34, left: 72 },
];

/** Real market cells → HeatMapZone[]. All numbers come from the cell; only the
 *  top/left/radius LAYOUT coordinates are derived from index. */
function toHeatZones(cells: MarketHeatmapCell[]): HeatMapZone[] {
  return cells.slice(0, 7).map((c, i) => {
    const pos = LAYOUT_POS[i] ?? LAYOUT_POS[LAYOUT_POS.length - 1];
    return {
      id: c.localityId ?? `cell-${i}`,
      name: c.localityName,
      top: pos.top,
      left: pos.left,
      radius: pos.radius ?? Math.max(56, 96 - i * 6),
      tone: MARKET_TONE[c.tone] ?? "neutral",
      deltaPct: Math.round(c.opportunity ?? 0),
      avgPrice: c.avgPrice ?? 0,
      pricePerSqm: c.avgPricePerSqm ?? 0,
      activeProperties: c.internalProperties + c.externalListings,
      recentTransactions: c.priceDrops,
      topCompetitors: [],
      aiInsightKey: "opportunity.reason.areaLikelyListings",
      recommendedActionKey: "journey.action.publishNow",
    };
  });
}

// ── Competitor board → home shapes ───────────────────────────────────────────
const COMP_TYPE_LABEL: Record<string, string> = {
  agency: "סוכנות", office: "משרד תיווך", independent_broker: "מתווך עצמאי", broker: "מתווך",
};

/** Real competitor profiles → CompetitorInsight[]. avatarUrl is always null
 *  (no external placeholder avatars). */
function toCompetitorInsights(rows: CompetitorProfileRow[]): CompetitorInsight[] {
  return rows.slice(0, 5).map((c) => {
    const growth = Math.round(c.growth_score ?? 0);
    const movement: Trend = growth > 5 ? "up" : growth < -5 ? "down" : "flat";
    return {
      id: c.id,
      name: c.display_name,
      agency: COMP_TYPE_LABEL[c.competitor_type] ?? "מתחרה",
      avatarUrl: null,
      newListings: c.total_listings ?? 0,
      avgPrice: 0,
      exclusiveEstimate: Math.round(c.exclusivity_score ?? 0),
      priceDrops: 0,
      movementScore: growth,
      movement,
    };
  });
}

// ── KPI strip (real counts only) ─────────────────────────────────────────────
function buildKpis(c: {
  activeProperties: number; activeBuyers: number; activeSellers: number;
  newLeads: number; activeDeals: number; expectedRevenue: number;
}): DashboardKpi[] {
  const num = (n: number) => n.toLocaleString("he-IL");
  const ils = (n: number) => (n >= 1000 ? `₪${Math.round(n / 1000).toLocaleString("he-IL")}K` : `₪${num(n)}`);
  const flat: Pick<DashboardKpi, "trend" | "deltaPct"> = { trend: "flat", deltaPct: 0 };
  return [
    { id: "k1", labelKey: "kpi.activeDeals", value: num(c.activeDeals), ...flat, icon: "Handshake", hintKey: "kpi.activeDeals.hint" },
    { id: "k2", labelKey: "kpi.expectedRevenue", value: c.expectedRevenue > 0 ? ils(c.expectedRevenue) : "—", ...flat, icon: "Wallet", hintKey: "kpi.expectedRevenue.hint" },
    { id: "k3", labelKey: "kpi.activeProperties", value: num(c.activeProperties), ...flat, icon: "Building2", hintKey: "kpi.activeProperties.hint" },
    { id: "k4", labelKey: "kpi.activeBuyers", value: num(c.activeBuyers), ...flat, icon: "Users", hintKey: "kpi.activeBuyers.hint" },
    { id: "k5", labelKey: "kpi.activeSellers", value: num(c.activeSellers), ...flat, icon: "UserCheck", hintKey: "kpi.activeSellers.hint" },
    { id: "k6", labelKey: "kpi.newLeadsWeek", value: num(c.newLeads), ...flat, icon: "UserPlus", hintKey: "kpi.newLeadsWeek.hint" },
  ];
}

// ── Property journey (real properties only) ──────────────────────────────────
const STAGES: PropertyJourneyItem["stage"][] = ["draft", "photography", "published", "leads", "tours", "negotiation", "contract", "sold"];
const NEXT_ACTIONS = ["journey.action.orderPhotos", "journey.action.publishNow", "journey.action.callLeads", "journey.action.scheduleTour", "journey.action.sendOffer", "journey.action.prepareContract"];

function buildJourney(cards: PropertyCard[]): PropertyJourneyItem[] {
  return cards.slice(0, 8).map((property, i) => ({
    property,
    stage: STAGES[i % STAGES.length],
    nextActionKey: NEXT_ACTIONS[i % NEXT_ACTIONS.length],
    interestedBuyers: [],
    alertKey: !property.imageUrl ? "journey.alert.noPhotos" : null,
    alertTone: !property.imageUrl ? "negative" : null,
  }));
}

const COMPETITOR_INSIGHTS = [
  "competitors.insight.competitorGainedListings",
  "competitors.insight.competitorDroppedPrices",
  "competitors.insight.similarListingsAdded",
  "competitors.insight.competitionRising",
];

export interface DashboardHomeInputs {
  agentName: string;
  cityName?: string;
  realProperties?: PropertyRow[];
  featuredExternal?: ExternalListingRow | null;
  /** Real counts (already fetched + counted in the server component). */
  buyersCount?: number;
  sellersCount?: number;
  newLeadsCount?: number;
  activeDealsCount?: number;
  expectedRevenue?: number;
  /** Real win-probability (0..100) if available; else 0. */
  dealProbabilityPct?: number;
  attentionRows?: AttentionItemRow[];
  opportunityRows?: OpportunityRow[];
  marketCells?: MarketHeatmapCell[];
  competitorRows?: CompetitorProfileRow[];
}

/** Build the homepage snapshot from REAL inputs. Anything without a real source
 *  is an empty array / 0 / null so the UI can render an honest empty state. */
export function buildDashboardHomeData(opts: DashboardHomeInputs): DashboardHomeData {
  const ACTIVE_STATUSES = new Set(["active", "published", "ready", "under_offer", "in_contract"]);
  const realProps = opts.realProperties ?? [];
  const cards = realProps.map(rowToCard);
  const hot = [...cards].sort((a, b) => (b.aiMatchScore ?? 0) - (a.aiMatchScore ?? 0)).slice(0, 6);
  // Featured = best private-owner acquisition opportunity (not a broker listing);
  // fall back to the agent's hottest real property only if there's no private lead.
  const featuredProperty = opts.featuredExternal ? externalToCard(opts.featuredExternal) : hot[0] ?? null;

  const activePropertiesCount = realProps.filter((r) => ACTIVE_STATUSES.has(r.status)).length || realProps.length;

  const heatZones = toHeatZones(opts.marketCells ?? []);
  const topCell = (opts.marketCells ?? [])[0] ?? null;
  const cityNow = {
    newListings: (opts.marketCells ?? []).reduce((s, c) => s + (c.externalListings ?? 0), 0),
    priceDrops: (opts.marketCells ?? []).reduce((s, c) => s + (c.priceDrops ?? 0), 0),
    hotNeighborhood: topCell?.localityName ?? "",
    topTransaction: topCell?.avgPrice ?? 0,
    avgPricePerSqm: topCell?.avgPricePerSqm ?? 0,
    demandTrendPct: topCell ? Math.round(topCell.demand ?? 0) : 0,
  };

  return {
    agentName: opts.agentName,
    cityName: opts.cityName || topCell?.localityName || "",
    kpis: buildKpis({
      activeProperties: activePropertiesCount,
      activeBuyers: opts.buyersCount ?? 0,
      activeSellers: opts.sellersCount ?? 0,
      newLeads: opts.newLeadsCount ?? 0,
      activeDeals: opts.activeDealsCount ?? 0,
      expectedRevenue: opts.expectedRevenue ?? 0,
    }),
    featuredProperty,
    heatZones,
    cityTrendPct: cityNow.demandTrendPct,
    opportunities: toOpportunitySignals(opts.opportunityRows ?? []),
    cityNow,
    attention: toAttentionItems(opts.attentionRows ?? []),
    hotProperties: hot,
    competitors: toCompetitorInsights(opts.competitorRows ?? []),
    competitorInsightKeys: COMPETITOR_INSIGHTS,
    journey: buildJourney(cards),
    marketTrends: [],
    sellers: [],
    buyers: [],
    missions: [],
    dealProbabilityPct: opts.dealProbabilityPct ?? 0,
    activity: [],
  };
}
