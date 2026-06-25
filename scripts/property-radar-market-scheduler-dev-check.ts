/**
 * LOCAL-DEV-ONLY check for the Market Scheduler (Phase 9).
 *
 * In-memory MarketRepository + mock OrchestratorDataAccess + mock provider.
 * Verifies: many orgs in one city → ONE queue item · orchestrator scans once ·
 * fan-out to both orgs · second run within TTL avoids scanning · duplicateScans-
 * Avoided · default scheduler mode = market · legacy org mode still selectable ·
 * fresh-cache fan-out to a new org · no fabricated areas.
 *
 * Run: npx tsx scripts/property-radar-market-scheduler-dev-check.ts
 */
import { buildMarketAreaQueue } from "../src/lib/property-radar/scheduler/market-queue";
import { runMarketRadarOrchestrator, fanoutFreshCacheToOrg } from "../src/lib/property-radar/scheduler/market-orchestrator";
import { getSchedulerMode } from "../src/lib/property-radar/scheduler/mode";
import { runPropertyRadarOrchestrator } from "../src/lib/property-radar/scheduler/orchestrator";
import { runMarketAreaSync } from "../src/lib/property-radar/market/engine";
import { DEFAULT_SCHEDULER_SETTINGS, type OrchestratorArea, type OrchestratorDataAccess, type OrgSchedulerRecord } from "../src/lib/property-radar/scheduler/types";
import { DEFAULT_RADAR_SETTINGS, type RadarSettingsLite } from "../src/lib/property-radar/intelligence/types";
import { getPropertyProvider } from "../src/lib/property-radar/providers";
import type {
  CreateMarketSyncRunInput, InsertMarketAlertInput,
  MarketAreaCacheState, MarketPropertySource, MarketRepository, MarketSyncWatermark,
  RelevantOrg, UpsertCacheStatePatch, UpsertMarketWatermarkPatch, UpsertOrgLinkPatch,
} from "../src/lib/property-radar/market/types";
import type { NormalizedListingDetails, NormalizedListingMetadata } from "../src/lib/property-radar/providers";

const CITY = "רחובות";

// ── In-memory market repo (stores full metadata for fresh-cache fan-out) ─────
interface Stored extends MarketPropertySource { _meta?: NormalizedListingMetadata }
class MarketRepo implements MarketRepository {
  sources = new Map<string, Stored>();
  watermarks = new Map<string, MarketSyncWatermark>();
  cache = new Map<string, MarketAreaCacheState>();
  links = new Map<string, { orgId: string }>();
  alerts: InsertMarketAlertInput[] = [];
  orgs: RelevantOrg[] = [{ orgId: "org-a" }, { orgId: "org-b" }];
  private seq = 0;
  private id(p: string) { return `${p}-${++this.seq}`; }
  async createMarketSyncRun(_i: CreateMarketSyncRunInput) { void _i; return this.id("run"); }
  async finishMarketSyncRun() {}
  async getMarketWatermark(p: string, k: string) { return this.watermarks.get(`${p}|${k}`) ?? null; }
  async upsertMarketWatermark(p: string, k: string, patch: UpsertMarketWatermarkPatch) {
    this.watermarks.set(`${p}|${k}`, { provider: p, market_area_key: k, latest_external_id: patch.latestExternalId ?? null, latest_published_at: patch.latestPublishedAt ?? null, last_successful_scan_at: patch.lastSuccessfulScanAt ?? null, last_page_scanned: patch.lastPageScanned ?? null, ttl_minutes: 60, stop_reason: null });
  }
  async getExistingMarketSourcesForArea(p: string, k: string) {
    return [...this.sources.values()].filter((s) => s.provider === p && s.market_area_key === k && ["active", "missing"].includes(s.source_status));
  }
  async getMarketSourceByExternalId(p: string, e: string) { return this.sources.get(`${p}|${e}`) ?? null; }
  async insertMarketSourceFromMetadata(m: NormalizedListingMetadata, k: string, hash: string) {
    const id = this.id("src");
    this.sources.set(`${m.provider}|${m.externalId}`, { id, provider: m.provider, external_id: m.externalId, source_status: "active", content_hash: hash, missing_count: 0, price: m.price ?? null, city: m.city ?? null, neighborhood: m.neighborhood ?? null, published_at: m.publishedAt ?? null, last_seen_at: new Date().toISOString(), market_area_key: k, _meta: m });
    return id;
  }
  async updateMarketSourceSeen(id: string, _m: NormalizedListingMetadata, hash: string) { const s = this.byId(id); if (s) { s.content_hash = hash; s.source_status = "active"; s.missing_count = 0; } }
  async updateMarketSourceFullDetails(id: string, d: NormalizedListingDetails, hash: string) { const s = this.byId(id); if (s) { s.content_hash = hash; s._meta = d; } }
  async markMarketSourceMissing(id: string) { const s = this.byId(id); if (s) { s.missing_count++; s.source_status = "missing"; } }
  async markMarketSourceDeleted(id: string) { const s = this.byId(id); if (s) s.source_status = "deleted"; }
  async getMarketAreaCacheState(p: string, k: string) { return this.cache.get(`${p}|${k}`) ?? null; }
  async upsertMarketAreaCacheState(p: string, k: string, patch: UpsertCacheStatePatch) {
    const prev = this.cache.get(`${p}|${k}`);
    this.cache.set(`${p}|${k}`, { provider: p, market_area_key: k, city: patch.city, neighborhood: patch.neighborhood, last_scan_at: patch.lastScanAt ?? prev?.last_scan_at ?? null, next_scan_after: patch.nextScanAfter ?? prev?.next_scan_after ?? null, ttl_minutes: patch.ttlMinutes ?? 60, status: patch.status ?? "fresh", active_orgs_count: patch.activeOrgsCount ?? 0, active_agents_count: 0, listings_count: patch.listingsCount ?? 0, last_new_count: patch.lastNewCount ?? 0, last_updated_count: patch.lastUpdatedCount ?? 0, last_error_message: patch.lastErrorMessage ?? null });
  }
  async getRelevantOrgsForMarketArea() { return this.orgs; }
  async getMarketSourcesForFanout(p: string, k: string) {
    return [...this.sources.values()].filter((s) => s.provider === p && s.market_area_key === k && s.source_status === "active" && s._meta).map((s) => ({ sourceId: s.id, source: s._meta as NormalizedListingMetadata }));
  }
  async getOrgRadarSettings(): Promise<RadarSettingsLite> { return { ...DEFAULT_RADAR_SETTINGS }; }
  async upsertOrgMarketPropertyLink(orgId: string, sourceId: string, patch: UpsertOrgLinkPatch) {
    void patch; const key = `${orgId}|${sourceId}`; const had = this.links.has(key);
    this.links.set(key, { orgId }); return { linkId: key, created: !had };
  }
  async existingUnreadMarketAlertExists(orgId: string, sourceId: string, alertType: string) {
    return this.alerts.some((a) => a.orgId === orgId && a.marketPropertySourceId === sourceId && a.alertType === alertType);
  }
  async insertMarketAlert(i: InsertMarketAlertInput) { this.alerts.push(i); }
  private byId(id: string) { for (const s of this.sources.values()) if (s.id === id) return s; return undefined; }
}

// ── Mock data access: two orgs, same city ────────────────────────────────────
const settings = { ...DEFAULT_SCHEDULER_SETTINGS };
class MockDataAccess implements OrchestratorDataAccess {
  async listSyncEnabledOrgs(): Promise<OrgSchedulerRecord[]> {
    return [{ orgId: "org-a", settings }, { orgId: "org-b", settings }];
  }
  async getAreasForOrg(): Promise<OrchestratorArea[]> { return [{ city: CITY }]; }
  async getWatermarkScanAt() { return null; }
  async getTodayCreditUsage() { return 0; }
  async getRecentAlertCount() { return 0; }
}

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

async function main(): Promise<void> {
  console.log("Property Radar™ market scheduler dev-check\n");
  const now = new Date("2026-06-24T12:00:00Z");
  const dataAccess = new MockDataAccess();
  const marketRepo = new MarketRepo();
  const deps = { dataAccess, marketRepo, runArea: (i: Parameters<typeof runMarketAreaSync>[0]) => runMarketAreaSync(i, { repo: marketRepo }) };

  // 1) two orgs, same city → ONE queue item with orgCount 2
  const queue = await buildMarketAreaQueue({ dataAccess, marketRepo }, { providers: ["mock"], now });
  assert(queue.length === 1, `same city across 2 orgs → one queue item (got ${queue.length})`);
  assert(queue[0]?.orgCount === 2, "queue item reports orgCount 2");
  assert(queue[0]?.due === true, "new area is due immediately");

  const privateCount = (await getPropertyProvider("mock").scanAreaMetadata({ city: CITY })).listings.filter((l) => l.listingType === "private").length;

  // 2 + 3 + 5) orchestrator scans once, fans out to both orgs, computes duplicateScansAvoided
  const run1 = await runMarketRadarOrchestrator({ providerName: "mock", now }, deps);
  assert(run1.areasScanned === 1, "orchestrator scanned the shared area once");
  assert(run1.affectedOrgs === 2, "fan-out reached both orgs");
  assert(run1.duplicateScansAvoided === 1, "duplicateScansAvoided = orgCount-1 = 1");
  const linkedOrgs = new Set([...marketRepo.links.values()].map((l) => l.orgId));
  assert(linkedOrgs.has("org-a") && linkedOrgs.has("org-b"), "links created for both orgs");
  assert(run1.alertsCreated === privateCount * 2, `alerts org-specific (${privateCount}×2)`);

  // 4) second run within TTL avoids scanning (area no longer due)
  const run2 = await runMarketRadarOrchestrator({ providerName: "mock", now }, deps);
  assert(run2.areasScanned === 0, "second run within cadence avoids provider scan");

  // 6 + 7) scheduler mode default = market; legacy org mode still available
  assert(getSchedulerMode() === "market", "default scheduler mode is market");
  process.env.PROPERTY_RADAR_SCHEDULER_MODE = "org";
  assert(getSchedulerMode() === "org", "scheduler mode switchable to legacy org");
  delete process.env.PROPERTY_RADAR_SCHEDULER_MODE;
  assert(typeof runPropertyRadarOrchestrator === "function", "legacy org-level orchestrator still available");

  // 8) fresh-cache fan-out to a brand-new org with no links
  const fresh = await fanoutFreshCacheToOrg("org-c", { city: CITY }, "mock", { marketRepo });
  assert(fresh.linksCreated > 0, `fresh-cache fan-out created links for new org (${fresh.linksCreated})`);
  assert([...marketRepo.links.values()].some((l) => l.orgId === "org-c"), "org-c now linked from fresh cache");

  // 9) no fabricated areas
  assert(queue.every((q) => q.city === CITY), "queue contains only the provided area (no fabrication)");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
