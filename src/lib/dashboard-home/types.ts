// ============================================================================
// ZONO — AI Real Estate Operating System · Home (Command Center) data contracts
// ----------------------------------------------------------------------------
// Production-shaped types for the redesigned homepage. Data may be mock today
// (see ./data.ts) but the shapes mirror what the API/Supabase will return so
// swapping in live data is a drop-in. All user-facing labels live in the i18n
// dictionaries (locales/*/dashboard.json) — never in components.
// ============================================================================

export type Trend = "up" | "down" | "flat";
export type SignalTone = "positive" | "negative" | "opportunity" | "agent" | "neutral";

/** A KPI tile in the hero command center. `labelKey` resolves via i18n. */
export interface DashboardKpi {
  id: string;
  labelKey: string;
  value: string;
  trend: Trend;
  deltaPct: number;
  icon: string;
  hintKey: string;
}

/** Canonical property preview — every property surface uses this shape so a
 *  property is never rendered as text only (image/price/location are required). */
export interface PropertyCard {
  id: string;
  imageUrl: string | null;
  title: string;
  city: string;
  neighborhood: string;
  addressLine: string;
  price: number;
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  statusKey: string;
  /** Visual badge: new | hot | exclusive | price_drop | ai_pick */
  badgeKey: string | null;
  aiMatchScore: number | null;
  aiInsightKey: string | null;
  href: string;
}

/** One colored zone on the city heat map. */
export interface HeatMapZone {
  id: string;
  name: string;
  /** percentage position on the map canvas */
  top: number;
  left: number;
  radius: number;
  tone: SignalTone;
  deltaPct: number;
  avgPrice: number;
  pricePerSqm: number;
  activeProperties: number;
  recentTransactions: number;
  topCompetitors: string[];
  aiInsightKey: string;
  recommendedActionKey: string;
}

export type HeatMapMetric =
  | "price_per_sqm" | "buyer_demand" | "rental_demand"
  | "new_listings" | "recent_transactions" | "price_drops";

/** A signal surfaced by the AI Opportunity Radar. */
export interface OpportunitySignal {
  id: string;
  kind: "hot_buyers" | "potential_sellers" | "likely_listings" | "deals_at_risk";
  icon: string;
  count: number;
  reasonKey: string;
  confidence: number;
  href: string;
}

/** A competing agent row in the competitor-intelligence section. */
export interface CompetitorInsight {
  id: string;
  name: string;
  agency: string;
  avatarUrl: string | null;
  newListings: number;
  avgPrice: number;
  exclusiveEstimate: number;
  priceDrops: number;
  movementScore: number;
  movement: Trend;
}

export type JourneyStageKey =
  | "draft" | "photography" | "published" | "leads"
  | "tours" | "negotiation" | "contract" | "sold";

/** A property positioned in the active-property journey (kanban). */
export interface PropertyJourneyItem {
  property: PropertyCard;
  stage: JourneyStageKey;
  nextActionKey: string;
  interestedBuyers: { id: string; name: string; avatarUrl: string | null }[];
  alertKey: string | null;
  alertTone: SignalTone | null;
}

/** A mini-chart series for the market-trends strip. */
export interface MarketTrend {
  id: string;
  labelKey: string;
  current: string;
  deltaPct: number;
  trend: Trend;
  /** normalized 0..1 points for a sparkline */
  points: number[];
}

export interface SellerIntelligenceItem {
  id: string;
  name: string;
  propertyImageUrl: string | null;
  bucket: "hot" | "at_risk" | "follow_up" | "unresponsive";
  relationshipScore: number;
  trustScore: number;
  urgencyScore: number;
  recommendedActionKey: string;
  href: string;
}

export interface BuyerIntelligenceItem {
  id: string;
  name: string;
  avatarUrl: string | null;
  bucket: "hot" | "dormant" | "new_match" | "returning";
  budget: number;
  preferredArea: string;
  matchCount: number;
  lastActivityKey: string;
  href: string;
}

/** A recommended action in AI Mission Control. */
export interface MissionTask {
  id: string;
  labelKey: string;
  icon: string;
  done: boolean;
  time: string | null;
}

export type ActivityKind =
  | "call" | "whatsapp" | "meeting" | "property_update"
  | "buyer_action" | "seller_action" | "ai_recommendation";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  icon: string;
  entity: string;
  detailKey: string;
  time: string;
  propertyImageUrl: string | null;
}

/** Snapshot of the whole homepage. */
export interface DashboardHomeData {
  agentName: string;
  cityName: string;
  kpis: DashboardKpi[];
  featuredProperty: PropertyCard | null;
  heatZones: HeatMapZone[];
  cityTrendPct: number;
  opportunities: OpportunitySignal[];
  cityNow: {
    newListings: number; priceDrops: number; hotNeighborhood: string;
    topTransaction: number; avgPricePerSqm: number; demandTrendPct: number;
  };
  hotProperties: PropertyCard[];
  competitors: CompetitorInsight[];
  competitorInsightKeys: string[];
  journey: PropertyJourneyItem[];
  marketTrends: MarketTrend[];
  sellers: SellerIntelligenceItem[];
  buyers: BuyerIntelligenceItem[];
  missions: MissionTask[];
  dealProbabilityPct: number;
  activity: ActivityEvent[];
}
