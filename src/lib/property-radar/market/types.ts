// ============================================================================
// ZONO Property Radar™ — shared market cache types (client-safe, no I/O).
// Row shapes for the market_* tables + the MarketRepository contract so the
// market engine/fan-out are storage-agnostic (real Supabase impl in repository.ts;
// in-memory impl in the dev-check).
// ============================================================================
import type { PropertyProviderName } from "../types";
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyRadarArea,
} from "../providers/types";
import type { OpportunityScoreResult, RadarSettingsLite } from "../intelligence/types";

// ── Row shapes ───────────────────────────────────────────────────────────────
export interface MarketPropertySource {
  id: string;
  provider: string;
  external_id: string;
  source_status: string;
  content_hash: string | null;
  missing_count: number;
  price: number | null;
  city: string | null;
  neighborhood: string | null;
  published_at: string | null;
  last_seen_at: string | null;
  market_area_key: string | null;
}

export interface MarketSyncWatermark {
  id?: string;
  provider: string;
  market_area_key: string;
  latest_external_id: string | null;
  latest_published_at: string | null;
  last_successful_scan_at: string | null;
  last_page_scanned: number | null;
  ttl_minutes: number | null;
  stop_reason: string | null;
}

export interface MarketAreaCacheState {
  id?: string;
  provider: string;
  market_area_key: string;
  city: string | null;
  neighborhood: string | null;
  last_scan_at: string | null;
  next_scan_after: string | null;
  ttl_minutes: number;
  status: "fresh" | "stale" | "scanning" | "error" | string;
  active_orgs_count: number;
  active_agents_count: number;
  listings_count: number;
  last_new_count: number;
  last_updated_count: number;
  last_error_message: string | null;
}

export interface OrgMarketPropertyLink {
  id: string;
  org_id: string;
  market_property_source_id: string;
  relevance_status: string;
  opportunity_score: number | null;
  buyer_match_count: number;
}

export interface RelevantOrg {
  orgId: string;
}

// ── Run record patches ───────────────────────────────────────────────────────
export interface CreateMarketSyncRunInput {
  provider: PropertyProviderName;
  marketAreaKey: string;
  city: string | null;
  neighborhood: string | null;
  runType: "automatic" | "manual" | "validation";
}

export interface FinishMarketSyncRunPatch {
  status: "success" | "partial" | "failed";
  scannedCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  deletedCount: number;
  fullFetchCount: number;
  creditsUsed: number;
  creditsSavedEstimate: number;
  affectedOrgsCount: number;
  alertsCreatedCount: number;
  stopReason?: string | null;
  errorMessage?: string | null;
}

export interface UpsertMarketWatermarkPatch {
  latestExternalId?: string | null;
  latestPublishedAt?: string | null;
  lastSuccessfulScanAt?: string | null;
  lastPageScanned?: number | null;
  stopReason?: string | null;
}

export interface UpsertCacheStatePatch {
  city: string | null;
  neighborhood: string | null;
  lastScanAt?: string | null;
  nextScanAfter?: string | null;
  ttlMinutes?: number;
  status?: MarketAreaCacheState["status"];
  activeOrgsCount?: number;
  listingsCount?: number;
  lastNewCount?: number;
  lastUpdatedCount?: number;
  lastErrorMessage?: string | null;
}

export interface UpsertOrgLinkPatch {
  agentId?: string | null;
  relevanceStatus?: string;
  opportunityScore?: number | null;
  buyerMatchCount?: number;
  reasons?: string[];
  recommendation?: string | null;
}

// ── Engine + fan-out I/O ─────────────────────────────────────────────────────
export interface MarketSyncInput {
  providerName: PropertyProviderName;
  area: PropertyRadarArea;
  runType?: "automatic" | "manual" | "validation";
  options?: {
    maxPages?: number;
    unchangedStreakStopThreshold?: number;
    forceRefresh?: boolean;
    dryRun?: boolean;
  };
}

export interface MarketSyncResult {
  runId: string;
  provider: PropertyProviderName;
  marketAreaKey: string;
  status: "success" | "partial" | "failed" | "cache_fresh";
  scannedCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  deletedCount: number;
  fullFetchCount: number;
  creditsUsed: number;
  creditsSavedEstimate: number;
  affectedOrgsCount: number;
  alertsCreatedCount: number;
  errors: string[];
}

/** A changed/new shared source ready to fan out to orgs. */
export interface FanoutSource {
  sourceId: string;
  source: NormalizedListingMetadata | NormalizedListingDetails;
  isNew: boolean;
  isUpdate: boolean;
  priceDropped: boolean;
}

export interface FanoutInput {
  provider: PropertyProviderName;
  marketAreaKey: string;
  city: string;
  neighborhood: string | null;
  marketSources: FanoutSource[];
}

export interface FanoutResult {
  affectedOrgsCount: number;
  linksCreated: number;
  scoresUpdated: number;
  alertsCreated: number;
}

// ── Repository contract (service-role impl; in-memory in tests) ──────────────
export interface MarketRepository {
  createMarketSyncRun(input: CreateMarketSyncRunInput): Promise<string>;
  finishMarketSyncRun(runId: string, patch: FinishMarketSyncRunPatch): Promise<void>;
  getMarketWatermark(provider: PropertyProviderName, marketAreaKey: string): Promise<MarketSyncWatermark | null>;
  upsertMarketWatermark(provider: PropertyProviderName, marketAreaKey: string, patch: UpsertMarketWatermarkPatch): Promise<void>;
  getExistingMarketSourcesForArea(provider: PropertyProviderName, marketAreaKey: string): Promise<MarketPropertySource[]>;
  getMarketSourceByExternalId(provider: PropertyProviderName, externalId: string): Promise<MarketPropertySource | null>;
  insertMarketSourceFromMetadata(metadata: NormalizedListingMetadata, marketAreaKey: string, hash: string): Promise<string>;
  updateMarketSourceSeen(sourceId: string, metadata: NormalizedListingMetadata, hash: string): Promise<void>;
  updateMarketSourceFullDetails(sourceId: string, details: NormalizedListingDetails, hash: string): Promise<void>;
  markMarketSourceMissing(sourceId: string): Promise<void>;
  markMarketSourceDeleted(sourceId: string): Promise<void>;
  getMarketAreaCacheState(provider: PropertyProviderName, marketAreaKey: string): Promise<MarketAreaCacheState | null>;
  upsertMarketAreaCacheState(provider: PropertyProviderName, marketAreaKey: string, patch: UpsertCacheStatePatch): Promise<void>;
  // Fan-out
  getRelevantOrgsForMarketArea(city: string, neighborhood: string | null): Promise<RelevantOrg[]>;
  getOrgRadarSettings(orgId: string): Promise<RadarSettingsLite>;
  upsertOrgMarketPropertyLink(orgId: string, marketPropertySourceId: string, patch: UpsertOrgLinkPatch): Promise<{ linkId: string; created: boolean }>;
  existingUnreadMarketAlertExists(orgId: string, marketPropertySourceId: string, alertType: string): Promise<boolean>;
  insertMarketAlert(input: InsertMarketAlertInput): Promise<void>;
}

export interface InsertMarketAlertInput {
  orgId: string;
  marketPropertySourceId: string;
  orgMarketPropertyLinkId: string;
  alertType: string;
  title: string;
  message: string;
  priority: string;
  opportunityScore: number;
  metadata: Record<string, unknown>;
}

// Re-export for convenience.
export type { OpportunityScoreResult };
