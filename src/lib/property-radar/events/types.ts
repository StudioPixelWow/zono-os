// ============================================================================
// ZONO Property Radar™ — Phase 11 daily market events types (client-safe, no I/O).
// The daily refresh detects meaningful changes in the SHARED market cache and
// fans the consequences (matches/scores/alerts/tasks) into the per-org tables.
// ============================================================================
import type { PropertyProviderName } from "../types";
import type { NormalizedListingMetadata } from "../providers/types";
import type { MarketPropertySource } from "../market/types";

export type MarketEventType =
  | "price_drop"
  | "price_increase"
  | "removed"
  | "back_on_market"
  | "status_changed"
  | "metadata_changed"
  | "buyer_match_gained"
  | "buyer_match_lost"
  | "hot_deal";

export type MarketEventSeverity = "low" | "medium" | "high" | "urgent";

// ── Detected event (pre-persistence) ─────────────────────────────────────────
export interface DetectedMarketEvent {
  eventType: MarketEventType;
  severity: MarketEventSeverity;
  previousValue: Record<string, unknown>;
  nextValue: Record<string, unknown>;
  priceDelta?: number | null;
  priceDeltaPercent?: number | null;
  metadata?: Record<string, unknown>;
}

/** Result of pairwise diffing a previous source against fresh metadata. */
export interface PropertyChangeDiff {
  changed: boolean;
  events: DetectedMarketEvent[];
  nextHash: string;
  priceDropped: boolean;
  /** A new full-fetch is warranted (hash changed). */
  needsFullFetch: boolean;
}

// ── Persisted row ─────────────────────────────────────────────────────────────
export interface MarketPropertyEvent {
  id: string;
  market_property_source_id: string | null;
  provider: string;
  market_area_key: string | null;
  city: string | null;
  neighborhood: string | null;
  event_type: MarketEventType | string;
  previous_value: Record<string, unknown>;
  next_value: Record<string, unknown>;
  price_delta: number | null;
  price_delta_percent: number | null;
  severity: MarketEventSeverity | string;
  detected_at: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface InsertMarketEventInput {
  marketPropertySourceId: string;
  provider: PropertyProviderName;
  marketAreaKey: string | null;
  city: string | null;
  neighborhood: string | null;
  eventType: MarketEventType;
  severity: MarketEventSeverity;
  previousValue: Record<string, unknown>;
  nextValue: Record<string, unknown>;
  priceDelta?: number | null;
  priceDeltaPercent?: number | null;
  metadata?: Record<string, unknown>;
}

// ── Active area (from market_area_cache_state) ───────────────────────────────
export interface ActiveMarketArea {
  provider: PropertyProviderName;
  marketAreaKey: string;
  city: string | null;
  neighborhood: string | null;
}

// ── Refresh I/O ───────────────────────────────────────────────────────────────
export interface DailyMarketRefreshInput {
  providerName?: PropertyProviderName;
  marketAreaKey?: string;
  maxListings?: number;
  dryRun?: boolean;
  forceFullFetch?: boolean;
  /** Cap how many areas to process in one run (credit control). */
  maxAreas?: number;
}

export interface DailyMarketRefreshResult {
  status: "success" | "partial" | "failed";
  providers: PropertyProviderName[];
  areasProcessed: number;
  sourcesRefreshed: number;
  metadataScans: number;
  fullFetches: number;
  eventsCreated: number;
  priceDrops: number;
  priceIncreases: number;
  hotDeals: number;
  removed: number;
  backOnMarket: number;
  statusChanged: number;
  metadataChanged: number;
  buyerMatchGained: number;
  buyerMatchLost: number;
  alertsCreated: number;
  matchesRecalculated: number;
  affectedOrgs: number;
  creditsUsedEstimate: number;
  errors: string[];
}

// ── Timeline (UI) ─────────────────────────────────────────────────────────────
export interface MarketTimelineEntry {
  at: string;
  kind: "first_seen" | "price_change" | "status_change" | "alert" | "buyer_match_change" | "event";
  label: string;
  detail?: Record<string, unknown>;
}

export interface MarketPropertyTimeline {
  marketPropertySourceId: string;
  firstSeen: string | null;
  entries: MarketTimelineEntry[];
}

// ── Repository contract (server impl + in-memory dev-check) ──────────────────
export interface MarketEventRepository {
  /** Active/scannable areas to refresh (from market_area_cache_state). */
  getActiveMarketAreas(providerName?: PropertyProviderName, marketAreaKey?: string): Promise<ActiveMarketArea[]>;
  insertMarketEvent(input: InsertMarketEventInput): Promise<string>;
  /** True if an unread org alert of this event-type for the source exists within `sinceIso`. */
  recentOrgEventAlertExists(orgId: string, marketPropertySourceId: string, alertType: string, sinceIso: string): Promise<boolean>;
  /** Ordered timeline (events + alerts) for one source. */
  getMarketPropertyTimeline(marketPropertySourceId: string): Promise<MarketPropertyTimeline>;
  /** Today's event counts grouped by type, scoped to the given cities (org relevance). */
  countTodaysEventsForCities(cities: string[], sinceIso: string): Promise<Record<string, number>>;
  /** Most recent event detected_at across the given cities (last refresh proxy). */
  lastRefreshAtForCities(cities: string[]): Promise<string | null>;
}

export type { MarketPropertySource, NormalizedListingMetadata };
