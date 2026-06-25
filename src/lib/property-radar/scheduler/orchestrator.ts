// ============================================================================
// ZONO Property Radar™ — automatic area orchestrator.
// ----------------------------------------------------------------------------
// Decides which expertise areas are due, prioritizes hot areas, respects the
// per-org credit budget, and runs incremental sync — with NO user action.
// Storage-agnostic: it talks to an OrchestratorDataAccess + a runArea function,
// so it runs against Supabase in prod and an in-memory stub in the dev-check.
// dryRun computes the full plan WITHOUT consuming credits or calling sync.
// ============================================================================
import type { PropertyProviderName } from "../types";
import { runPropertyAreaSync } from "../sync/engine";
import { calculateAreaPriority, priorityRank } from "./area-priority";
import { canRunSyncForOrg } from "./credit-budget";
import type {
  AreaPriority,
  AreaRunOutcome,
  OrchestratorDataAccess,
  OrchestratorSummary,
  OrgPlan,
  PlannedArea,
  RadarSchedulerSettings,
  RunOrchestratorInput,
} from "./types";

const HOURS = 3_600_000;
const DEFAULT_NON_SMART_INTERVAL_H = 6;

/** Smart-mode cadence per priority. */
function smartIntervalHours(priority: AreaPriority): number {
  return priority === "hot" ? 1 : priority === "active" ? 3 : 24;
}

/** New area (no watermark) is due immediately; otherwise cadence-based. */
export function isAreaDueForSync(
  settings: RadarSchedulerSettings,
  lastScanAt: string | null,
  priority: AreaPriority,
  now: Date,
): boolean {
  if (!lastScanAt) return true;
  const last = Date.parse(lastScanAt);
  if (!Number.isFinite(last)) return true;
  const intervalH = settings.smartSyncEnabled
    ? smartIntervalHours(priority)
    : settings.syncIntervalHours ?? DEFAULT_NON_SMART_INTERVAL_H;
  return now.getTime() - last >= intervalH * HOURS;
}

export interface OrchestratorDeps {
  dataAccess?: OrchestratorDataAccess;
  runArea?: typeof runPropertyAreaSync;
}

function resolveDefaultProvider(explicit?: PropertyProviderName): PropertyProviderName | null {
  if (explicit) return explicit;
  // PROPERTY_RADAR_PROVIDER is a MODE (mock|apify). In apify mode the caller must
  // pass an explicit provider name (jobs fan out per provider); only mock mode
  // resolves to a runnable default here.
  const mode = (process.env.PROPERTY_RADAR_PROVIDER ?? "").trim().toLowerCase();
  if (mode === "mock") return "mock";
  return null; // safe default — run nothing
}

async function getDefaultDataAccess(): Promise<OrchestratorDataAccess> {
  const mod = await import("./data-access");
  return mod.createOrchestratorDataAccess();
}

function providerEnabled(provider: PropertyProviderName, s: RadarSchedulerSettings): boolean {
  if (provider === "yad2") return s.providerYad2Enabled;
  if (provider === "madlan") return s.providerMadlanEnabled;
  return true; // mock always allowed (dev)
}

export async function runPropertyRadarOrchestrator(
  input: RunOrchestratorInput = {},
  deps?: OrchestratorDeps,
): Promise<OrchestratorSummary> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun ?? false;
  const provider = resolveDefaultProvider(input.providerName);

  const summary: OrchestratorSummary = {
    provider,
    dryRun,
    orgsConsidered: 0,
    areasConsidered: 0,
    areasDue: 0,
    areasRun: 0,
    areasSkipped: 0,
    newListings: 0,
    creditsUsed: 0,
    errors: [],
    plans: [],
    runs: [],
  };

  if (!provider) {
    summary.skippedReason = "no_provider_configured";
    return summary; // never call a real provider unless configured
  }

  let dataAccess: OrchestratorDataAccess;
  let runArea: typeof runPropertyAreaSync;
  try {
    dataAccess = deps?.dataAccess ?? (await getDefaultDataAccess());
    runArea = deps?.runArea ?? runPropertyAreaSync;
  } catch (e) {
    summary.errors.push(`data access unavailable: ${errMsg(e)}`);
    return summary;
  }

  let orgs = await dataAccess.listSyncEnabledOrgs(input.maxOrgs);
  if (input.orgId) orgs = orgs.filter((o) => o.orgId === input.orgId);
  summary.orgsConsidered = orgs.length;

  const sinceIso = new Date(now.getTime() - 24 * HOURS).toISOString();

  for (const { orgId, settings } of orgs) {
    if (!settings.syncEnabled || !providerEnabled(provider, settings)) continue;

    let areas = await dataAccess.getAreasForOrg(orgId);
    if (input.maxAreasPerOrg != null) areas = areas.slice(0, input.maxAreasPerOrg);

    const usedToday = await dataAccess.getTodayCreditUsage(orgId);
    const orgPlan: OrgPlan = {
      orgId,
      areasConsidered: areas.length,
      creditsUsedToday: usedToday,
      remainingCredits: Math.max(0, settings.maxDailyCredits - usedToday),
      planned: [],
    };
    summary.areasConsidered += areas.length;

    // Compute priority + due for every area.
    const computed = [];
    for (const area of areas) {
      const recentAlertCount = await dataAccess.getRecentAlertCount(orgId, area, sinceIso);
      const priority = calculateAreaPriority(area, { recentAlertCount });
      const lastScanAt = await dataAccess.getWatermarkScanAt(orgId, provider, area);
      const due = isAreaDueForSync(settings, lastScanAt, priority, now);
      if (due) summary.areasDue++;
      computed.push({ area, priority, lastScanAt, due });
    }

    // Sort: hot first → oldest scan first (null = oldest) → city.
    const ordered = [...computed].sort((a, b) => {
      if (a.due !== b.due) return a.due ? -1 : 1;
      const pr = priorityRank(b.priority) - priorityRank(a.priority);
      if (pr !== 0) return pr;
      const la = a.lastScanAt ? Date.parse(a.lastScanAt) : 0;
      const lb = b.lastScanAt ? Date.parse(b.lastScanAt) : 0;
      if (la !== lb) return la - lb;
      return a.area.city.localeCompare(b.area.city);
    });

    // Budgeted execution pass — running usage grows as we run.
    let runningUsage = usedToday;
    for (const c of ordered) {
      const neighborhood = c.area.neighborhood ?? null;
      if (!c.due) {
        orgPlan.planned.push(plan(c.area.city, neighborhood, c.priority, false, false, "לא הגיע זמן הסריקה", c.lastScanAt));
        summary.areasSkipped++;
        continue;
      }
      const budget = canRunSyncForOrg(settings, runningUsage, c.priority);
      if (!budget.allowed) {
        orgPlan.planned.push(plan(c.area.city, neighborhood, c.priority, true, false, budget.reason ?? "חריגת תקציב", c.lastScanAt));
        summary.areasSkipped++;
        continue;
      }

      // Allowed to run.
      if (dryRun) {
        orgPlan.planned.push(plan(c.area.city, neighborhood, c.priority, true, true, "מתוכנן לסריקה (dryRun)", c.lastScanAt));
        continue;
      }

      try {
        const res = await runArea({
          orgId,
          providerName: provider,
          area: { id: c.area.areaId ?? null, city: c.area.city, neighborhood },
          runType: input.runType ?? "automatic",
          options: {
            maxPages: settings.maxPagesPerScan,
            unchangedStreakStopThreshold: settings.unchangedStreakStopThreshold,
          },
        });
        runningUsage += res.creditsUsed;
        summary.areasRun++;
        summary.newListings += res.newCount;
        summary.creditsUsed += res.creditsUsed;
        summary.runs.push(runOutcome(orgId, c.area.city, neighborhood, res));
        if (res.errors.length) summary.errors.push(...res.errors.map((e) => `${orgId}/${c.area.city}: ${e}`));
        orgPlan.planned.push(plan(c.area.city, neighborhood, c.priority, true, true, `נסרק (${res.status})`, c.lastScanAt));
      } catch (e) {
        summary.errors.push(`${orgId}/${c.area.city}: ${errMsg(e)}`);
        orgPlan.planned.push(plan(c.area.city, neighborhood, c.priority, true, false, `שגיאה: ${errMsg(e)}`, c.lastScanAt));
      }
    }

    summary.plans.push(orgPlan);
  }

  return summary;
}

function plan(
  city: string,
  neighborhood: string | null,
  priority: AreaPriority,
  due: boolean,
  willRun: boolean,
  reason: string,
  lastScanAt: string | null,
): PlannedArea {
  return { city, neighborhood, priority, due, willRun, reason, lastScanAt };
}

function runOutcome(
  orgId: string,
  city: string,
  neighborhood: string | null,
  res: Awaited<ReturnType<typeof runPropertyAreaSync>>,
): AreaRunOutcome {
  return {
    orgId,
    city,
    neighborhood,
    status: res.status,
    scannedCount: res.scannedCount,
    newCount: res.newCount,
    updatedCount: res.updatedCount,
    unchangedCount: res.unchangedCount,
    missingCount: res.missingCount,
    deletedCount: res.deletedCount,
    creditsUsed: res.creditsUsed,
    creditsSaved: res.creditsSavedEstimate,
    error: res.errors.length ? res.errors.join(" | ") : undefined,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
