// ============================================================================
// ZONO Property Radar™ — sync repository (server-only, Supabase-backed).
// The concrete SyncRepository over the property_sync_* tables. Uses the
// service-role client (this is a trusted backend job) and the project's
// `.from(TABLE as never)` cast convention for tables not yet in generated types.
// Kept strictly isolated from provider logic.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RADAR_TABLES } from "../types";
import type { PropertyProviderName } from "../types";
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyRadarArea,
} from "../providers/types";
import {
  DEFAULT_RADAR_SETTINGS,
  type InsertPropertyAlertInput,
  type OpportunityScoreResult,
  type RadarIntelligenceRepository,
  type RadarSettingsLite,
} from "../intelligence/types";
import type {
  CreateSyncRunInput,
  FinishSyncRunPatch,
  SyncRepository,
  SyncSourceRecord,
  SyncWatermarkRecord,
  UpsertWatermarkPatch,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

const SOURCE_SELECT =
  "id, org_id, provider, external_id, source_status, content_hash, missing_count, price, published_at, last_seen_at";

function metadataToRow(metadata: NormalizedListingMetadata, hash: string) {
  return {
    provider: metadata.provider,
    external_id: metadata.externalId,
    external_url: metadata.externalUrl ?? null,
    listing_type: metadata.listingType ?? "unknown",
    title: metadata.title ?? null,
    city: metadata.city ?? null,
    neighborhood: metadata.neighborhood ?? null,
    street: metadata.street ?? null,
    address_text: metadata.addressText ?? null,
    property_type: metadata.propertyType ?? null,
    price: metadata.price ?? null,
    rooms: metadata.rooms ?? null,
    floor: metadata.floor ?? null,
    size_sqm: metadata.sizeSqm ?? null,
    image_url: metadata.imageUrl ?? null,
    phone: metadata.phone ?? null,
    contact_name: metadata.contactName ?? null,
    published_at: metadata.publishedAt ?? null,
    provider_updated_at: metadata.providerUpdatedAt ?? null,
    content_hash: hash,
    raw_metadata: (metadata.rawMetadata ?? {}) as Record<string, unknown>,
  };
}

export function createSyncRepository(
  db: Db = createServiceRoleClient(),
): SyncRepository & RadarIntelligenceRepository {
  return {
    async createSyncRun(input: CreateSyncRunInput): Promise<string> {
      const { data, error } = await db
        .from(RADAR_TABLES.runs as never)
        .insert({
          org_id: input.orgId,
          provider: input.provider,
          area_id: input.area?.id ?? null,
          city: input.area?.city ?? null,
          neighborhood: input.area?.neighborhood ?? null,
          run_type: input.runType,
          status: "running",
          started_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(`createSyncRun failed: ${error.message}`);
      return (data as unknown as { id: string }).id;
    },

    async finishSyncRun(runId: string, patch: FinishSyncRunPatch): Promise<void> {
      const { error } = await db
        .from(RADAR_TABLES.runs as never)
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
          stop_reason: patch.stopReason ?? null,
          error_message: patch.errorMessage ?? null,
        } as never)
        .eq("id", runId);
      if (error) throw new Error(`finishSyncRun failed: ${error.message}`);
    },

    async getExistingSourcesForArea(
      orgId: string,
      provider: PropertyProviderName,
      area: PropertyRadarArea,
    ): Promise<SyncSourceRecord[]> {
      let q = db
        .from(RADAR_TABLES.sources as never)
        .select(SOURCE_SELECT)
        .eq("org_id", orgId)
        .eq("provider", provider)
        .eq("city", area.city)
        .in("source_status", ["active", "missing"] as never);
      if (area.neighborhood) q = q.eq("neighborhood", area.neighborhood);
      const { data, error } = await q;
      if (error) throw new Error(`getExistingSourcesForArea failed: ${error.message}`);
      return (data ?? []) as unknown as SyncSourceRecord[];
    },

    async getSourceByExternalId(
      orgId: string,
      provider: PropertyProviderName,
      externalId: string,
    ): Promise<SyncSourceRecord | null> {
      const { data, error } = await db
        .from(RADAR_TABLES.sources as never)
        .select(SOURCE_SELECT)
        .eq("org_id", orgId)
        .eq("provider", provider)
        .eq("external_id", externalId)
        .maybeSingle();
      if (error) throw new Error(`getSourceByExternalId failed: ${error.message}`);
      return (data as unknown as SyncSourceRecord) ?? null;
    },

    async getStaleSources(
      orgId: string,
      provider: PropertyProviderName,
      notSeenBeforeIso: string,
      area?: PropertyRadarArea,
    ): Promise<SyncSourceRecord[]> {
      let q = db
        .from(RADAR_TABLES.sources as never)
        .select(SOURCE_SELECT)
        .eq("org_id", orgId)
        .eq("provider", provider)
        .in("source_status", ["active", "missing"] as never)
        .or(`last_seen_at.is.null,last_seen_at.lt.${notSeenBeforeIso}`);
      if (area?.city) q = q.eq("city", area.city);
      if (area?.neighborhood) q = q.eq("neighborhood", area.neighborhood);
      const { data, error } = await q;
      if (error) throw new Error(`getStaleSources failed: ${error.message}`);
      return (data ?? []) as unknown as SyncSourceRecord[];
    },

    async insertSourceFromMetadata(
      orgId: string,
      metadata: NormalizedListingMetadata,
      hash: string,
    ): Promise<string> {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from(RADAR_TABLES.sources as never)
        .insert({
          org_id: orgId,
          ...metadataToRow(metadata, hash),
          source_status: "active",
          missing_count: 0,
          first_seen_at: now,
          last_seen_at: now,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(`insertSourceFromMetadata failed: ${error.message}`);
      return (data as unknown as { id: string }).id;
    },

    async updateSourceSeen(
      sourceId: string,
      metadata: NormalizedListingMetadata,
      hash: string,
    ): Promise<void> {
      const { error } = await db
        .from(RADAR_TABLES.sources as never)
        .update({
          ...metadataToRow(metadata, hash),
          source_status: "active",
          missing_count: 0,
          last_seen_at: new Date().toISOString(),
        } as never)
        .eq("id", sourceId);
      if (error) throw new Error(`updateSourceSeen failed: ${error.message}`);
    },

    async updateSourceFullDetails(
      sourceId: string,
      details: NormalizedListingDetails,
      hash: string,
    ): Promise<void> {
      const now = new Date().toISOString();
      const { error } = await db
        .from(RADAR_TABLES.sources as never)
        .update({
          ...metadataToRow(details, hash),
          source_status: "active",
          missing_count: 0,
          last_seen_at: now,
          last_full_synced_at: now,
          raw_full_payload: (details.rawFullPayload ?? {}) as Record<string, unknown>,
        } as never)
        .eq("id", sourceId);
      if (error) throw new Error(`updateSourceFullDetails failed: ${error.message}`);
    },

    async markSourceMissing(sourceId: string): Promise<void> {
      // Read current missing_count, increment, set status missing (no hard delete).
      const { data, error: readErr } = await db
        .from(RADAR_TABLES.sources as never)
        .select("missing_count")
        .eq("id", sourceId)
        .single();
      if (readErr) throw new Error(`markSourceMissing read failed: ${readErr.message}`);
      const next = (((data as unknown as { missing_count: number } | null)?.missing_count ?? 0) + 1);
      const { error } = await db
        .from(RADAR_TABLES.sources as never)
        .update({ source_status: "missing", missing_count: next } as never)
        .eq("id", sourceId);
      if (error) throw new Error(`markSourceMissing failed: ${error.message}`);
    },

    async markSourceDeleted(sourceId: string): Promise<void> {
      // Soft delete only — status flag, never a row removal.
      const { error } = await db
        .from(RADAR_TABLES.sources as never)
        .update({ source_status: "deleted" } as never)
        .eq("id", sourceId);
      if (error) throw new Error(`markSourceDeleted failed: ${error.message}`);
    },

    async upsertWatermark(
      orgId: string,
      provider: PropertyProviderName,
      area: PropertyRadarArea,
      patch: UpsertWatermarkPatch,
    ): Promise<void> {
      const { error } = await db
        .from(RADAR_TABLES.watermarks as never)
        .upsert(
          {
            org_id: orgId,
            provider,
            area_id: area.id ?? null,
            city: area.city ?? null,
            neighborhood: area.neighborhood ?? null,
            latest_external_id: patch.latestExternalId ?? null,
            latest_published_at: patch.latestPublishedAt ?? null,
            last_successful_scan_at: patch.lastSuccessfulScanAt ?? null,
            last_page_scanned: patch.lastPageScanned ?? null,
            stop_reason: patch.stopReason ?? null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "org_id,provider,area_id,city,neighborhood" },
        );
      if (error) throw new Error(`upsertWatermark failed: ${error.message}`);
    },

    async getWatermark(
      orgId: string,
      provider: PropertyProviderName,
      area: PropertyRadarArea,
    ): Promise<SyncWatermarkRecord | null> {
      let q = db
        .from(RADAR_TABLES.watermarks as never)
        .select(
          "id, org_id, provider, area_id, city, neighborhood, latest_external_id, latest_published_at, last_successful_scan_at, last_page_scanned, stop_reason",
        )
        .eq("org_id", orgId)
        .eq("provider", provider)
        .eq("city", area.city);
      q = area.neighborhood ? q.eq("neighborhood", area.neighborhood) : q.is("neighborhood", null);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(`getWatermark failed: ${error.message}`);
      return (data as unknown as SyncWatermarkRecord) ?? null;
    },

    // ── RadarIntelligenceRepository ──────────────────────────────────────────
    async getRadarSettings(orgId: string): Promise<RadarSettingsLite> {
      const { data, error } = await db
        .from(RADAR_TABLES.settings as never)
        .select(
          "private_property_alerts_enabled, popup_alerts_enabled, only_private_popups, min_popup_opportunity_score",
        )
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw new Error(`getRadarSettings failed: ${error.message}`);
      const row = data as unknown as {
        private_property_alerts_enabled: boolean | null;
        popup_alerts_enabled: boolean | null;
        only_private_popups: boolean | null;
        min_popup_opportunity_score: number | null;
      } | null;
      if (!row) return { ...DEFAULT_RADAR_SETTINGS };
      return {
        privatePropertyAlertsEnabled:
          row.private_property_alerts_enabled ?? DEFAULT_RADAR_SETTINGS.privatePropertyAlertsEnabled,
        popupAlertsEnabled: row.popup_alerts_enabled ?? DEFAULT_RADAR_SETTINGS.popupAlertsEnabled,
        onlyPrivatePopups: row.only_private_popups ?? DEFAULT_RADAR_SETTINGS.onlyPrivatePopups,
        minPopupOpportunityScore:
          row.min_popup_opportunity_score ?? DEFAULT_RADAR_SETTINGS.minPopupOpportunityScore,
      };
    },

    async upsertOpportunityScore(
      orgId: string,
      propertySourceId: string,
      score: OpportunityScoreResult,
      linkedPropertyId?: string | null,
    ): Promise<void> {
      const b = score.breakdown;
      const { error } = await db
        .from(RADAR_TABLES.scores as never)
        .upsert(
          {
            org_id: orgId,
            property_source_id: propertySourceId,
            linked_property_id: linkedPropertyId ?? null,
            total_score: score.totalScore,
            private_listing_score: b.privateListing,
            area_expertise_score: b.expertiseArea,
            buyer_match_score: b.buyerMatches,
            market_price_score: b.marketPrice,
            freshness_score: b.freshness,
            rarity_score: b.rarity,
            seller_motivation_score: 0,
            exclusivity_potential_score: 0,
            reasons: score.reasons as unknown as Record<string, unknown>,
            recommendation: score.recommendation,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "org_id,property_source_id" },
        );
      if (error) throw new Error(`upsertOpportunityScore failed: ${error.message}`);
    },

    async existingUnreadAlertExists(
      orgId: string,
      propertySourceId: string,
      alertType: string,
    ): Promise<boolean> {
      const { data, error } = await db
        .from(RADAR_TABLES.alerts as never)
        .select("id")
        .eq("org_id", orgId)
        .eq("property_source_id", propertySourceId)
        .eq("alert_type", alertType)
        .eq("status", "unread")
        .limit(1);
      if (error) throw new Error(`existingUnreadAlertExists failed: ${error.message}`);
      return ((data as unknown as unknown[]) ?? []).length > 0;
    },

    async insertPropertyAlert(input: InsertPropertyAlertInput): Promise<void> {
      const { error } = await db.from(RADAR_TABLES.alerts as never).insert({
        org_id: input.orgId,
        property_source_id: input.propertySourceId,
        linked_property_id: input.linkedPropertyId ?? null,
        agent_id: input.agentId ?? null,
        alert_type: input.alertType,
        title: input.title,
        message: input.message,
        priority: input.priority,
        status: "unread",
        opportunity_score: input.opportunityScore,
        metadata: input.metadata,
      } as never);
      if (error) throw new Error(`insertPropertyAlert failed: ${error.message}`);
    },
  };
}
