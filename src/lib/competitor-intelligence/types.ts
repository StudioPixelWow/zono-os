// ============================================================================
// ZONO — Competitor Intelligence™ types (Phase 17, client-safe, no I/O).
// Infers competitor (office/agency) activity from PUBLIC market listings already
// collected by Property Radar. Never uses private CRM data. Market share is an
// ESTIMATE based on collected public listings — never presented as official.
// ============================================================================

export type CompetitorConfidenceSource =
  | "explicit_agency" | "broker_office_field" | "phone_group" | "contact_name" | "unknown";

export type AlertType =
  | "competitor_spike" | "competitor_price_drop_wave" | "competitor_new_area"
  | "market_share_change" | "aggressive_pricing";

export type Severity = "low" | "medium" | "high" | "urgent";
export type Trend = "up" | "down" | "stable";

// ── Classifier ───────────────────────────────────────────────────────────────
/** Raw, PUBLIC listing signal fields (the only inputs the classifier may read). */
export interface ListingSignal {
  marketPropertySourceId: string;
  provider: string | null;
  listingType: string | null;     // private listings are NEVER classified
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  price: number | null;
  rooms: number | null;
  sizeSqm: number | null;
  contactName: string | null;
  phone: string | null;
  /** Public agency/office/broker fields lifted from raw_metadata / raw payload. */
  agencyName: string | null;
  officeName: string | null;
  brokerName: string | null;
  firstSeenAt: string | null;
}

export interface ClassificationResult {
  /** null = not a competitor (private / insufficient evidence). */
  competitorName: string | null;
  normalizedName: string | null;
  confidence: number;             // 0..100
  confidenceSource: CompetitorConfidenceSource;
  evidence: Record<string, unknown>;
}

// ── Profiles + links + analytics ─────────────────────────────────────────────
export interface CompetitorProfile {
  id: string;
  competitorName: string;
  normalizedName: string;
  confidence: number;
  active: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface CompetitorListingLink {
  id: string;
  competitorProfileId: string;
  marketPropertySourceId: string;
  provider: string | null;
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  listingType: string | null;
  price: number | null;
  rooms: number | null;
  sizeSqm: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  status: string;
  confidence: number;
}

export interface CompetitorAnalytics {
  competitorProfileId: string;
  competitorName: string;
  confidence: number;
  activeListings: number;
  newListingsToday: number;
  newListingsThisWeek: number;
  priceDrops: number;
  removedListings: number;
  backOnMarket: number;
  avgPrice: number | null;
  avgDaysOnMarket: number | null;
  strongestNeighborhoods: { area: string; count: number }[];
  propertyTypeMix: { key: string; count: number; percent: number }[];
  priceSegmentMix: { key: string; count: number; percent: number }[];
  estimatedSharePercent: number;   // labeled estimate
  shareConfidence: "low" | "medium" | "high";
  trendVsLastWeek: Trend;
  trendDeltaPercent: number | null;
}

// ── Market share ─────────────────────────────────────────────────────────────
export interface MarketShareEstimate {
  competitorProfileId: string;
  competitorName: string;
  city: string | null;
  neighborhood: string | null;
  competitorActiveListings: number;
  totalMonitoredActiveListings: number;
  estimatedSharePercent: number;
  confidence: "low" | "medium" | "high";
  /** Honest disclosure label, always shown in UI. */
  label: string;
}

// ── Trends ─────────────────────────────────────────────────────────────────--
export interface AreaTrend {
  city: string | null;
  neighborhood: string | null;
  activeListings: number;
  newListings: number;
  priceDrops: number;
  competitorsActive: number;
  trend: Trend;
  heatScore: number;               // 0..100, deterministic
}

// ── Alerts ─────────────────────────────────────────────────────────────────--
export interface CompetitorAlert {
  id: string;
  competitorProfileId: string | null;
  competitorName: string | null;
  alertType: AlertType;
  severity: Severity;
  title: string;
  message: string;
  city: string | null;
  neighborhood: string | null;
  status: "unread" | "read";
  createdAt: string;
}

/** Already-stored alert key used for 24h dedup. */
export interface ExistingAlertKey {
  alertType: string;
  competitorProfileId: string | null;
  city: string | null;
  neighborhood: string | null;
  createdAt: string;
  status: string;
}

// ── KPIs + comparison + map ───────────────────────────────────────────────────
export interface CompetitorKpis {
  trackedCompetitors: number;
  competitorActiveListings: number;
  newCompetitorListingsToday: number;
  competitorPriceDropsToday: number;
  heatingAreas: number;
  ourEstimatedSharePercent: number;
  ourShareConfidence: "low" | "medium" | "high";
  monitoredActiveListings: number;
}

export interface OfficeVsMarketRow {
  area: string;
  ourActiveListings: number;
  competitorActiveListings: number;
  monitoredActiveListings: number;
  ourSharePercent: number;
  topCompetitorName: string | null;
  topCompetitorSharePercent: number;
  position: "leading" | "competitive" | "trailing";
}

export interface CompetitorMapPoint {
  id: string; lat: number; lng: number; title: string; details: string[];
  tone: "brand" | "success" | "warning" | "danger";
}

// ── Composed dashboard ─────────────────────────────────────────────────────--
export interface CompetitorDashboard {
  role: "manager" | "office_owner" | "agent" | "enterprise_admin" | "team_leader";
  scopeNote: string;
  kpis: CompetitorKpis;
  summary: string[];
  competitors: CompetitorAnalytics[];
  areaTrends: AreaTrend[];
  priceDrops: CompetitorPriceDropItem[];
  marketShare: MarketShareEstimate[];
  comparison: OfficeVsMarketRow[];
  alerts: CompetitorAlert[];
  mapPoints: CompetitorMapPoint[];
  generatedAt: string;
}

export interface CompetitorPriceDropItem {
  marketPropertySourceId: string | null;
  competitorName: string | null;
  competitorConfidence: number | null;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  priceDelta: number | null;
  priceDeltaPercent: number | null;
  at: string;
  belowAreaAverage: boolean;
}

// ── Snapshot payload ─────────────────────────────────────────────────────────
export interface CompetitorSnapshotResult {
  ok: boolean;
  classifiedListings: number;
  competitors: number;
  links: number;
  areaMetrics: number;
  alerts: number;
}
