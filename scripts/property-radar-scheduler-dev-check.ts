/**
 * LOCAL-DEV-ONLY check for the Property Radar™ scheduler (Phase 6).
 *
 * Pure / dryRun only — an in-memory OrchestratorDataAccess + the mock provider
 * name. No DB, no real provider, no credits, no fake production areas. Verifies:
 *   • new area due immediately; hot/active/passive cadences (1h / 3h / 24h)
 *   • credit budget blocks non-hot areas over the soft limit; hard limit blocks all
 *   • queue sorts hot first
 *   • no provider configured → safe no-op
 *
 * Run: npx tsx scripts/property-radar-scheduler-dev-check.ts
 */
import {
  runPropertyRadarOrchestrator,
  isAreaDueForSync,
} from "../src/lib/property-radar/scheduler/orchestrator";
import { canRunSyncForOrg } from "../src/lib/property-radar/scheduler/credit-budget";
import {
  DEFAULT_SCHEDULER_SETTINGS,
  type OrchestratorArea,
  type OrchestratorDataAccess,
  type OrgSchedulerRecord,
  type RadarSchedulerSettings,
} from "../src/lib/property-radar/scheduler/types";

let failures = 0;
function assert(cond: boolean, label: string): void {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}`); }
}

const NOW = new Date("2026-06-24T12:00:00Z");
const hAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const SMART: RadarSchedulerSettings = { ...DEFAULT_SCHEDULER_SETTINGS, maxDailyCredits: 1000 };

// In-memory data access — returns ONLY the areas we provide (no fabrication).
class MockDA implements OrchestratorDataAccess {
  constructor(
    private areas: OrchestratorArea[],
    private watermarks: Record<string, string | null>,
    private usage: number,
    private alerts: Record<string, number> = {},
    private settings: RadarSchedulerSettings = SMART,
  ) {}
  async listSyncEnabledOrgs(): Promise<OrgSchedulerRecord[]> {
    return [{ orgId: "org-1", settings: this.settings }];
  }
  async getAreasForOrg(): Promise<OrchestratorArea[]> { return this.areas; }
  async getWatermarkScanAt(_o: string, _p: string, area: OrchestratorArea): Promise<string | null> {
    return this.watermarks[area.city] ?? null;
  }
  async getTodayCreditUsage(): Promise<number> { return this.usage; }
  async getRecentAlertCount(_o: string, area: OrchestratorArea): Promise<number> {
    return this.alerts[area.city] ?? 0;
  }
}

const AREAS: OrchestratorArea[] = [
  { areaId: "a1", city: "חיפה" }, // active
  { areaId: "a2", city: "תל אביב" }, // hot (alerts)
  { areaId: "a3", city: "אילת" }, // new area (no watermark) → active, due now
  { areaId: "a4", city: "נהריה", priority: "passive" }, // passive
];
const WM: Record<string, string | null> = {
  "חיפה": hAgo(5),
  "תל אביב": hAgo(5),
  "נהריה": hAgo(10),
};
const ALERTS = { "תל אביב": 2 };

async function main(): Promise<void> {
  console.log("Property Radar™ scheduler dev-check\n");

  // ── isAreaDueForSync cadences ───────────────────────────────────────────────
  assert(isAreaDueForSync(SMART, null, "active", NOW), "new area (no watermark) due immediately");
  assert(isAreaDueForSync(SMART, hAgo(1.5), "hot", NOW), "hot due after >1h");
  assert(!isAreaDueForSync(SMART, hAgo(0.5), "hot", NOW), "hot NOT due before 1h");
  assert(isAreaDueForSync(SMART, hAgo(3.5), "active", NOW), "active due after >3h");
  assert(!isAreaDueForSync(SMART, hAgo(2), "active", NOW), "active NOT due before 3h");
  assert(isAreaDueForSync(SMART, hAgo(25), "passive", NOW), "passive due after >24h");
  assert(!isAreaDueForSync(SMART, hAgo(10), "passive", NOW), "passive NOT due before 24h");

  // ── credit budget ──────────────────────────────────────────────────────────
  assert(canRunSyncForOrg(SMART, 0, "active").allowed, "under budget → active allowed");
  assert(!canRunSyncForOrg(SMART, 1000, "active").allowed, "at soft limit → active blocked");
  assert(canRunSyncForOrg(SMART, 1000, "hot").allowed, "at soft limit → hot still allowed");
  assert(!canRunSyncForOrg(SMART, 1200, "hot").allowed, "at hard limit → hot blocked");

  // ── orchestrator dryRun: due + sorting ──────────────────────────────────────
  const daA = new MockDA(AREAS, WM, 0, ALERTS);
  const sumA = await runPropertyRadarOrchestrator(
    { providerName: "mock", dryRun: true, now: NOW },
    { dataAccess: daA },
  );
  assert(sumA.areasConsidered === 4, "considered exactly the 4 provided areas (no fabrication)");
  assert(sumA.areasRun === 0, "dryRun ran nothing (no consumption)");
  assert(sumA.areasDue === 3, `3 areas due (hot+active+new), passive not due (got ${sumA.areasDue})`);
  const planA = sumA.plans[0]!.planned;
  assert(planA[0]?.priority === "hot" && planA[0]?.willRun, "queue sorted hot first + willRun");
  const passive = planA.find((p) => p.city === "נהריה")!;
  assert(!passive.due && !passive.willRun, "passive area not due / not run");
  assert(planA.filter((p) => p.due).every((p) => p.willRun), "all due areas planned to run under budget");

  // ── budget blocks non-hot over soft limit ───────────────────────────────────
  const daB = new MockDA(AREAS, WM, 1000, ALERTS);
  const sumB = await runPropertyRadarOrchestrator(
    { providerName: "mock", dryRun: true, now: NOW },
    { dataAccess: daB },
  );
  const planB = sumB.plans[0]!.planned;
  assert(planB.find((p) => p.city === "תל אביב")!.willRun, "over soft limit → hot still planned");
  assert(!planB.find((p) => p.city === "חיפה")!.willRun, "over soft limit → active blocked");
  assert(!planB.find((p) => p.city === "אילת")!.willRun, "over soft limit → new(active) blocked");

  // ── hard limit blocks everything ────────────────────────────────────────────
  const daC = new MockDA(AREAS, WM, 1200, ALERTS);
  const sumC = await runPropertyRadarOrchestrator(
    { providerName: "mock", dryRun: true, now: NOW },
    { dataAccess: daC },
  );
  assert(sumC.plans[0]!.planned.every((p) => !p.willRun), "hard limit → nothing planned to run");

  // ── no provider configured → safe no-op ─────────────────────────────────────
  const sumNone = await runPropertyRadarOrchestrator({ dryRun: true, now: NOW }, { dataAccess: daA });
  assert(sumNone.skippedReason === "no_provider_configured" && sumNone.areasConsidered === 0,
    "no provider configured → safe no-op");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
