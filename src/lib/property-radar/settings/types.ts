// ============================================================================
// ZONO Property Radar™ — settings page DTOs (client-safe).
// ============================================================================
import type { PropertyProviderName } from "../types";

export interface PropertyRadarSettingsForm {
  sync_enabled: boolean;
  smart_sync_enabled: boolean;
  provider_yad2_enabled: boolean;
  provider_madlan_enabled: boolean;
  private_property_alerts_enabled: boolean;
  popup_alerts_enabled: boolean;
  only_private_popups: boolean;
  min_popup_opportunity_score: number;
  max_daily_credits: number;
  max_pages_per_scan: number;
  unchanged_streak_stop_threshold: number;
  max_popups_per_10_minutes: number;
  quiet_mode_enabled: boolean;
  whatsapp_template: string;
}

export interface PropertyRadarRunRow {
  id: string;
  provider: string;
  city: string | null;
  neighborhood: string | null;
  runType: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  scanned: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  deletedCount: number;
  creditsUsed: number;
  creditsSaved: number;
}

export interface DailyMarketRefreshStats {
  lastRefreshAt: string | null;
  priceDropsToday: number;
  hotDealsToday: number;
  backOnMarketToday: number;
  buyerMatchesGainedToday: number;
}

export interface PropertyRadarStatus {
  lastSuccessfulSyncAt: string | null;
  nextEstimatedSyncAt: string | null;
  activeAreasCount: number;
  providersEnabled: string[];
  creditsUsedToday: number;
  creditsRemainingToday: number;
  newListingsToday: number;
  alertsCreatedToday: number;
  scannedToday: number;
  fullFetchesToday: number;
  creditsSavedToday: number;
  recentRuns: PropertyRadarRunRow[];
  dailyMarket: DailyMarketRefreshStats;
}

export type ProviderHealthStatus = "online" | "not_configured" | "disabled" | "error" | "unknown";

export interface ProviderHealth {
  provider: PropertyProviderName;
  label: string;
  /** Implemented in code (yad2/madlan are real; mock is dev-only). */
  implemented: boolean;
  /** Connector configured via env (mode apify + token + actor present). */
  configured: boolean;
  /** Enabled via settings/env. */
  enabled: boolean;
  status: ProviderHealthStatus;
  lastSuccessfulRunAt: string | null;
  failuresToday: number;
  averageDurationMs: number | null;
  message: string;
}

/** Env presence summary — booleans only, never the secret values. */
export interface ProviderEnvSummary {
  providerMode: "mock" | "apify" | "none";
  apifyTokenExists: boolean;
  yad2ActorConfigured: boolean;
  madlanActorConfigured: boolean;
}

export interface MarketCacheSummary {
  freshCount: number;
  staleCount: number;
  scanningCount: number;
  errorCount: number;
  areasCount: number;
  lastMarketScanAt: string | null;
  duplicateScansAvoided: number;
}

export interface PropertyRadarPageData {
  settings: PropertyRadarSettingsForm;
  status: PropertyRadarStatus;
  health: ProviderHealth[];
  env: ProviderEnvSummary;
  market: MarketCacheSummary;
  schedulerMode: "market" | "org";
  isDev: boolean;
}

export interface ManualMarketResultDTO {
  ok: boolean;
  provider: string | null;
  skippedReason?: string;
  areasProcessed: number;
  scanned: number;
  cacheFresh: number;
  linksCreated: number;
  alerts: number;
  errors: string[];
}

export interface ManualSyncResultDTO {
  ok: boolean;
  provider: string | null;
  skippedReason?: string;
  scanned: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  deletedCount: number;
  alerts: number;
  creditsUsed: number;
  creditsSaved: number;
  errors: string[];
}
