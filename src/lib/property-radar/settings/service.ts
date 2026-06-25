// ============================================================================
// ZONO Property Radar™ — settings + status + manual sync service (server-only).
// Strictly org-scoped: orgId comes from the session and EVERY query is filtered
// by it, so there is no cross-org access. Validates + clamps all numeric inputs.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { RADAR_TABLES } from "../types";
import type { PropertyProviderName } from "../types";
import { startOfUtcDayIso } from "../scheduler/credit-budget";
import { getPropertyRadarProviderEnv } from "../connectors/env";
import { runPropertyRadarOrchestrator } from "../scheduler/orchestrator";
import { getSchedulerMode } from "../scheduler/jobs";
import { runMarketAreaSync } from "../market/engine";
import { fanoutFreshCacheToOrg } from "../scheduler/market-orchestrator";
import type {
  ManualMarketResultDTO,
  ManualSyncResultDTO,
  MarketCacheSummary,
  PropertyRadarPageData,
  PropertyRadarRunRow,
  PropertyRadarSettingsForm,
  PropertyRadarStatus,
  ProviderEnvSummary,
  ProviderHealth,
} from "./types";

const isDev = process.env.NODE_ENV !== "production";

const DEFAULT_FORM: PropertyRadarSettingsForm = {
  sync_enabled: true,
  smart_sync_enabled: true,
  provider_yad2_enabled: true,
  provider_madlan_enabled: true,
  private_property_alerts_enabled: true,
  popup_alerts_enabled: true,
  only_private_popups: true,
  min_popup_opportunity_score: 70,
  max_daily_credits: 1000,
  max_pages_per_scan: 3,
  unchanged_streak_stop_threshold: 15,
  max_popups_per_10_minutes: 3,
  quiet_mode_enabled: false,
  whatsapp_template: "",
};

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  return { db: createServiceRoleClient(), orgId: profile.org_id, userId: user.id };
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};
const asBool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;

/** Validate + clamp a settings form (never trusts client numbers). */
export function sanitizeSettings(input: Partial<PropertyRadarSettingsForm>): PropertyRadarSettingsForm {
  return {
    sync_enabled: asBool(input.sync_enabled, DEFAULT_FORM.sync_enabled),
    smart_sync_enabled: asBool(input.smart_sync_enabled, DEFAULT_FORM.smart_sync_enabled),
    provider_yad2_enabled: asBool(input.provider_yad2_enabled, DEFAULT_FORM.provider_yad2_enabled),
    provider_madlan_enabled: asBool(input.provider_madlan_enabled, DEFAULT_FORM.provider_madlan_enabled),
    private_property_alerts_enabled: asBool(input.private_property_alerts_enabled, DEFAULT_FORM.private_property_alerts_enabled),
    popup_alerts_enabled: asBool(input.popup_alerts_enabled, DEFAULT_FORM.popup_alerts_enabled),
    only_private_popups: asBool(input.only_private_popups, DEFAULT_FORM.only_private_popups),
    min_popup_opportunity_score: clampInt(input.min_popup_opportunity_score, 0, 100, DEFAULT_FORM.min_popup_opportunity_score),
    max_daily_credits: clampInt(input.max_daily_credits, 0, 100_000, DEFAULT_FORM.max_daily_credits),
    max_pages_per_scan: clampInt(input.max_pages_per_scan, 1, 20, DEFAULT_FORM.max_pages_per_scan),
    unchanged_streak_stop_threshold: clampInt(input.unchanged_streak_stop_threshold, 1, 100, DEFAULT_FORM.unchanged_streak_stop_threshold),
    max_popups_per_10_minutes: clampInt(input.max_popups_per_10_minutes, 0, 50, DEFAULT_FORM.max_popups_per_10_minutes),
    quiet_mode_enabled: asBool(input.quiet_mode_enabled, DEFAULT_FORM.quiet_mode_enabled),
    whatsapp_template: String(input.whatsapp_template ?? "").slice(0, 2000),
  };
}

type Db = ReturnType<typeof createServiceRoleClient>;

async function readSettings(db: Db, orgId: string): Promise<PropertyRadarSettingsForm> {
  const { data } = await db
    .from(RADAR_TABLES.settings as never)
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_FORM };
  return sanitizeSettings(data as Partial<PropertyRadarSettingsForm>);
}

function nextHourBoundary(now: Date): string {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString();
}

async function readStatus(
  db: Db,
  orgId: string,
  settings: PropertyRadarSettingsForm,
): Promise<PropertyRadarStatus> {
  const todayIso = startOfUtcDayIso(new Date());

  // Active expertise areas (distinct cities) for the org.
  const { data: areaRows } = await db
    .from("user_operating_localities" as never)
    .select("city_name")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  const cities = new Set(
    ((areaRows ?? []) as unknown as { city_name: string | null }[])
      .map((r) => (r.city_name ?? "").trim())
      .filter(Boolean),
  );

  // Today's runs aggregate.
  const { data: runRows } = await db
    .from(RADAR_TABLES.runs as never)
    .select("scanned_count, new_count, credits_used, credits_saved_estimate, full_fetch_count")
    .eq("org_id", orgId)
    .gte("started_at", todayIso);
  const runs = (runRows ?? []) as unknown as {
    scanned_count: number | null; new_count: number | null;
    credits_used: number | null; credits_saved_estimate: number | null; full_fetch_count: number | null;
  }[];
  const sum = (k: keyof (typeof runs)[number]) => runs.reduce((a, r) => a + (r[k] ?? 0), 0);
  const creditsUsedToday = sum("credits_used");
  const scannedToday = sum("scanned_count");
  const newListingsToday = sum("new_count");
  const creditsSavedToday = sum("credits_saved_estimate");
  const fullFetchesToday = sum("full_fetch_count");

  // Alerts created today.
  const { count: alertsCount } = await db
    .from(RADAR_TABLES.alerts as never)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", todayIso);

  // Last successful run.
  const { data: lastOk } = await db
    .from(RADAR_TABLES.runs as never)
    .select("finished_at")
    .eq("org_id", orgId)
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Recent 5 runs.
  const { data: recent } = await db
    .from(RADAR_TABLES.runs as never)
    .select("id, provider, city, neighborhood, run_type, status, started_at, finished_at, scanned_count, new_count, updated_count, unchanged_count, missing_count, deleted_count, credits_used, credits_saved_estimate")
    .eq("org_id", orgId)
    .order("started_at", { ascending: false })
    .limit(5);
  const recentRuns: PropertyRadarRunRow[] = ((recent ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    provider: String(r.provider ?? ""),
    city: (r.city as string | null) ?? null,
    neighborhood: (r.neighborhood as string | null) ?? null,
    runType: String(r.run_type ?? ""),
    status: String(r.status ?? ""),
    startedAt: (r.started_at as string | null) ?? null,
    finishedAt: (r.finished_at as string | null) ?? null,
    scanned: Number(r.scanned_count ?? 0),
    newCount: Number(r.new_count ?? 0),
    updatedCount: Number(r.updated_count ?? 0),
    unchangedCount: Number(r.unchanged_count ?? 0),
    missingCount: Number(r.missing_count ?? 0),
    deletedCount: Number(r.deleted_count ?? 0),
    creditsUsed: Number(r.credits_used ?? 0),
    creditsSaved: Number(r.credits_saved_estimate ?? 0),
  }));

  const providersEnabled: string[] = [];
  if (settings.provider_yad2_enabled) providersEnabled.push("יד2");
  if (settings.provider_madlan_enabled) providersEnabled.push("מדלן");

  return {
    lastSuccessfulSyncAt: (lastOk as { finished_at: string | null } | null)?.finished_at ?? null,
    nextEstimatedSyncAt: settings.sync_enabled ? nextHourBoundary(new Date()) : null,
    activeAreasCount: cities.size,
    providersEnabled,
    creditsUsedToday,
    creditsRemainingToday: Math.max(0, settings.max_daily_credits - creditsUsedToday),
    newListingsToday,
    alertsCreatedToday: alertsCount ?? 0,
    scannedToday,
    fullFetchesToday,
    creditsSavedToday,
    recentRuns,
  };
}

interface RunStat { provider: string; status: string; started_at: string | null; finished_at: string | null; }

async function readProviderHealth(db: Db, orgId: string): Promise<ProviderHealth[]> {
  const env = getPropertyRadarProviderEnv();
  const todayIso = startOfUtcDayIso(new Date());

  // Pull today's runs once; aggregate per provider in memory (no external calls).
  const { data } = await db
    .from(RADAR_TABLES.runs as never)
    .select("provider, status, started_at, finished_at")
    .eq("org_id", orgId)
    .gte("started_at", todayIso);
  const runs = (data ?? []) as unknown as RunStat[];

  const statsFor = (p: string) => {
    const rows = runs.filter((r) => r.provider === p);
    const failuresToday = rows.filter((r) => r.status === "failed").length;
    const successes = rows.filter((r) => r.status === "success" && r.finished_at);
    const lastSuccessfulRunAt = successes
      .map((r) => r.finished_at as string)
      .sort()
      .at(-1) ?? null;
    const durations = rows
      .filter((r) => r.started_at && r.finished_at)
      .map((r) => Date.parse(r.finished_at as string) - Date.parse(r.started_at as string))
      .filter((d) => Number.isFinite(d) && d >= 0);
    const averageDurationMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    return { failuresToday, lastSuccessfulRunAt, averageDurationMs };
  };

  const build = (
    provider: "mock" | "yad2" | "madlan",
    label: string,
    configured: boolean,
    enabled: boolean,
  ): ProviderHealth => {
    const s = statsFor(provider);
    let status: ProviderHealth["status"];
    let message: string;
    if (!enabled) { status = "disabled"; message = "כבוי"; }
    else if (!configured) { status = "not_configured"; message = "לא מוגדר — חסר טוקן/Actor או PROPERTY_RADAR_PROVIDER≠apify"; }
    else if (s.failuresToday > 0) { status = "error"; message = `${s.failuresToday} כשלים היום`; }
    else { status = "online"; message = "מחובר ומוכן"; }
    return { provider, label, implemented: true, configured, enabled, status, ...s, message };
  };

  const out: ProviderHealth[] = [];
  if (isDev) out.push(build("mock", "בדיקה (Mock)", true, true));
  out.push(build("yad2", "יד2", env.providerMode === "apify" && env.apifyTokenExists && !!env.yad2ActorId, env.yad2Enabled));
  out.push(build("madlan", "מדלן", env.providerMode === "apify" && env.apifyTokenExists && !!env.madlanActorId, env.madlanEnabled));
  return out;
}

function envSummary(): ProviderEnvSummary {
  const env = getPropertyRadarProviderEnv();
  return {
    providerMode: env.providerMode,
    apifyTokenExists: env.apifyTokenExists,
    yad2ActorConfigured: !!env.yad2ActorId,
    madlanActorConfigured: !!env.madlanActorId,
  };
}

/** Shared-market cache summary (global system metrics — not org listing data). */
async function readMarketSummary(db: Db): Promise<MarketCacheSummary> {
  const empty: MarketCacheSummary = {
    freshCount: 0, staleCount: 0, scanningCount: 0, errorCount: 0,
    areasCount: 0, lastMarketScanAt: null, duplicateScansAvoided: 0,
  };
  try {
    const { data } = await db
      .from("market_area_cache_state" as never)
      .select("status, active_orgs_count, last_scan_at")
      .limit(5000);
    const rows = (data ?? []) as unknown as { status: string | null; active_orgs_count: number | null; last_scan_at: string | null }[];
    let last: string | null = null;
    for (const r of rows) {
      if (r.status === "fresh") empty.freshCount++;
      else if (r.status === "stale") empty.staleCount++;
      else if (r.status === "scanning") empty.scanningCount++;
      else if (r.status === "error") empty.errorCount++;
      // Each area scanned ONCE instead of once-per-org → (orgs-1) scans avoided.
      empty.duplicateScansAvoided += Math.max(0, (r.active_orgs_count ?? 0) - 1);
      if (r.last_scan_at && (!last || r.last_scan_at > last)) last = r.last_scan_at;
    }
    empty.areasCount = rows.length;
    empty.lastMarketScanAt = last;
    return empty;
  } catch {
    return empty; // table may not exist yet (migration not run) — degrade safely
  }
}

export async function getPropertyRadarSettingsPageData(): Promise<PropertyRadarPageData> {
  const { db, orgId } = await ctx();
  const settings = await readSettings(db, orgId);
  const status = await readStatus(db, orgId, settings);
  const health = await readProviderHealth(db, orgId);
  const market = await readMarketSummary(db);
  return { settings, status, health, env: envSummary(), market, schedulerMode: getSchedulerMode(), isDev };
}

/** The org's distinct active operating cities (for manual market sync). */
async function getOrgActiveCities(db: Db, orgId: string): Promise<string[]> {
  const { data } = await db
    .from("user_operating_localities" as never)
    .select("city_name")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  const rows = (data ?? []) as unknown as { city_name: string | null }[];
  return [...new Set(rows.map((r) => (r.city_name ?? "").trim()).filter(Boolean))];
}

/** Manual sync via the SHARED market cache for the current org's areas. */
export async function runManualMarketSync(input: ManualSyncInput = {}): Promise<ManualMarketResultDTO> {
  const { db, orgId } = await ctx();
  const settings = await readSettings(db, orgId);
  const env = getPropertyRadarProviderEnv();
  const empty: ManualMarketResultDTO = {
    ok: false, provider: input.providerName ?? null, areasProcessed: 0, scanned: 0,
    cacheFresh: 0, linksCreated: 0, alerts: 0, errors: [],
  };
  if (!settings.sync_enabled) return { ...empty, skippedReason: "הסנכרון האוטומטי כבוי" };

  const provider = input.providerName;
  if (!provider) return { ...empty, skippedReason: "לא נבחר ספק" };
  if (provider === "mock" && !isDev) return { ...empty, skippedReason: "Mock זמין רק בפיתוח" };
  if (provider === "yad2" && (!settings.provider_yad2_enabled || env.providerMode !== "apify" || !env.apifyTokenExists || !env.yad2ActorId))
    return { ...empty, skippedReason: "יד2 מושבת/לא מוגדר" };
  if (provider === "madlan" && (!settings.provider_madlan_enabled || env.providerMode !== "apify" || !env.apifyTokenExists || !env.madlanActorId))
    return { ...empty, skippedReason: "מדלן מושבת/לא מוגדר" };

  const cities = await getOrgActiveCities(db, orgId);
  if (cities.length === 0) return { ...empty, skippedReason: "לא הוגדרו אזורי התמחות" };

  const res: ManualMarketResultDTO = { ...empty, ok: true, provider };
  for (const city of cities) {
    const area = { city };
    try {
      const r = await runMarketAreaSync({ providerName: provider, area, runType: "manual" });
      res.areasProcessed++;
      if (r.status === "cache_fresh") {
        res.cacheFresh++;
        // Cache fresh → still fan out the existing listings to THIS org.
        const f = await fanoutFreshCacheToOrg(orgId, area, provider);
        res.linksCreated += f.linksCreated;
        res.alerts += f.alertsCreated;
      } else {
        res.scanned++;
        res.alerts += r.alertsCreatedCount;
        if (r.errors.length) res.errors.push(...r.errors);
      }
    } catch (e) {
      res.errors.push(`${city}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  res.ok = res.errors.length === 0;
  return res;
}

/** Server-only health utility (env + sync run logs; never calls providers). */
export async function getPropertyProviderHealth(): Promise<ProviderHealth[]> {
  const { db, orgId } = await ctx();
  return readProviderHealth(db, orgId);
}

export async function updatePropertyRadarSettings(
  input: Partial<PropertyRadarSettingsForm>,
): Promise<PropertyRadarSettingsForm> {
  const { db, orgId } = await ctx();
  const clean = sanitizeSettings(input);
  const { error } = await db
    .from(RADAR_TABLES.settings as never)
    .upsert(
      {
        org_id: orgId,
        ...clean,
        whatsapp_template: clean.whatsapp_template || null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "org_id" },
    );
  if (error) throw new Error(error.message);
  return clean;
}

export interface ManualSyncInput {
  providerName?: PropertyProviderName;
}

export async function runManualPropertyRadarSync(
  input: ManualSyncInput = {},
): Promise<ManualSyncResultDTO> {
  const { db, orgId } = await ctx();
  const settings = await readSettings(db, orgId);

  const empty: ManualSyncResultDTO = {
    ok: false, provider: input.providerName ?? null, scanned: 0, newCount: 0, updatedCount: 0,
    unchangedCount: 0, missingCount: 0, deletedCount: 0, alerts: 0, creditsUsed: 0, creditsSaved: 0, errors: [],
  };

  if (!settings.sync_enabled) {
    return { ...empty, skippedReason: "הסנכרון האוטומטי כבוי" };
  }

  // Provider gating: mock dev-only; yad2/madlan must be enabled AND configured.
  const provider = input.providerName;
  const env = getPropertyRadarProviderEnv();
  if (!provider) return { ...empty, skippedReason: "לא נבחר ספק" };
  if (provider === "mock" && !isDev) return { ...empty, skippedReason: "Mock זמין רק בפיתוח" };
  if (provider === "yad2") {
    if (!settings.provider_yad2_enabled || !env.yad2Enabled) return { ...empty, skippedReason: "יד2 מושבת" };
    if (env.providerMode !== "apify" || !env.apifyTokenExists || !env.yad2ActorId) return { ...empty, skippedReason: "יד2 לא מוגדר (חסר טוקן/Actor)" };
  }
  if (provider === "madlan") {
    if (!settings.provider_madlan_enabled || !env.madlanEnabled) return { ...empty, skippedReason: "מדלן מושבת" };
    if (env.providerMode !== "apify" || !env.apifyTokenExists || !env.madlanActorId) return { ...empty, skippedReason: "מדלן לא מוגדר (חסר טוקן/Actor)" };
  }

  const startedAtIso = new Date().toISOString();
  const summary = await runPropertyRadarOrchestrator({
    orgId,
    providerName: provider,
    runType: "manual",
    dryRun: false,
  });

  if (summary.skippedReason) {
    return { ...empty, provider: summary.provider, skippedReason: summary.skippedReason, errors: summary.errors };
  }

  // Aggregate the org's run outcomes.
  const acc = summary.runs.reduce(
    (a, r) => ({
      scanned: a.scanned + r.scannedCount,
      newCount: a.newCount + r.newCount,
      updatedCount: a.updatedCount + r.updatedCount,
      unchangedCount: a.unchangedCount + r.unchangedCount,
      missingCount: a.missingCount + r.missingCount,
      deletedCount: a.deletedCount + r.deletedCount,
      creditsUsed: a.creditsUsed + r.creditsUsed,
      creditsSaved: a.creditsSaved + r.creditsSaved,
    }),
    { scanned: 0, newCount: 0, updatedCount: 0, unchangedCount: 0, missingCount: 0, deletedCount: 0, creditsUsed: 0, creditsSaved: 0 },
  );

  // Alerts created during this manual run.
  const { count: alertsCount } = await db
    .from(RADAR_TABLES.alerts as never)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", startedAtIso);

  return {
    ok: summary.errors.length === 0,
    provider: summary.provider,
    ...acc,
    alerts: alertsCount ?? 0,
    errors: summary.errors,
  };
}
