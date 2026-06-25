/**
 * LOCAL-DEV-ONLY check for the Shared Market Cache (Phase 8.5).
 *
 * In-memory MarketRepository + mock provider. No DB, no network, no credits.
 * Verifies: deterministic area key · first sync scans · second sync within TTL →
 * cache_fresh (no provider call) · NEW/UPDATED-only full fetch · shared source
 * stored once · two orgs both get links · org-specific alerts · no duplicate
 * unread alerts · cache state updates.
 *
 * Run: npx tsx scripts/property-radar-market-cache-dev-check.ts
 */
import { runMarketAreaSync } from "../src/lib/property-radar/market/engine";
import { createMarketAreaKey } from "../src/lib/property-radar/market/area-key";
import { fanoutMarketSourcesToRelevantOrgs } from "../src/lib/property-radar/market/fanout";
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
} from "../src/lib/property-radar/market/types";
import { DEFAULT_RADAR_SETTINGS, type RadarSettingsLite } from "../src/lib/property-radar/intelligence/types";
import { getPropertyProvider } from "../src/lib/property-radar/providers";
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyRadarArea,
} from "../src/lib/property-radar/providers";

interface StoredSource extends MarketPropertySource {
  market_area_key: string | null;
  _meta?: NormalizedListingMetadata;
}

class InMemoryMarketRepo implements MarketRepository {
  sources = new Map<string, StoredSource>();
  runs: Array<{ id: string } & Partial<FinishMarketSyncRunPatch>> = [];
  watermarks = new Map<string, MarketSyncWatermark>();
  cache = new Map<string, MarketAreaCacheState>();
  links = new Map<string, { orgId: string; sourceId: string }>();
  alerts: InsertMarketAlertInput[] = [];
  orgs: RelevantOrg[] = [{ orgId: "org-a" }, { orgId: "org-b" }];
  private seq = 0;
  private id(p: string) { return `${p}-${++this.seq}`; }
  private k(provider: string, ext: string) { return `${provider}|${ext}`; }

  async createMarketSyncRun(i: CreateMarketSyncRunInput): Promise<string> {
    void i; const id = this.id("run"); this.runs.push({ id }); return id;
  }
  async finishMarketSyncRun(runId: string, patch: FinishMarketSyncRunPatch): Promise<void> {
    const r = this.runs.find((x) => x.id === runId); if (r) Object.assign(r, patch);
  }
  async getMarketWatermark(provider: string, key: string): Promise<MarketSyncWatermark | null> {
    return this.watermarks.get(`${provider}|${key}`) ?? null;
  }
  async upsertMarketWatermark(provider: string, key: string, patch: UpsertMarketWatermarkPatch): Promise<void> {
    this.watermarks.set(`${provider}|${key}`, {
      provider, market_area_key: key,
      latest_external_id: patch.latestExternalId ?? null,
      latest_published_at: patch.latestPublishedAt ?? null,
      last_successful_scan_at: patch.lastSuccessfulScanAt ?? null,
      last_page_scanned: patch.lastPageScanned ?? null,
      ttl_minutes: 60, stop_reason: patch.stopReason ?? null,
    });
  }
  async getExistingMarketSourcesForArea(provider: string, key: string): Promise<MarketPropertySource[]> {
    return [...this.sources.values()].filter(
      (s) => s.provider === provider && s.market_area_key === key && ["active", "missing"].includes(s.source_status),
    );
  }
  async getMarketSourceByExternalId(provider: string, ext: string): Promise<MarketPropertySource | null> {
    return this.sources.get(this.k(provider, ext)) ?? null;
  }
  async insertMarketSourceFromMetadata(m: NormalizedListingMetadata, key: string, hash: string): Promise<string> {
    const id = this.id("src");
    this.sources.set(this.k(m.provider, m.externalId), {
      id, provider: m.provider, external_id: m.externalId, source_status: "active",
      content_hash: hash, missing_count: 0, price: m.price ?? null, city: m.city ?? null,
      neighborhood: m.neighborhood ?? null, published_at: m.publishedAt ?? null,
      last_seen_at: new Date().toISOString(), market_area_key: key, _meta: m,
    });
    return id;
  }
  async getMarketSourcesForFanout(provider: string, key: string): Promise<{ sourceId: string; source: NormalizedListingMetadata }[]> {
    return [...this.sources.values()]
      .filter((s) => s.provider === provider && s.market_area_key === key && s.source_status === "active" && s._meta)
      .map((s) => ({ sourceId: s.id, source: s._meta as NormalizedListingMetadata }));
  }
  async updateMarketSourceSeen(sourceId: string, m: NormalizedListingMetadata, hash: string): Promise<void> {
    const s = this.byId(sourceId); if (s) { s.content_hash = hash; s.source_status = "active"; s.missing_count = 0; s.price = m.price ?? s.price; }
  }
  async updateMarketSourceFullDetails(sourceId: string, d: NormalizedListingDetails, hash: string): Promise<void> {
    const s = this.byId(sourceId); if (s) { s.content_hash = hash; s._meta = d; }
  }
  async markMarketSourceMissing(sourceId: string): Promise<void> {
    const s = this.byId(sourceId); if (s) { s.missing_count += 1; s.source_status = "missing"; }
  }
  async markMarketSourceDeleted(sourceId: string): Promise<void> {
    const s = this.byId(sourceId); if (s) s.source_status = "deleted";
  }
  async getMarketAreaCacheState(provider: string, key: string): Promise<MarketAreaCacheState | null> {
    return this.cache.get(`${provider}|${key}`) ?? null;
  }
  async upsertMarketAreaCacheState(provider: string, key: string, patch: UpsertCacheStatePatch): Promise<void> {
    const prev = this.cache.get(`${provider}|${key}`);
    this.cache.set(`${provider}|${key}`, {
      provider, market_area_key: key, city: patch.city, neighborhood: patch.neighborhood,
      last_scan_at: patch.lastScanAt ?? prev?.last_scan_at ?? null,
      next_scan_after: patch.nextScanAfter ?? prev?.next_scan_after ?? null,
      ttl_minutes: patch.ttlMinutes ?? prev?.ttl_minutes ?? 60,
      status: patch.status ?? prev?.status ?? "fresh",
      active_orgs_count: patch.activeOrgsCount ?? prev?.active_orgs_count ?? 0,
      active_agents_count: 0,
      listings_count: patch.listingsCount ?? prev?.listings_count ?? 0,
      last_new_count: patch.lastNewCount ?? 0, last_updated_count: patch.lastUpdatedCount ?? 0,
      last_error_message: patch.lastErrorMessage ?? null,
    });
  }
  async getRelevantOrgsForMarketArea(): Promise<RelevantOrg[]> { return this.orgs; }
  async getOrgRadarSettings(): Promise<RadarSettingsLite> { return { ...DEFAULT_RADAR_SETTINGS }; }
  async upsertOrgMarketPropertyLink(orgId: string, sourceId: string, patch: UpsertOrgLinkPatch): Promise<{ linkId: string; created: boolean }> {
    void patch; const key = `${orgId}|${sourceId}`; const existing = this.links.get(key);
    if (existing) return { linkId: key, created: false };
    this.links.set(key, { orgId, sourceId }); return { linkId: key, created: true };
  }
  async existingUnreadMarketAlertExists(orgId: string, sourceId: string, alertType: string): Promise<boolean> {
    return this.alerts.some((a) => a.orgId === orgId && a.marketPropertySourceId === sourceId && a.alertType === alertType);
  }
  async insertMarketAlert(input: InsertMarketAlertInput): Promise<void> { this.alerts.push(input); }

  private byId(id: string): StoredSource | undefined {
    for (const s of this.sources.values()) if (s.id === id) return s;
    return undefined;
  }
}

let failures = 0;
function assert(c: boolean, label: string): void {
  if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); }
}

async function main(): Promise<void> {
  console.log("Property Radar™ shared market cache dev-check\n");
  const area: PropertyRadarArea = { city: "רחובות", neighborhood: "מערב חדש" };
  const base = { providerName: "mock" as const, area };

  // 1) area key deterministic
  assert(createMarketAreaKey(area) === createMarketAreaKey({ city: " רחובות ", neighborhood: "מערב  חדש" }),
    "createMarketAreaKey is deterministic + normalizes spacing");
  assert(createMarketAreaKey({ city: "רחובות" }) !== createMarketAreaKey(area), "neighborhood changes the key");

  const repo = new InMemoryMarketRepo();
  const privateCount = (await getPropertyProvider("mock").scanAreaMetadata(area)).listings.filter((l) => l.listingType === "private").length;

  // 2) first market sync scans
  const run1 = await runMarketAreaSync(base, { repo });
  assert(run1.status === "success" && run1.newCount >= 8, `run1 scanned + ${run1.newCount} NEW`);
  assert(run1.fullFetchCount === run1.newCount, "NEW only full-fetched");
  assert(repo.sources.size === run1.newCount, "shared source stored once per listing");

  // 6 + 7) two orgs both linked + org-specific alerts
  const orgsWithLinks = new Set([...repo.links.values()].map((l) => l.orgId));
  assert(orgsWithLinks.size === 2, `two orgs received links (${orgsWithLinks.size})`);
  const orgAAlerts = repo.alerts.filter((a) => a.orgId === "org-a").length;
  const orgBAlerts = repo.alerts.filter((a) => a.orgId === "org-b").length;
  assert(orgAAlerts === privateCount && orgBAlerts === privateCount, `each org got ${privateCount} private alerts`);
  assert(run1.affectedOrgsCount === 2, "run reports 2 affected orgs");

  // 9) cache state updated
  const key = createMarketAreaKey(area);
  const cs = await repo.getMarketAreaCacheState("mock", key);
  assert(!!cs && cs.status === "fresh" && !!cs.next_scan_after, "cache state set to fresh with next_scan_after");

  // 3) second sync within TTL → cache_fresh (no provider scan)
  const run2 = await runMarketAreaSync(base, { repo });
  assert(run2.status === "cache_fresh" && run2.scannedCount === 0, "second sync within TTL → cache_fresh (no scan)");

  // 4 + 5) forceRefresh → all UNCHANGED, no full fetch, no duplicate sources
  const sizeBefore = repo.sources.size;
  const run3 = await runMarketAreaSync({ ...base, options: { forceRefresh: true } }, { repo });
  assert(run3.unchangedCount === run1.newCount && run3.newCount === 0, "forceRefresh → all UNCHANGED");
  assert(run3.fullFetchCount === 0, "UNCHANGED performed no full fetch");
  assert(repo.sources.size === sizeBefore, "no duplicate shared sources");

  // 8) duplicate unread alerts are not created (fan out the same source twice)
  const scan = await getPropertyProvider("mock").scanAreaMetadata(area);
  const priv = scan.listings.find((l) => l.listingType === "private")!;
  const fanoutInput = {
    provider: "mock" as const, marketAreaKey: key, city: area.city, neighborhood: area.neighborhood ?? null,
    marketSources: [{ sourceId: "shared-1", source: priv, isNew: true, isUpdate: false, priceDropped: false }],
  };
  const repo2 = new InMemoryMarketRepo();
  const f1 = await fanoutMarketSourcesToRelevantOrgs(repo2, fanoutInput);
  const f2 = await fanoutMarketSourcesToRelevantOrgs(repo2, fanoutInput);
  assert(f1.alertsCreated === 2, "first fan-out creates one alert per org");
  assert(f2.alertsCreated === 0, "second fan-out creates NO duplicate unread alerts");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
