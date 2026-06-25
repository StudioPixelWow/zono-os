/**
 * LOCAL-DEV-ONLY check for the Daily Market Events Engine (Phase 11).
 *
 * In-memory market repo + matching repo + event repo + mock provider. Sources
 * are seeded at INFLATED prices so the cheap metadata re-scan detects drops.
 * Verifies: price drop → event · small drop → no alert · big drop → hot_deal ·
 * matches recalculated · buyer_match_gained event · removed → matches inactive ·
 * 24h alert dedup · metadata-first (full fetch only for changed) · ordered
 * timeline.
 *
 * Run: npx tsx scripts/property-radar-events-dev-check.ts
 */
import { runDailyMarketEventsRefresh } from "../src/lib/property-radar/events/engine";
import { createMarketAreaKey } from "../src/lib/property-radar/market/area-key";
import { createListingContentHash } from "../src/lib/property-radar/utils";
import { getPropertyProvider } from "../src/lib/property-radar/providers";
import { DEFAULT_RADAR_SETTINGS, type RadarSettingsLite } from "../src/lib/property-radar/intelligence/types";
import type {
  CreateMarketSyncRunInput, FinishMarketSyncRunPatch, InsertMarketAlertInput, MarketAreaCacheState,
  MarketPropertySource, MarketRepository, MarketSyncWatermark, RelevantOrg,
  UpsertCacheStatePatch, UpsertMarketWatermarkPatch, UpsertOrgLinkPatch,
} from "../src/lib/property-radar/market/types";
import type {
  MatchStatus, MatchableBuyer, MatchingRepository, PerfectMatchTaskInput,
  StoredBuyerMatch, UpsertMatchInput, UpsertMatchResult,
} from "../src/lib/property-radar/matching/types";
import type {
  ActiveMarketArea, InsertMarketEventInput, MarketEventRepository,
  MarketPropertyTimeline, NormalizedListingMetadata,
} from "../src/lib/property-radar/events/types";
import type { NormalizedListingDetails } from "../src/lib/property-radar/providers";

const CITY = "חיפה";

// ── In-memory market repo (mutable price/status/hash, seedable) ──────────────
interface Stored extends MarketPropertySource { _meta?: NormalizedListingMetadata; first_seen_at?: string }
interface AlertRec extends InsertMarketAlertInput { createdAt: string }
class MarketRepo implements MarketRepository {
  sources = new Map<string, Stored>(); // key = provider|external_id
  alerts: AlertRec[] = [];
  links = new Map<string, { orgId: string }>();
  orgs: RelevantOrg[] = [{ orgId: "org-a" }];
  private seq = 0;
  id(p: string) { return `${p}-${++this.seq}`; }
  seed(meta: NormalizedListingMetadata, key: string, price: number, status: string, hash: string, missingCount = 0): string {
    const id = this.id("src");
    this.sources.set(`${meta.provider}|${meta.externalId}`, {
      id, provider: meta.provider, external_id: meta.externalId, source_status: status, content_hash: hash,
      missing_count: missingCount, price, city: meta.city ?? null, neighborhood: meta.neighborhood ?? null,
      published_at: meta.publishedAt ?? null, last_seen_at: new Date(Date.now() - 86400000).toISOString(),
      market_area_key: key, _meta: meta, first_seen_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    });
    return id;
  }
  byId(id: string) { for (const s of this.sources.values()) if (s.id === id) return s; return undefined; }
  async createMarketSyncRun(_i: CreateMarketSyncRunInput) { void _i; return this.id("run"); }
  async finishMarketSyncRun(_r: string, _p: FinishMarketSyncRunPatch) { void _r; void _p; }
  async getMarketWatermark(): Promise<MarketSyncWatermark | null> { return null; }
  async upsertMarketWatermark(_p: string, _k: string, _patch: UpsertMarketWatermarkPatch) { void _patch; }
  async getExistingMarketSourcesForArea(p: string, k: string) {
    return [...this.sources.values()].filter((s) => s.provider === p && s.market_area_key === k && ["active", "missing"].includes(s.source_status));
  }
  async getMarketSourceByExternalId(p: string, e: string) { return this.sources.get(`${p}|${e}`) ?? null; }
  async insertMarketSourceFromMetadata(m: NormalizedListingMetadata, k: string, hash: string) {
    return this.seed(m, k, m.price ?? 0, "active", hash);
  }
  async updateMarketSourceSeen(id: string, m: NormalizedListingMetadata, hash: string) {
    const s = this.byId(id); if (s) { s.content_hash = hash; s.source_status = "active"; s.missing_count = 0; s.price = m.price ?? s.price; s.last_seen_at = new Date().toISOString(); }
  }
  async updateMarketSourceFullDetails(id: string, d: NormalizedListingDetails, hash: string) { const s = this.byId(id); if (s) { s.content_hash = hash; s._meta = d; } }
  async markMarketSourceMissing(id: string) { const s = this.byId(id); if (s) { s.missing_count++; s.source_status = "missing"; } }
  async markMarketSourceDeleted(id: string) { const s = this.byId(id); if (s) s.source_status = "deleted"; }
  async getMarketAreaCacheState(): Promise<MarketAreaCacheState | null> { return null; }
  async upsertMarketAreaCacheState(_p: string, _k: string, _patch: UpsertCacheStatePatch) { void _patch; }
  async getRelevantOrgsForMarketArea() { return this.orgs; }
  async getMarketSourcesForFanout() { return []; }
  async getOrgRadarSettings(): Promise<RadarSettingsLite> { return { ...DEFAULT_RADAR_SETTINGS }; }
  async upsertOrgMarketPropertyLink(orgId: string, sourceId: string, patch: UpsertOrgLinkPatch) {
    void patch; const key = `${orgId}|${sourceId}`; const had = this.links.has(key); this.links.set(key, { orgId });
    return { linkId: key, created: !had };
  }
  async existingUnreadMarketAlertExists() { return false; }
  async insertMarketAlert(i: InsertMarketAlertInput) {
    this.alerts.push({ ...i, metadata: { ...i.metadata, marketPropertySourceId: i.marketPropertySourceId }, createdAt: new Date().toISOString() });
  }
}

// ── In-memory matching repo ───────────────────────────────────────────────────
interface MatchRow { id: string; orgId: string; buyerId: string; sourceId: string; score: number; level: string; status: string; isActive: boolean }
class MatchingRepo implements MatchingRepository {
  buyersByOrg = new Map<string, MatchableBuyer[]>();
  rows = new Map<string, MatchRow>();
  tasks: PerfectMatchTaskInput[] = [];
  private seq = 0;
  async getActiveBuyersForOrg(orgId: string) { return (this.buyersByOrg.get(orgId) ?? []).filter((b) => b.status === "active"); }
  async upsertBuyerPropertyMatch(i: UpsertMatchInput): Promise<UpsertMatchResult> {
    const key = `${i.buyerId}|${i.marketPropertySourceId}`; const prev = this.rows.get(key);
    if (prev) { const sc = prev.score !== i.matchScore; prev.score = i.matchScore; prev.level = i.matchLevel; prev.isActive = true; return { matchId: prev.id, created: false, scoreChanged: sc }; }
    const id = `m-${++this.seq}`; this.rows.set(key, { id, orgId: i.orgId, buyerId: i.buyerId, sourceId: i.marketPropertySourceId, score: i.matchScore, level: i.matchLevel, status: "new", isActive: true });
    return { matchId: id, created: true, scoreChanged: true };
  }
  async markMatchesInactiveForSource(sourceId: string) { let n = 0; for (const r of this.rows.values()) if (r.sourceId === sourceId && r.isActive) { r.isActive = false; n++; } return n; }
  async reconcileActiveMatches(orgId: string, sourceId: string, keepIds: string[]) {
    const keep = new Set(keepIds); let n = 0;
    for (const r of this.rows.values()) if (r.orgId === orgId && r.sourceId === sourceId && r.isActive && !keep.has(r.buyerId)) { r.isActive = false; n++; }
    return n;
  }
  async perfectMatchTaskExists(orgId: string, buyerId: string) { return this.tasks.some((t) => t.orgId === orgId && t.buyerId === buyerId); }
  async createPerfectMatchTask(i: PerfectMatchTaskInput) { this.tasks.push(i); }
  async getTopMatchesForSource(orgId: string, sourceId: string): Promise<StoredBuyerMatch[]> {
    return [...this.rows.values()].filter((r) => r.orgId === orgId && r.sourceId === sourceId && r.isActive)
      .map((r) => ({ id: r.id, buyerId: r.buyerId, buyerName: r.buyerId, phone: null, matchScore: r.score, matchLevel: r.level as StoredBuyerMatch["matchLevel"], status: r.status, budgetMin: null, budgetMax: null, lastContactedAt: null, positives: [], negatives: [], marketPropertySourceId: r.sourceId }));
  }
  async countRelevantMatchesForSource(orgId: string, sourceId: string) {
    return [...this.rows.values()].filter((r) => r.orgId === orgId && r.sourceId === sourceId && r.isActive).length;
  }
  async updateMatchStatus(orgId: string, matchId: string, status: MatchStatus) { for (const r of this.rows.values()) if (r.id === matchId && r.orgId === orgId) r.status = status; }
}

// ── In-memory event repo ──────────────────────────────────────────────────────
class EventRepo implements MarketEventRepository {
  events: (InsertMarketEventInput & { id: string; detectedAt: string })[] = [];
  private seq = 0;
  constructor(private areas: ActiveMarketArea[], private market: MarketRepo) {}
  async getActiveMarketAreas(provider?: string, key?: string) {
    return this.areas.filter((a) => (!provider || a.provider === provider) && (!key || a.marketAreaKey === key));
  }
  async insertMarketEvent(i: InsertMarketEventInput) {
    const id = `ev-${++this.seq}`;
    this.events.push({ ...i, id, detectedAt: new Date(Date.now() + this.seq).toISOString() });
    return id;
  }
  async recentOrgEventAlertExists(orgId: string, sourceId: string, alertType: string, sinceIso: string) {
    return this.market.alerts.some((a) => a.orgId === orgId && a.alertType === alertType && a.metadata.marketPropertySourceId === sourceId && a.createdAt >= sinceIso);
  }
  async getMarketPropertyTimeline(sourceId: string): Promise<MarketPropertyTimeline> {
    const entries = this.events.filter((e) => e.marketPropertySourceId === sourceId)
      .map((e) => ({ at: e.detectedAt, kind: "event" as const, label: e.eventType }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return { marketPropertySourceId: sourceId, firstSeen: this.market.byId(sourceId)?.first_seen_at ?? null, entries };
  }
  async countTodaysEventsForCities() { return {}; }
  async lastRefreshAtForCities() { return null; }
}

function buyer(orgId: string, id: string): MatchableBuyer {
  return {
    id, orgId, fullName: id, phone: "050-1234567", status: "active", temperature: "warm",
    budgetMin: null, budgetMax: 99_000_000, roomsMin: 1, roomsMax: 10, sizeMin: null, sizeMax: null,
    preferredTypes: [], preferredCities: [CITY], preferredNeighborhoods: [], mustHaveParking: false,
    mustHaveBalcony: false, floorMin: null, floorMax: null, timeline: "soon", lastContactedAt: null,
    manualBonus: 0, manualPenalty: 12,
  };
}

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

async function main(): Promise<void> {
  console.log("Property Radar™ daily market events dev-check\n");
  const key = createMarketAreaKey({ city: CITY });
  const provider = getPropertyProvider("mock");
  const scan = await provider.scanAreaMetadata({ city: CITY });
  const listings = scan.listings;

  const market = new MarketRepo();
  const matching = new MatchingRepo();
  matching.buyersByOrg.set("org-a", [0, 1, 2, 3, 4].map((i) => buyer("org-a", `b${i}`)));

  // Seed sources at INFLATED prices so the re-scan detects drops.
  const hashAt = (m: NormalizedListingMetadata, price: number) => createListingContentHash({ ...m, price });
  const HOT = listings[0]!, DROP = listings[1]!, SMALL = listings[6]!, BACK = listings[3]!;
  const idHot = market.seed(HOT, key, (HOT.price ?? 0) + 400_000, "active", hashAt(HOT, (HOT.price ?? 0) + 400_000));
  const idDrop = market.seed(DROP, key, (DROP.price ?? 0) + 60_000, "active", hashAt(DROP, (DROP.price ?? 0) + 60_000));
  const idSmall = market.seed(SMALL, key, (SMALL.price ?? 0) + 10_000, "active", hashAt(SMALL, (SMALL.price ?? 0) + 10_000));
  market.seed(BACK, key, BACK.price ?? 0, "missing", createListingContentHash(BACK)); // back on market (unchanged price/hash)
  // Unchanged listings — seeded at exact current price + hash (no events, no full fetch).
  for (const idx of [2, 4, 5, 7]) { const m = listings[idx]!; market.seed(m, key, m.price ?? 0, "active", createListingContentHash(m)); }
  // A removed listing (not in scan) with an active buyer match.
  const ghost: NormalizedListingMetadata = { provider: "mock", externalId: "ghost-removed", city: CITY, price: 2_000_000, listingType: "private" };
  const idGhost = market.seed(ghost, key, 2_000_000, "missing", "ghost-hash", 2);
  matching.rows.set(`b0|${idGhost}`, { id: "m-ghost", orgId: "org-a", buyerId: "b0", sourceId: idGhost, score: 88, level: "excellent", status: "new", isActive: true });

  const eventRepo = new EventRepo([{ provider: "mock", marketAreaKey: key, city: CITY, neighborhood: null }], market);
  const deps = { marketRepo: market, eventRepo, matching };

  const run = await runDailyMarketEventsRefresh({}, deps);
  assert(run.status === "success" || run.status === "partial", `refresh ran (${run.status})`);

  // 1) price drop creates an event.
  assert(run.priceDrops >= 1, `price drop events created (${run.priceDrops})`);
  assert(eventRepo.events.some((e) => e.marketPropertySourceId === idDrop && e.eventType === "price_drop"), "price_drop event recorded for the dropped listing");

  // 3) large drop creates hot_deal.
  assert(run.hotDeals >= 1, `hot_deal detected (${run.hotDeals})`);
  assert(eventRepo.events.some((e) => e.marketPropertySourceId === idHot && e.eventType === "hot_deal"), "hot_deal event recorded for the big drop");

  // 2) small drop below threshold → event but NO price-drop alert.
  assert(eventRepo.events.some((e) => e.marketPropertySourceId === idSmall && e.eventType === "price_drop"), "small drop still records a price_drop event");
  assert(market.alerts.filter((a) => a.alertType === "market_price_drop" && a.metadata.marketPropertySourceId === idSmall).length === 0, "small drop does NOT create a price-drop alert (below threshold)");

  // 4) buyer matches recalculated after price change.
  assert(run.matchesRecalculated > 0, `buyer matches recalculated (${run.matchesRecalculated})`);
  assert([...matching.rows.values()].some((r) => r.sourceId === idHot && r.isActive), "matches exist for the hot listing after recompute");

  // 5) buyer_match_gained event when new buyers become relevant.
  assert(run.buyerMatchGained >= 1, `buyer_match_gained events created (${run.buyerMatchGained})`);
  assert(eventRepo.events.some((e) => e.marketPropertySourceId === idHot && e.eventType === "buyer_match_gained"), "buyer_match_gained recorded for the now-relevant listing");

  // 6) removed listing marks its matches inactive (rows kept).
  assert(run.removed >= 1, `removed listing detected (${run.removed})`);
  assert(matching.rows.get(`b0|${idGhost}`)?.isActive === false, "removed listing deactivated its buyer match (row not deleted)");

  // 7) duplicate alert within 24h prevented — re-inflate + re-run, same-day.
  const hotSrc = market.byId(idHot)!; hotSrc.price = (HOT.price ?? 0) + 400_000; hotSrc.content_hash = hashAt(HOT, (HOT.price ?? 0) + 400_000);
  const alertsBefore = market.alerts.filter((a) => a.alertType === "market_hot_deal" && a.metadata.marketPropertySourceId === idHot).length;
  await runDailyMarketEventsRefresh({}, deps);
  const alertsAfter = market.alerts.filter((a) => a.alertType === "market_hot_deal" && a.metadata.marketPropertySourceId === idHot).length;
  assert(alertsBefore === 1 && alertsAfter === 1, `duplicate hot-deal alert within 24h prevented (${alertsBefore} → ${alertsAfter})`);

  // 8) metadata-first: one scan per area; full fetch ONLY for changed listings.
  assert(run.metadataScans === 1, `metadata scanned once for the area (${run.metadataScans})`);
  assert(run.fullFetches === 3, `full fetch only for the 3 hash-changed listings (got ${run.fullFetches})`);
  assert(run.fullFetches < run.sourcesRefreshed, `metadata-first: full fetches (${run.fullFetches}) < sources refreshed (${run.sourcesRefreshed})`);

  // 9) timeline returns ordered events.
  const timeline = await eventRepo.getMarketPropertyTimeline(idHot);
  assert(timeline.entries.length >= 1, "timeline returns entries");
  assert(timeline.entries.every((e, i, a) => i === 0 || Date.parse(a[i - 1]!.at) <= Date.parse(e.at)), "timeline entries are chronologically ordered");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
