// ============================================================================
// ZONO Property Radar™ — market radar orchestrator (Phase 9).
// Scans each provider+area ONCE via the shared market engine, then the engine
// fans out personalized scores/alerts to relevant orgs. Replaces per-org scanning
// for the automatic cron (the legacy runPropertyRadarOrchestrator stays available).
// Storage-agnostic via injectable deps so it's testable without a DB.
// ============================================================================
import type { PropertyProviderName } from "../types";
import { getPropertyRadarProviderEnv } from "../connectors/env";
import { runMarketAreaSync } from "../market/engine";
import { fanoutSourcesToOrg } from "../market/fanout";
import { createMarketAreaKey } from "../market/area-key";
import type { MarketRepository } from "../market/types";
import type { MatchingPort } from "../matching/types";
import { buildMarketAreaQueue, type MarketQueueItem } from "./market-queue";
import type { OrchestratorDataAccess } from "./types";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Providers to run automatically (env mode + enable flags). */
export function resolveMarketProviders(): PropertyProviderName[] {
  const env = getPropertyRadarProviderEnv();
  if (env.providerMode === "mock") return process.env.NODE_ENV !== "production" ? ["mock"] : [];
  if (env.providerMode === "apify") {
    const out: PropertyProviderName[] = [];
    if (env.yad2Enabled) out.push("yad2");
    if (env.madlanEnabled) out.push("madlan");
    return out;
  }
  return [];
}

export interface RunMarketOrchestratorInput {
  providerName?: PropertyProviderName;
  now?: Date;
  maxAreas?: number;
  forceRefresh?: boolean;
  dryRun?: boolean;
}

export interface MarketOrchestratorSummary {
  providers: PropertyProviderName[];
  dryRun: boolean;
  areasQueued: number;
  areasScanned: number;
  areasSkippedFresh: number;
  providerCallsAvoided: number;
  affectedOrgs: number;
  alertsCreated: number;
  creditsUsed: number;
  creditsSavedEstimate: number;
  duplicateScansAvoided: number;
  skippedReason?: string;
  errors: string[];
}

export interface MarketOrchestratorDeps {
  dataAccess?: OrchestratorDataAccess;
  marketRepo?: MarketRepository;
  runArea?: typeof runMarketAreaSync;
}

async function defaultDataAccess(): Promise<OrchestratorDataAccess> {
  const mod = await import("./data-access");
  return mod.createOrchestratorDataAccess();
}
async function defaultMarketRepo(): Promise<MarketRepository> {
  const mod = await import("../market/repository");
  return mod.createMarketRepository();
}

export async function runMarketRadarOrchestrator(
  input: RunMarketOrchestratorInput = {},
  deps?: MarketOrchestratorDeps,
): Promise<MarketOrchestratorSummary> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun ?? false;
  const providers = input.providerName ? [input.providerName] : resolveMarketProviders();

  const summary: MarketOrchestratorSummary = {
    providers, dryRun, areasQueued: 0, areasScanned: 0, areasSkippedFresh: 0,
    providerCallsAvoided: 0, affectedOrgs: 0, alertsCreated: 0, creditsUsed: 0,
    creditsSavedEstimate: 0, duplicateScansAvoided: 0, errors: [],
  };
  if (providers.length === 0) {
    summary.skippedReason = "no_provider_configured";
    return summary;
  }

  let dataAccess: OrchestratorDataAccess;
  let marketRepo: MarketRepository;
  let runArea: typeof runMarketAreaSync;
  try {
    dataAccess = deps?.dataAccess ?? (await defaultDataAccess());
    marketRepo = deps?.marketRepo ?? (await defaultMarketRepo());
    runArea = deps?.runArea ?? runMarketAreaSync;
  } catch (e) {
    summary.errors.push(`deps unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return summary;
  }

  let queue: MarketQueueItem[];
  try {
    queue = await buildMarketAreaQueue({ dataAccess, marketRepo }, { providers, now, maxAreas: input.maxAreas });
  } catch (e) {
    summary.errors.push(`queue: ${e instanceof Error ? e.message : String(e)}`);
    return summary;
  }
  summary.areasQueued = queue.length;

  // Shared daily credit guardrail (per-run cap; one shared scan serves many orgs).
  const marketDailyLimit = envInt("PROPERTY_RADAR_MARKET_DAILY_CREDITS", 5000);
  let runningUsage = 0;

  for (const item of queue) {
    if (!item.due && !input.forceRefresh) continue;
    if (runningUsage >= marketDailyLimit) break;

    try {
      const res = await runArea({
        providerName: item.provider,
        area: { city: item.city, neighborhood: item.neighborhood },
        runType: "automatic",
        options: { forceRefresh: input.forceRefresh, dryRun },
      });
      if (res.status === "cache_fresh") {
        summary.areasSkippedFresh++;
        summary.providerCallsAvoided++;
      } else {
        summary.areasScanned++;
        summary.creditsUsed += res.creditsUsed;
        summary.creditsSavedEstimate += res.creditsSavedEstimate;
        summary.affectedOrgs += res.affectedOrgsCount;
        summary.alertsCreated += res.alertsCreatedCount;
        // One shared scan instead of one-per-org → (orgs-1) duplicate scans avoided.
        summary.duplicateScansAvoided += Math.max(0, item.orgCount - 1);
        runningUsage += res.creditsUsed;
      }
      if (res.errors.length) summary.errors.push(...res.errors.map((e) => `${item.provider}/${item.city}: ${e}`));
    } catch (e) {
      summary.errors.push(`${item.provider}/${item.city}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}

// ── Manual: fan out an already-fresh shared cache to a single org ────────────
export interface FreshCacheFanoutResult {
  linksCreated: number;
  scoresUpdated: number;
  alertsCreated: number;
  matchesUpserted: number;
  tasksCreated: number;
  sourceCount: number;
}

/** Lazy-load the real (server-only) matching repository; null if unavailable. */
async function defaultMatchingRepo(): Promise<MatchingPort | null> {
  try {
    const mod = await import("../matching/repository");
    return mod.createMatchingRepository();
  } catch {
    return null;
  }
}

export async function fanoutFreshCacheToOrg(
  orgId: string,
  area: { city: string; neighborhood?: string | null },
  providerName: PropertyProviderName,
  deps?: { marketRepo?: MarketRepository; matching?: MatchingPort | null },
): Promise<FreshCacheFanoutResult> {
  const marketRepo = deps?.marketRepo ?? (await defaultMarketRepo());
  const matching = deps && "matching" in deps ? deps.matching ?? null : await defaultMatchingRepo();
  const key = createMarketAreaKey(area);
  const sources = await marketRepo.getMarketSourcesForFanout(providerName, key);
  if (sources.length === 0) {
    return { linksCreated: 0, scoresUpdated: 0, alertsCreated: 0, matchesUpserted: 0, tasksCreated: 0, sourceCount: 0 };
  }

  const counts = await fanoutSourcesToOrg(
    marketRepo,
    orgId,
    { city: area.city, neighborhood: area.neighborhood ?? null },
    sources.map((s) => ({ sourceId: s.sourceId, source: s.source, isNew: true, isUpdate: false, priceDropped: false })),
    { matching },
  );
  return { ...counts, sourceCount: sources.length };
}
