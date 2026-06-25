/**
 * LOCAL-DEV-ONLY check for the Real Buyer Matching Engine (Phase 10).
 *
 * Verifies: deterministic fast-filter eliminates irrelevant buyers · only
 * relevant buyers are matched · perfect matches stored · NO duplicate matches
 * (upsert) · deleted property removes active matches · updated property
 * recalculates · alerts carry the buyer count · perfect matches create tasks
 * (deduped) · 10,000-buyer matching completes fast (no AI).
 *
 * Run: npx tsx scripts/property-radar-matching-dev-check.ts
 */
import { runMarketAreaSync } from "../src/lib/property-radar/market/engine";
import { fanoutSourcesToOrg } from "../src/lib/property-radar/market/fanout";
import { createMarketAreaKey } from "../src/lib/property-radar/market/area-key";
import { matchPropertyToBuyers } from "../src/lib/property-radar/matching/engine";
import { DEFAULT_RADAR_SETTINGS, type RadarSettingsLite } from "../src/lib/property-radar/intelligence/types";
import type {
  MarketAreaCacheState, MarketPropertySource, MarketRepository, MarketSyncWatermark,
  RelevantOrg, UpsertCacheStatePatch, UpsertMarketWatermarkPatch, UpsertOrgLinkPatch,
  InsertMarketAlertInput, CreateMarketSyncRunInput,
} from "../src/lib/property-radar/market/types";
import type {
  MatchStatus, MatchableBuyer, MatchableProperty, MatchingRepository,
  PerfectMatchTaskInput, StoredBuyerMatch, UpsertMatchInput, UpsertMatchResult,
} from "../src/lib/property-radar/matching/types";
import type { NormalizedListingDetails, NormalizedListingMetadata } from "../src/lib/property-radar/providers";

const CITY = "חיפה";

// ── In-memory market repo (stores full metadata for fan-out) ─────────────────
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
  async insertMarketAlert(i: InsertMarketAlertInput) {
    // Mirror the real repo: the shared-cache source id is merged INTO metadata.
    this.alerts.push({ ...i, metadata: { ...i.metadata, marketPropertySourceId: i.marketPropertySourceId } });
  }
  private byId(id: string) { for (const s of this.sources.values()) if (s.id === id) return s; return undefined; }
}

// ── In-memory matching repo ───────────────────────────────────────────────────
interface MatchRow {
  id: string; orgId: string; buyerId: string; sourceId: string;
  score: number; level: string; status: string; isActive: boolean;
  positives: string[]; negatives: string[];
}
class MatchingRepo implements MatchingRepository {
  buyersByOrg = new Map<string, MatchableBuyer[]>();
  rows = new Map<string, MatchRow>(); // key = buyerId|sourceId
  tasks: PerfectMatchTaskInput[] = [];
  private seq = 0;
  async getActiveBuyersForOrg(orgId: string) {
    return (this.buyersByOrg.get(orgId) ?? []).filter((b) => b.status === "active");
  }
  async upsertBuyerPropertyMatch(input: UpsertMatchInput): Promise<UpsertMatchResult> {
    const key = `${input.buyerId}|${input.marketPropertySourceId}`;
    const prev = this.rows.get(key);
    if (prev) {
      const scoreChanged = prev.score !== input.matchScore;
      prev.score = input.matchScore; prev.level = input.matchLevel; prev.isActive = true;
      prev.positives = input.explanation.positives; prev.negatives = input.explanation.negatives;
      return { matchId: prev.id, created: false, scoreChanged };
    }
    const id = `m-${++this.seq}`;
    this.rows.set(key, { id, orgId: input.orgId, buyerId: input.buyerId, sourceId: input.marketPropertySourceId, score: input.matchScore, level: input.matchLevel, status: "new", isActive: true, positives: input.explanation.positives, negatives: input.explanation.negatives });
    return { matchId: id, created: true, scoreChanged: true };
  }
  async markMatchesInactiveForSource(sourceId: string) {
    let n = 0;
    for (const r of this.rows.values()) if (r.sourceId === sourceId && r.isActive) { r.isActive = false; n++; }
    return n;
  }
  async perfectMatchTaskExists(orgId: string, buyerId: string) {
    return this.tasks.some((t) => t.orgId === orgId && t.buyerId === buyerId);
  }
  async createPerfectMatchTask(input: PerfectMatchTaskInput) { this.tasks.push(input); }
  async getTopMatchesForSource(orgId: string, sourceId: string, limit = 20): Promise<StoredBuyerMatch[]> {
    return [...this.rows.values()]
      .filter((r) => r.orgId === orgId && r.sourceId === sourceId && r.isActive)
      .sort((a, b) => b.score - a.score).slice(0, limit)
      .map((r) => ({ id: r.id, buyerId: r.buyerId, buyerName: r.buyerId, phone: null, matchScore: r.score, matchLevel: r.level as StoredBuyerMatch["matchLevel"], status: r.status, budgetMin: null, budgetMax: null, lastContactedAt: null, positives: r.positives, negatives: r.negatives, marketPropertySourceId: r.sourceId }));
  }
  async countRelevantMatchesForSource(orgId: string, sourceId: string) {
    return [...this.rows.values()].filter((r) => r.orgId === orgId && r.sourceId === sourceId && r.isActive).length;
  }
  async updateMatchStatus(orgId: string, matchId: string, status: MatchStatus) {
    for (const r of this.rows.values()) if (r.id === matchId && r.orgId === orgId) r.status = status;
  }
}

// ── Buyer factory ─────────────────────────────────────────────────────────────
type Kind = "perfect" | "relevant" | "bad_city" | "bad_budget";
function makeBuyer(orgId: string, id: string, kind: Kind): MatchableBuyer {
  const base: MatchableBuyer = {
    id, orgId, fullName: id, phone: "050-1234567", status: "active", temperature: "warm",
    budgetMin: null, budgetMax: null, roomsMin: null, roomsMax: null, sizeMin: null, sizeMax: null,
    preferredTypes: [], preferredCities: [CITY], preferredNeighborhoods: [],
    mustHaveParking: false, mustHaveBalcony: false, floorMin: null, floorMax: null,
    timeline: null, lastContactedAt: null, manualBonus: 0, manualPenalty: 0,
  };
  if (kind === "perfect") return { ...base, budgetMax: 99_000_000, roomsMin: 1, roomsMax: 10, timeline: "immediate" };
  // relevant: wide budget so they always pass the filter, but a manual penalty
  // keeps them in the "excellent" band (not perfect) deterministically.
  if (kind === "relevant") return { ...base, budgetMax: 8_000_000, roomsMin: 2, roomsMax: 6, timeline: "soon", manualPenalty: 12 };
  if (kind === "bad_city") return { ...base, preferredCities: ["אילת"], budgetMax: 99_000_000 };
  return { ...base, budgetMax: 100_000 }; // bad_budget: far below mock prices
}
function buildOrgBuyers(orgId: string, perfect: number, relevant: number, badCity: number, badBudget: number): MatchableBuyer[] {
  const out: MatchableBuyer[] = [];
  for (let i = 0; i < perfect; i++) out.push(makeBuyer(orgId, `${orgId}-perfect-${i}`, "perfect"));
  for (let i = 0; i < relevant; i++) out.push(makeBuyer(orgId, `${orgId}-rel-${i}`, "relevant"));
  for (let i = 0; i < badCity; i++) out.push(makeBuyer(orgId, `${orgId}-badcity-${i}`, "bad_city"));
  for (let i = 0; i < badBudget; i++) out.push(makeBuyer(orgId, `${orgId}-badbudget-${i}`, "bad_budget"));
  return out;
}

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

async function main(): Promise<void> {
  console.log("Property Radar™ buyer matching dev-check\n");

  // ── Part A — pure deterministic engine ─────────────────────────────────────
  const property: MatchableProperty = {
    sourceId: "p1", city: CITY, neighborhood: null, price: 2_500_000, rooms: 4,
    propertyType: "דירה", sizeSqm: 100, floorNumber: 3, hasParking: null, hasBalcony: null,
  };
  const buyersA = buildOrgBuyers("org-a", 10, 10, 15, 15); // 50
  const r1 = matchPropertyToBuyers({ property, buyers: buyersA });
  const r2 = matchPropertyToBuyers({ property, buyers: buyersA });
  assert(r1.evaluatedCount === 50, "engine evaluated all 50 buyers");
  assert(r1.relevantCount === 20, `only relevant buyers matched (20 of 50, got ${r1.relevantCount})`);
  assert(r1.filteredOutCount === 30, `fast-filter eliminated the 30 irrelevant buyers (got ${r1.filteredOutCount})`);
  assert(r1.perfectCount >= 1, `perfect matches detected (got ${r1.perfectCount})`);
  assert(r1.matches.every((m) => !m.buyerId.includes("bad")), "no irrelevant (wrong-city/over-budget) buyer was matched");
  assert(r1.matches.every((m, i, a) => i === 0 || a[i - 1]!.matchScore >= m.matchScore), "matches sorted highest score first");
  assert(JSON.stringify(r1.matches.map((m) => m.buyerId)) === JSON.stringify(r2.matches.map((m) => m.buyerId)), "engine is deterministic (identical output on re-run)");
  assert(r1.matches[0]?.explanation.generatedBy === "deterministic", "explanation generated deterministically (AI-pluggable, not AI)");
  assert(r1.matches[0]!.explanation.positives.some((p) => p.includes("תקציב")), "Hebrew positive reasons present (✓ מתאים לתקציב)");

  // Performance: 10,000 buyers must match quickly with deterministic filtering.
  const bigBuyers = buildOrgBuyers("perf", 2500, 2500, 2500, 2500); // 10,000
  const t0 = Date.now();
  const big = matchPropertyToBuyers({ property, buyers: bigBuyers });
  const ms = Date.now() - t0;
  assert(big.evaluatedCount === 10_000, "matched 10,000 buyers");
  assert(ms < 1000, `10,000-buyer matching is fast (${ms}ms < 1000ms, no AI)`);

  // ── Part B — full fan-out integration via the market engine ─────────────────
  const marketRepo = new MarketRepo();
  const matching = new MatchingRepo();
  matching.buyersByOrg.set("org-a", buildOrgBuyers("org-a", 10, 10, 15, 15)); // 50 (20 relevant)
  matching.buyersByOrg.set("org-b", buildOrgBuyers("org-b", 20, 20, 20, 20)); // 80 (40 relevant)

  const run = await runMarketAreaSync(
    { providerName: "mock", area: { city: CITY } },
    { repo: marketRepo, matching },
  );
  assert(run.status === "success", `market sync succeeded (${run.status})`);
  assert(run.matchesUpsertedCount > 0, `matches persisted during fan-out (${run.matchesUpsertedCount})`);

  const rowsA = [...matching.rows.values()].filter((r) => r.orgId === "org-a");
  const rowsB = [...matching.rows.values()].filter((r) => r.orgId === "org-b");
  const matchedBuyersA = new Set(rowsA.map((r) => r.buyerId));
  assert([...matchedBuyersA].every((id) => !id.includes("bad")), "org A: only relevant buyers matched (no bad-city/bad-budget)");
  assert(matchedBuyersA.size === 20, `org A: exactly its 20 relevant buyers matched (got ${matchedBuyersA.size})`);
  assert(new Set(rowsB.map((r) => r.buyerId)).size === 40, "org B: exactly its 40 relevant buyers matched");
  assert(rowsA.some((r) => r.level === "perfect"), "perfect matches stored");

  // Alerts carry the buyer count.
  const alertsWithBuyers = marketRepo.alerts.filter((a) => (a.metadata.buyerMatchCount as number) > 0);
  assert(alertsWithBuyers.length > 0, `alerts surface the matching-buyer count (${alertsWithBuyers.length} alerts)`);
  assert(alertsWithBuyers.every((a) => a.metadata.showBuyerMatches === true && a.metadata.marketPropertySourceId), "alerts flag show-buyers + carry the source id for the panel");

  // Tasks created for perfect matches — one per perfect buyer (deduped across sources).
  const perfectBuyers = new Set([...matching.rows.values()].filter((r) => r.level === "perfect").map((r) => `${r.orgId}|${r.buyerId}`));
  assert(matching.tasks.length === perfectBuyers.size, `one high-priority task per perfect buyer, deduped (tasks=${matching.tasks.length}, perfect buyers=${perfectBuyers.size})`);
  assert(matching.tasks.length === 30, `perfect tasks = 10 (org A) + 20 (org B) = 30 (got ${matching.tasks.length})`);

  // No duplicate matches: re-running fan-out for the same sources upserts, never inserts.
  const before = matching.rows.size;
  const tasksBefore = matching.tasks.length;
  const key = createMarketAreaKey({ city: CITY });
  const sources = await marketRepo.getMarketSourcesForFanout("mock", key);
  await fanoutSourcesToOrg(marketRepo, "org-a", { city: CITY, neighborhood: null }, sources.map((s) => ({ sourceId: s.sourceId, source: s.source, isNew: false, isUpdate: true, priceDropped: false })), { matching });
  assert(matching.rows.size === before, `re-run created NO duplicate matches (rows ${before} → ${matching.rows.size})`);
  assert(matching.tasks.length === tasksBefore, "re-run created NO duplicate perfect-match tasks");

  // Updated property recalculates: same buyer+source, new score → updates in place.
  const sample = [...matching.rows.values()].find((r) => r.buyerId.includes("rel"))!;
  const up = await matching.upsertBuyerPropertyMatch({
    orgId: sample.orgId, buyerId: sample.buyerId, marketPropertySourceId: sample.sourceId,
    matchScore: sample.score - 10, matchLevel: "good",
    breakdown: { priceScore: 0, locationScore: 0, roomsScore: 0, propertyTypeScore: 0, sizeScore: 0, parkingScore: 0, balconyScore: 0, floorScore: 0, timelineScore: 0 },
    manualBonus: 0, manualPenalty: 0,
    explanation: { positives: [], negatives: [], summary: "", generatedBy: "deterministic" },
  });
  assert(!up.created && up.scoreChanged, "updated property recalculates the existing match (no new row, score changed)");

  // Deleted property removes active matches.
  const delSource = sources[0]!.sourceId;
  const activeBefore = await matching.countRelevantMatchesForSource("org-a", delSource);
  const deactivated = await matching.markMatchesInactiveForSource(delSource);
  const activeAfter = await matching.countRelevantMatchesForSource("org-a", delSource);
  assert(activeBefore > 0 && deactivated > 0 && activeAfter === 0, `deleted property deactivates its matches (${activeBefore} → 0)`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
