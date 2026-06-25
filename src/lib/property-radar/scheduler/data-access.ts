// ============================================================================
// ZONO Property Radar™ — orchestrator data access (server-only, service-role).
// The real OrchestratorDataAccess: reads sync-enabled orgs + their settings,
// expertise areas (from user_operating_localities — the EXISTING source, never
// fabricated), watermarks, today's credit usage, and recent alert counts.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RADAR_TABLES } from "../types";
import type { PropertyProviderName } from "../types";
import { startOfUtcDayIso } from "./credit-budget";
import {
  DEFAULT_SCHEDULER_SETTINGS,
  type OrchestratorArea,
  type OrchestratorDataAccess,
  type OrgSchedulerRecord,
  type RadarSchedulerSettings,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

interface SettingsRow {
  org_id: string;
  sync_enabled: boolean | null;
  smart_sync_enabled: boolean | null;
  max_daily_credits: number | null;
  max_pages_per_scan: number | null;
  unchanged_streak_stop_threshold: number | null;
  provider_yad2_enabled: boolean | null;
  provider_madlan_enabled: boolean | null;
}

function toSettings(r: SettingsRow): RadarSchedulerSettings {
  const d = DEFAULT_SCHEDULER_SETTINGS;
  return {
    syncEnabled: r.sync_enabled ?? d.syncEnabled,
    smartSyncEnabled: r.smart_sync_enabled ?? d.smartSyncEnabled,
    maxDailyCredits: r.max_daily_credits ?? d.maxDailyCredits,
    maxPagesPerScan: r.max_pages_per_scan ?? d.maxPagesPerScan,
    unchangedStreakStopThreshold: r.unchanged_streak_stop_threshold ?? d.unchangedStreakStopThreshold,
    providerYad2Enabled: r.provider_yad2_enabled ?? d.providerYad2Enabled,
    providerMadlanEnabled: r.provider_madlan_enabled ?? d.providerMadlanEnabled,
    syncIntervalHours: null,
  };
}

export function createOrchestratorDataAccess(
  db: Db = createServiceRoleClient(),
): OrchestratorDataAccess {
  return {
    async listSyncEnabledOrgs(maxOrgs?: number): Promise<OrgSchedulerRecord[]> {
      let q = db
        .from(RADAR_TABLES.settings as never)
        .select(
          "org_id, sync_enabled, smart_sync_enabled, max_daily_credits, max_pages_per_scan, unchanged_streak_stop_threshold, provider_yad2_enabled, provider_madlan_enabled",
        )
        .eq("sync_enabled", true);
      if (maxOrgs != null) q = q.limit(maxOrgs);
      const { data, error } = await q;
      if (error) throw new Error(`listSyncEnabledOrgs failed: ${error.message}`);
      return ((data ?? []) as unknown as SettingsRow[]).map((r) => ({
        orgId: r.org_id,
        settings: toSettings(r),
      }));
    },

    async getAreasForOrg(orgId: string): Promise<OrchestratorArea[]> {
      const { data, error } = await db
        .from("user_operating_localities" as never)
        .select("id, city_name, is_active")
        .eq("organization_id", orgId)
        .eq("is_active", true);
      if (error) throw new Error(`getAreasForOrg failed: ${error.message}`);
      const rows = (data ?? []) as unknown as { id: string; city_name: string | null }[];
      // One area per distinct city (city-level scan). Never invent areas.
      const seen = new Map<string, OrchestratorArea>();
      for (const r of rows) {
        const city = (r.city_name ?? "").trim();
        if (!city || seen.has(city)) continue;
        seen.set(city, { areaId: r.id, city, neighborhood: null });
      }
      return [...seen.values()];
    },

    async getWatermarkScanAt(
      orgId: string,
      provider: PropertyProviderName,
      area: OrchestratorArea,
    ): Promise<string | null> {
      const { data, error } = await db
        .from(RADAR_TABLES.watermarks as never)
        .select("last_successful_scan_at")
        .eq("org_id", orgId)
        .eq("provider", provider)
        .eq("city", area.city)
        .is("neighborhood", null)
        .maybeSingle();
      if (error) return null; // missing watermark → treat as never scanned
      return (data as unknown as { last_successful_scan_at: string | null } | null)
        ?.last_successful_scan_at ?? null;
    },

    async getTodayCreditUsage(orgId: string): Promise<number> {
      const { data, error } = await db
        .from(RADAR_TABLES.runs as never)
        .select("credits_used")
        .eq("org_id", orgId)
        .gte("started_at", startOfUtcDayIso(new Date()));
      if (error) throw new Error(`getTodayCreditUsage failed: ${error.message}`);
      const rows = (data ?? []) as unknown as { credits_used: number | null }[];
      return rows.reduce((sum, r) => sum + (r.credits_used ?? 0), 0);
    },

    async getRecentAlertCount(
      orgId: string,
      area: OrchestratorArea,
      sinceIso: string,
    ): Promise<number> {
      try {
        const { count, error } = await db
          .from(RADAR_TABLES.alerts as never)
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("created_at", sinceIso)
          .eq("metadata->>city", area.city);
        if (error) return 0;
        return count ?? 0;
      } catch {
        return 0; // hot detection is best-effort
      }
    },
  };
}
