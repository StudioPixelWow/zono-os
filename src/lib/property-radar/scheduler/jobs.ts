// ============================================================================
// ZONO Property Radar™ — scheduled jobs (server-only). Thin wrappers the cron
// routes invoke. Hourly runs the orchestrator once PER configured provider
// (PROPERTY_RADAR_PROVIDER may be a CSV like "yad2,madlan"); daily runs missing-
// validation per provider/org. Both are safe no-ops when nothing is configured.
// ============================================================================
import "server-only";
import type { PropertyProviderName } from "../types";
import { runMissingValidation } from "../sync/missing-validation";
import { runPropertyRadarOrchestrator } from "./orchestrator";
import { runMarketRadarOrchestrator, type MarketOrchestratorSummary } from "./market-orchestrator";
import { createOrchestratorDataAccess } from "./data-access";
import { getPropertyRadarProviderEnv } from "../connectors/env";
import type { OrchestratorSummary, RunOrchestratorInput } from "./types";
import { getSchedulerMode, type SchedulerMode } from "./mode";

export { getSchedulerMode, type SchedulerMode };

/** Hourly shared-market pass (Phase 9 default). */
export function runMarketHourlyJob(): Promise<MarketOrchestratorSummary> {
  return runMarketRadarOrchestrator();
}

/** Daily shared-market validation — re-evaluates due areas (missing/deleted handled in-engine). */
export function runMarketValidationJob(): Promise<MarketOrchestratorSummary> {
  return runMarketRadarOrchestrator();
}

/**
 * Providers to run automatically, derived from the env MODE + enable flags:
 *   PROPERTY_RADAR_PROVIDER=mock  → [mock]   (dev only — never in production)
 *   PROPERTY_RADAR_PROVIDER=apify → [yad2 if enabled, madlan if enabled]
 *   otherwise                     → []       (safe no-op)
 */
function resolveProviders(): PropertyProviderName[] {
  const env = getPropertyRadarProviderEnv();
  if (env.providerMode === "mock") {
    return process.env.NODE_ENV !== "production" ? ["mock"] : [];
  }
  if (env.providerMode === "apify") {
    const out: PropertyProviderName[] = [];
    if (env.yad2Enabled) out.push("yad2");
    if (env.madlanEnabled) out.push("madlan");
    return out;
  }
  return [];
}

/** Hourly automatic radar pass — one orchestrator run per configured provider. */
export async function runHourlyPropertyRadarJob(
  input: RunOrchestratorInput = {},
): Promise<OrchestratorSummary[]> {
  // Explicit provider wins; otherwise fan out over the configured providers.
  if (input.providerName) {
    return [await runPropertyRadarOrchestrator(input)];
  }
  const providers = resolveProviders();
  if (providers.length === 0) {
    // No provider configured → single safe no-op summary.
    return [await runPropertyRadarOrchestrator(input)];
  }
  const summaries: OrchestratorSummary[] = [];
  for (const providerName of providers) {
    summaries.push(await runPropertyRadarOrchestrator({ ...input, providerName }));
  }
  return summaries;
}

export interface DailyValidationSummary {
  providers: PropertyProviderName[];
  orgs: number;
  totalMissing: number;
  totalDeleted: number;
  errors: string[];
  skippedReason?: string;
}

/** Daily missing/deleted validation across configured providers + sync-enabled orgs. */
export async function runDailyPropertyRadarValidationJob(): Promise<DailyValidationSummary> {
  const providers = resolveProviders();
  const summary: DailyValidationSummary = {
    providers,
    orgs: 0,
    totalMissing: 0,
    totalDeleted: 0,
    errors: [],
  };
  if (providers.length === 0) {
    summary.skippedReason = "no_provider_configured";
    return summary;
  }

  const da = createOrchestratorDataAccess();
  let orgs;
  try {
    orgs = await da.listSyncEnabledOrgs();
  } catch (e) {
    summary.errors.push(`listSyncEnabledOrgs: ${msg(e)}`);
    return summary;
  }
  summary.orgs = orgs.length;

  for (const providerName of providers) {
    for (const { orgId } of orgs) {
      try {
        const r = await runMissingValidation({ orgId, providerName });
        summary.totalMissing += r.missingCount;
        summary.totalDeleted += r.deletedCount;
        if (r.errors.length) summary.errors.push(...r.errors.map((e) => `${providerName}/${orgId}: ${e}`));
      } catch (e) {
        summary.errors.push(`${providerName}/${orgId}: ${msg(e)}`);
      }
    }
  }
  return summary;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
