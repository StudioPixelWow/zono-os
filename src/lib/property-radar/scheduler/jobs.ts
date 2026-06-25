// ============================================================================
// ZONO Property Radar™ — scheduled jobs (server-only). Thin wrappers the cron
// routes invoke. Hourly runs the orchestrator; daily runs missing-validation per
// sync-enabled org. Both are safe no-ops when no provider is configured.
// ============================================================================
import "server-only";
import type { PropertyProviderName } from "../types";
import { runMissingValidation } from "../sync/missing-validation";
import { runPropertyRadarOrchestrator } from "./orchestrator";
import { createOrchestratorDataAccess } from "./data-access";
import type { OrchestratorSummary, RunOrchestratorInput } from "./types";

function resolveProvider(): PropertyProviderName | null {
  const p = process.env.PROPERTY_RADAR_PROVIDER;
  return p === "mock" || p === "yad2" || p === "madlan" ? p : null;
}

/** Hourly automatic radar pass (incremental sync of due areas). */
export async function runHourlyPropertyRadarJob(
  input: RunOrchestratorInput = {},
): Promise<OrchestratorSummary> {
  return runPropertyRadarOrchestrator(input);
}

export interface DailyValidationSummary {
  provider: PropertyProviderName | null;
  orgs: number;
  totalMissing: number;
  totalDeleted: number;
  errors: string[];
  skippedReason?: string;
}

/** Daily missing/deleted validation across sync-enabled orgs. */
export async function runDailyPropertyRadarValidationJob(): Promise<DailyValidationSummary> {
  const provider = resolveProvider();
  const summary: DailyValidationSummary = {
    provider,
    orgs: 0,
    totalMissing: 0,
    totalDeleted: 0,
    errors: [],
  };
  if (!provider) {
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

  for (const { orgId } of orgs) {
    try {
      const r = await runMissingValidation({ orgId, providerName: provider });
      summary.totalMissing += r.missingCount;
      summary.totalDeleted += r.deletedCount;
      if (r.errors.length) summary.errors.push(...r.errors.map((e) => `${orgId}: ${e}`));
    } catch (e) {
      summary.errors.push(`${orgId}: ${msg(e)}`);
    }
  }
  return summary;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
