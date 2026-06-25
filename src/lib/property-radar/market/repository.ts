// ============================================================================
// ZONO Property Radar™ — shared market repository (server-only, service-role).
// Reads/writes the SHARED market_* tables (no org scoping — these are system
// tables) and the per-org bridge (org_market_property_links) + org alerts.
// Uses the project's `.from(TABLE as never)` cast convention.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RADAR_TABLES } from "../types";
import type { NormalizedListingDetails, NormalizedListingMetadata } from "../providers/types";
import { DEFAULT_RADAR_SETTINGS, type RadarSettingsLite } from "../intelligence/types";
import type {
  CreateMarketSyncRunInput,
  FinishMarketSyncRunPatch,
  InsertMarketAlertInput,
  MarketAreaCacheState,
  MarketPropertySource,
  MarketRepository,
  MarketSyncWatermark,
  RelevantOrg,
  UpsertCacheStatePatch,
  UpsertMarketWatermarkPatch,
  UpsertOrgLinkPatch,
} from "./types";

const MARKET = {
  sources: "market_property_sources",
  runs: "market_sync_runs",
  watermarks: "market_sync_watermarks",
  cache: "market_area_cache_state",
  links: "org_market_property_links",
} as const;

type Db = ReturnType<typeof createServiceRoleClient>;

const SOURCE_SELECT =
  "id, provider, external_id, source_status, content_hash, missing_count, price, city, neighborhood, published_at, last_seen_at, market_area_key";

function sourceRow(m: NormalizedListingMetadata, marketAreaKey: string, hash: string) {
  return {
    provider: m.provider,
    external_id: m.externalId,
    external_url: m.externalUrl ?? null,
    listing_type: m.listingType ?? "unknown",
    title: m.title ?? null,
    city: m.city ?? null,
    neighborhood: m.neighborhood ?? null,
    street: m.street ?? null,
    address_text: m.addressText ?? null,
    property_type: m.propertyType ?? null,
    price: m.price ?? null,
    rooms: m.rooms ?? null,
    floor: m.floor ?? null,
    size_sqm: m.sizeSqm ?? null,
    image_url: m.imageUrl ?? null,
    phone: m.phone ?? null,
    contact_name: m.contactName ?? null,
    published_at: m.publishedAt ?? null,
    provider_updated_at: m.providerUpdatedAt ?? null,
    content_hash: hash,
    raw_metadata: (m.rawMetadata ?? {}) as Record<string, unknown>,
    market_area_key: marketAreaKey,
  };
}

export function createMarketRepository(db: Db = createServiceRoleClient()): MarketRepository {
  return {
    async createMarketSyncRun(input: CreateMarketSyncRunInput): Promise<string> {
      const { data, error } = await db
        .from(MARKET.runs as never)
        .insert({
          provider: input.provider,
          market_area_key: input.marketAreaKey,
          city: input.city,
          neighborhood: input.neighborhood,
          run_type: input.runType,
          status: "running",
          started_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(`createMarketSyncRun failed: ${error.message}`);
      return (data as unknown as { id: string }).id;
    },

    async finishMarketSyncRun(runId: string, patch: FinishMarketSyncRunPatch): Promise<void> {
      const { error } = await db
        .from(MARKET.runs as never)
        .update({
          status: patch.status,
          finished_at: new Date().toISOString(),
          scanned_count: patch.scannedCount,
          new_count: patch.newCount,
          updated_count: patch.updatedCount,
          unchanged_count: patch.unchangedCount,
          missing_count: patch.missingCount,
          deleted_count: patch.deletedCount,
          full_fetch_count: patch.fullFetchCount,
          credits_used: patch.creditsUsed,
          credits_saved_estimate: patch.creditsSavedEstimate,
          affected_orgs_count: patch.affectedOrgsCount,
          alerts_created_count: patch.alertsCreatedCount,
          stop_reason: patch.stopReason ?? null,
          error_message: patch.errorMessage ?? null,
        } as never)
        .eq("id", runId);
      if (error) throw new Error(`finishMarketSyncRun failed: ${error.message}`);
    },

    async getMarketWatermark(provider, marketAreaKey): Promise<MarketSyncWatermark | null> {
      const { data, error } = await db
        .from(MARKET.watermarks as never)
        .select("provider, market_area_key, latest_external_id, latest_published_at, last_successful_scan_at, last_page_scanned, ttl_minutes, stop_reason")
        .eq("provider", provider)
        .eq("market_area_key", marketAreaKey)
        .maybeSingle();
      if (error) throw new Error(`getMarketWatermark failed: ${error.message}`);
      return (data as unknown as MarketSyncWatermark) ?? null;
    },

    async upsertMarketWatermark(provider, marketAreaKey, patch: UpsertMarketWatermarkPatch): Promise<void> {
      const { error } = await db
        .from(MARKET.watermarks as never)
        .upsert(
          {
            provider,
            market_area_key: marketAreaKey,
            latest_external_id: patch.latestExternalId ?? null,
            latest_published_at: patch.latestPublishedAt ?? null,
            last_successful_scan_at: patch.lastSuccessfulScanAt ?? null,
            last_page_scanned: patch.lastPageScanned ?? null,
            stop_reason: patch.stopReason ?? null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "provider,market_area_key" },
        );
      if (error) throw new Error(`upsertMarketWatermark failed: ${error.message}`);
    },

    async getExistingMarketSourcesForArea(provider, marketAreaKey): Promise<MarketPropertySource[]> {
      const { data, error } = await db
        .from(MARKET.sources as never)
        .select(SOURCE_SELECT)
        .eq("provider", provider)
        .eq("market_area_key", marketAreaKey)
        .in("source_status", ["active", "missing"] as never);
      if (error) throw new Error(`getExistingMarketSourcesForArea failed: ${error.message}`);
      return (data ?? []) as unknown as MarketPropertySource[];
    },

    async getMarketSourceByExternalId(provider, externalId): Promise<MarketPropertySource | null> {
      const { data, error } = await db
        .from(MARKET.sources as never)
        .select(SOURCE_SELECT)
        .eq("provider", provider)
        .eq("external_id", externalId)
        .maybeSingle();
      if (error) throw new Error(`getMarketSourceByExternalId failed: ${error.message}`);
      return (data as unknown as MarketPropertySource) ?? null;
    },

    async insertMarketSourceFromMetadata(metadata, marketAreaKey, hash): Promise<string> {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from(MARKET.sources as never)
        .insert({ ...sourceRow(metadata, marketAreaKey, hash), source_status: "active", missing_count: 0, first_seen_at: now, last_seen_at: now } as never)
        .select("id")
        .single();
      if (error) throw new Error(`insertMarketSourceFromMetadata failed: ${error.message}`);
      return (data as unknown as { id: string }).id;
    },

    async updateMarketSourceSeen(sourceId, metadata, hash): Promise<void> {
      // Touch the mutable listing fields + last_seen; never reassign market_area_key.
      const { error } = await db
        .from(MARKET.sources as never)
        .update({
          content_hash: hash,
          source_status: "active",
          missing_count: 0,
          last_seen_at: new Date().toISOString(),
          price: metadata.price ?? null,
          rooms: metadata.rooms ?? null,
          floor: metadata.floor ?? null,
          size_sqm: metadata.sizeSqm ?? null,
          title: metadata.title ?? null,
          listing_type: metadata.listingType ?? "unknown",
          provider_updated_at: metadata.providerUpdatedAt ?? null,
          raw_metadata: (metadata.rawMetadata ?? {}) as Record<string, unknown>,
        } as never)
        .eq("id", sourceId);
      if (error) throw new Error(`updateMarketSourceSeen failed: ${error.message}`);
    },

    async updateMarketSourceFullDetails(sourceId, details: NormalizedListingDetails, hash): Promise<void> {
      const now = new Date().toISOString();
      const { error } = await db
        .from(MARKET.sources as never)
        .update({
          source_status: "active",
          missing_count: 0,
          last_seen_at: now,
          last_full_synced_at: now,
          content_hash: hash,
          phone: details.phone ?? null,
          contact_name: details.contactName ?? null,
          image_url: details.imageUrl ?? null,
          raw_full_payload: (details.rawFullPayload ?? {}) as Record<string, unknown>,
        } as never)
        .eq("id", sourceId);
      if (error) throw new Error(`updateMarketSourceFullDetails failed: ${error.message}`);
    },

    async markMarketSourceMissing(sourceId): Promise<void> {
      const { data, error: re } = await db
        .from(MARKET.sources as never)
        .select("missing_count")
        .eq("id", sourceId)
        .single();
      if (re) throw new Error(`markMarketSourceMissing read failed: ${re.message}`);
      const next = (((data as unknown as { missing_count: number } | null)?.missing_count ?? 0) + 1);
      const { error } = await db
        .from(MARKET.sources as never)
        .update({ source_status: "missing", missing_count: next } as never)
        .eq("id", sourceId);
      if (error) throw new Error(`markMarketSourceMissing failed: ${error.message}`);
    },

    async markMarketSourceDeleted(sourceId): Promise<void> {
      const { error } = await db
        .from(MARKET.sources as never)
        .update({ source_status: "deleted" } as never)
        .eq("id", sourceId);
      if (error) throw new Error(`markMarketSourceDeleted failed: ${error.message}`);
    },

    async getMarketAreaCacheState(provider, marketAreaKey): Promise<MarketAreaCacheState | null> {
      const { data, error } = await db
        .from(MARKET.cache as never)
        .select("*")
        .eq("provider", provider)
        .eq("market_area_key", marketAreaKey)
        .maybeSingle();
      if (error) throw new Error(`getMarketAreaCacheState failed: ${error.message}`);
      return (data as unknown as MarketAreaCacheState) ?? null;
    },

    async upsertMarketAreaCacheState(provider, marketAreaKey, patch: UpsertCacheStatePatch): Promise<void> {
      const row: Record<string, unknown> = {
        provider,
        market_area_key: marketAreaKey,
        city: patch.city,
        neighborhood: patch.neighborhood,
        updated_at: new Date().toISOString(),
      };
      if (patch.lastScanAt !== undefined) row.last_scan_at = patch.lastScanAt;
      if (patch.nextScanAfter !== undefined) row.next_scan_after = patch.nextScanAfter;
      if (patch.ttlMinutes !== undefined) row.ttl_minutes = patch.ttlMinutes;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.activeOrgsCount !== undefined) row.active_orgs_count = patch.activeOrgsCount;
      if (patch.listingsCount !== undefined) row.listings_count = patch.listingsCount;
      if (patch.lastNewCount !== undefined) row.last_new_count = patch.lastNewCount;
      if (patch.lastUpdatedCount !== undefined) row.last_updated_count = patch.lastUpdatedCount;
      if (patch.lastErrorMessage !== undefined) row.last_error_message = patch.lastErrorMessage;
      const { error } = await db
        .from(MARKET.cache as never)
        .upsert(row as never, { onConflict: "provider,market_area_key" });
      if (error) throw new Error(`upsertMarketAreaCacheState failed: ${error.message}`);
    },

    async getRelevantOrgsForMarketArea(city, neighborhood): Promise<RelevantOrg[]> {
      void neighborhood; // city-level relevance for now
      const { data, error } = await db
        .from("user_operating_localities" as never)
        .select("organization_id")
        .eq("city_name", city)
        .eq("is_active", true);
      if (error) throw new Error(`getRelevantOrgsForMarketArea failed: ${error.message}`);
      const rows = (data ?? []) as unknown as { organization_id: string | null }[];
      const ids = [...new Set(rows.map((r) => r.organization_id).filter((v): v is string => !!v))];
      return ids.map((orgId) => ({ orgId }));
    },

    async getMarketSourcesForFanout(provider, marketAreaKey): Promise<{ sourceId: string; source: NormalizedListingMetadata }[]> {
      const { data, error } = await db
        .from(MARKET.sources as never)
        .select("id, provider, external_id, external_url, listing_type, title, city, neighborhood, street, address_text, property_type, price, rooms, floor, size_sqm, image_url, phone, contact_name, published_at, provider_updated_at, raw_metadata")
        .eq("provider", provider)
        .eq("market_area_key", marketAreaKey)
        .eq("source_status", "active")
        .limit(500);
      if (error) throw new Error(`getMarketSourcesForFanout failed: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return rows.map((r) => ({
        sourceId: String(r.id),
        source: {
          provider: String(r.provider) as NormalizedListingMetadata["provider"],
          externalId: String(r.external_id),
          externalUrl: (r.external_url as string | null) ?? null,
          listingType: (r.listing_type as NormalizedListingMetadata["listingType"]) ?? "unknown",
          title: (r.title as string | null) ?? null,
          city: (r.city as string | null) ?? null,
          neighborhood: (r.neighborhood as string | null) ?? null,
          street: (r.street as string | null) ?? null,
          addressText: (r.address_text as string | null) ?? null,
          propertyType: (r.property_type as string | null) ?? null,
          price: (r.price as number | null) ?? null,
          rooms: (r.rooms as number | null) ?? null,
          floor: (r.floor as string | null) ?? null,
          sizeSqm: (r.size_sqm as number | null) ?? null,
          imageUrl: (r.image_url as string | null) ?? null,
          phone: (r.phone as string | null) ?? null,
          contactName: (r.contact_name as string | null) ?? null,
          publishedAt: (r.published_at as string | null) ?? null,
          providerUpdatedAt: (r.provider_updated_at as string | null) ?? null,
          rawMetadata: (r.raw_metadata as Record<string, unknown>) ?? {},
        },
      }));
    },

    async getOrgRadarSettings(orgId): Promise<RadarSettingsLite> {
      const { data } = await db
        .from(RADAR_TABLES.settings as never)
        .select("private_property_alerts_enabled, popup_alerts_enabled, only_private_popups, min_popup_opportunity_score")
        .eq("org_id", orgId)
        .maybeSingle();
      const row = data as unknown as {
        private_property_alerts_enabled: boolean | null;
        popup_alerts_enabled: boolean | null;
        only_private_popups: boolean | null;
        min_popup_opportunity_score: number | null;
      } | null;
      if (!row) return { ...DEFAULT_RADAR_SETTINGS };
      return {
        privatePropertyAlertsEnabled: row.private_property_alerts_enabled ?? DEFAULT_RADAR_SETTINGS.privatePropertyAlertsEnabled,
        popupAlertsEnabled: row.popup_alerts_enabled ?? DEFAULT_RADAR_SETTINGS.popupAlertsEnabled,
        onlyPrivatePopups: row.only_private_popups ?? DEFAULT_RADAR_SETTINGS.onlyPrivatePopups,
        minPopupOpportunityScore: row.min_popup_opportunity_score ?? DEFAULT_RADAR_SETTINGS.minPopupOpportunityScore,
      };
    },

    async upsertOrgMarketPropertyLink(orgId, marketPropertySourceId, patch: UpsertOrgLinkPatch): Promise<{ linkId: string; created: boolean }> {
      const { data: existing } = await db
        .from(MARKET.links as never)
        .select("id")
        .eq("org_id", orgId)
        .eq("market_property_source_id", marketPropertySourceId)
        .maybeSingle();
      const now = new Date().toISOString();
      const fields = {
        agent_id: patch.agentId ?? null,
        relevance_status: patch.relevanceStatus ?? "relevant",
        opportunity_score: patch.opportunityScore ?? null,
        buyer_match_count: patch.buyerMatchCount ?? 0,
        reasons: (patch.reasons ?? []) as unknown as Record<string, unknown>,
        recommendation: patch.recommendation ?? null,
        last_evaluated_at: now,
      };
      const existingId = (existing as unknown as { id: string } | null)?.id;
      if (existingId) {
        const { error } = await db.from(MARKET.links as never).update(fields as never).eq("id", existingId);
        if (error) throw new Error(`upsertOrgMarketPropertyLink update failed: ${error.message}`);
        return { linkId: existingId, created: false };
      }
      const { data, error } = await db
        .from(MARKET.links as never)
        .insert({ org_id: orgId, market_property_source_id: marketPropertySourceId, first_matched_at: now, ...fields } as never)
        .select("id")
        .single();
      if (error) throw new Error(`upsertOrgMarketPropertyLink insert failed: ${error.message}`);
      return { linkId: (data as unknown as { id: string }).id, created: true };
    },

    async existingUnreadMarketAlertExists(orgId, marketPropertySourceId, alertType): Promise<boolean> {
      const { data, error } = await db
        .from(RADAR_TABLES.alerts as never)
        .select("id")
        .eq("org_id", orgId)
        .eq("alert_type", alertType)
        .eq("status", "unread")
        .eq("metadata->>marketPropertySourceId", marketPropertySourceId)
        .limit(1);
      if (error) throw new Error(`existingUnreadMarketAlertExists failed: ${error.message}`);
      return ((data as unknown as unknown[]) ?? []).length > 0;
    },

    async insertMarketAlert(input: InsertMarketAlertInput): Promise<void> {
      const { error } = await db.from(RADAR_TABLES.alerts as never).insert({
        org_id: input.orgId,
        property_source_id: null, // shared-cache alert — id lives in metadata
        linked_property_id: null,
        alert_type: input.alertType,
        title: input.title,
        message: input.message,
        priority: input.priority,
        status: "unread",
        opportunity_score: input.opportunityScore,
        metadata: {
          ...input.metadata,
          marketPropertySourceId: input.marketPropertySourceId,
          orgMarketPropertyLinkId: input.orgMarketPropertyLinkId,
          source: "market_cache",
        },
      } as never);
      if (error) throw new Error(`insertMarketAlert failed: ${error.message}`);
    },
  };
}
