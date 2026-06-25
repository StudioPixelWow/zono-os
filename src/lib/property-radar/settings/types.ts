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
}

export interface ProviderAvailability {
  name: PropertyProviderName;
  label: string;
  /** Implemented in code (yad2/madlan are real now; mock is dev-only). */
  implemented: boolean;
  /** Connector configured via env (token + actor present). */
  configured: boolean;
}

export interface PropertyRadarPageData {
  settings: PropertyRadarSettingsForm;
  status: PropertyRadarStatus;
  providers: ProviderAvailability[];
  isDev: boolean;
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
