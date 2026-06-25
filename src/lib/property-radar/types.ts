// ============================================================================
// ZONO Property Radar™ — Phase 1 types (client-safe, no runtime deps).
// Mirrors the 6 foundation tables 1:1. New tables are accessed via
// `.from("<table>" as never)` until the generated Database types catch up.
// ============================================================================

// ── Enums / unions ───────────────────────────────────────────────────────────
// 'mock' is a DEV/TEST-ONLY provider — never used as real market data and never
// persisted to production sources. Real providers: yad2 | madlan.
export type PropertyProviderName = "mock" | "yad2" | "madlan";
export type ListingType = "private" | "broker" | "project" | "unknown";
export type SourceStatus = "active" | "missing" | "deleted" | "error";
export type SyncRunStatus = "running" | "success" | "partial" | "failed";
export type SyncRunType = "automatic" | "manual" | "validation";

export type PropertyAlertType =
  | "new_private_property"
  | "high_opportunity"
  | "price_drop"
  | "updated_property"
  | "deleted_property"
  | "buyer_match";
export type PropertyAlertPriority = "low" | "medium" | "high" | "urgent";
export type PropertyAlertStatus = "unread" | "shown" | "read" | "dismissed" | "contacted";

// ── Row interfaces (snake_case to match DB rows) ─────────────────────────────
export interface PropertySyncSource {
  id: string;
  org_id: string;
  provider: string;
  external_id: string;
  external_url: string | null;
  listing_type: ListingType | string;
  source_status: SourceStatus | string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  address_text: string | null;
  property_type: string | null;
  price: number | null;
  rooms: number | null;
  floor: string | null;
  size_sqm: number | null;
  image_url: string | null;
  phone: string | null;
  contact_name: string | null;
  published_at: string | null;
  provider_updated_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_full_synced_at: string | null;
  missing_count: number;
  content_hash: string | null;
  raw_metadata: Record<string, unknown>;
  raw_full_payload: Record<string, unknown>;
  linked_property_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertySyncRun {
  id: string;
  org_id: string;
  provider: string;
  area_id: string | null;
  city: string | null;
  neighborhood: string | null;
  run_type: SyncRunType | string;
  status: SyncRunStatus | string;
  started_at: string | null;
  finished_at: string | null;
  scanned_count: number;
  new_count: number;
  updated_count: number;
  unchanged_count: number;
  missing_count: number;
  deleted_count: number;
  full_fetch_count: number;
  credits_used: number;
  credits_saved_estimate: number;
  stop_reason: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PropertySyncWatermark {
  id: string;
  org_id: string;
  provider: string;
  area_id: string | null;
  city: string | null;
  neighborhood: string | null;
  latest_external_id: string | null;
  latest_published_at: string | null;
  latest_seen_hash: string | null;
  last_successful_scan_at: string | null;
  last_page_scanned: number;
  unchanged_streak_stop_threshold: number;
  max_pages_per_scan: number;
  stop_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PropertyAlert {
  id: string;
  org_id: string;
  agent_id: string | null;
  property_source_id: string | null;
  linked_property_id: string | null;
  alert_type: PropertyAlertType | string;
  title: string;
  message: string | null;
  priority: PropertyAlertPriority | string;
  status: PropertyAlertStatus | string;
  opportunity_score: number | null;
  shown_at: string | null;
  clicked_at: string | null;
  dismissed_at: string | null;
  contacted_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface PropertyOpportunityScore {
  id: string;
  org_id: string;
  property_source_id: string | null;
  linked_property_id: string | null;
  total_score: number;
  private_listing_score: number;
  area_expertise_score: number;
  buyer_match_score: number;
  market_price_score: number;
  freshness_score: number;
  rarity_score: number;
  seller_motivation_score: number;
  exclusivity_potential_score: number;
  reasons: unknown[];
  recommendation: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyRadarSettings {
  id: string;
  org_id: string;
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
  whatsapp_template: string | null;
  created_at: string;
  updated_at: string;
}

// ── Table-name constants (used with `.from(TABLE as never)`) ─────────────────
export const RADAR_TABLES = {
  sources: "property_sync_sources",
  runs: "property_sync_runs",
  watermarks: "property_sync_watermarks",
  alerts: "property_alerts",
  scores: "property_opportunity_scores",
  settings: "property_radar_settings",
} as const;
