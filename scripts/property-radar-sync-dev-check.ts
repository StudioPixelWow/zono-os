/**
 * LOCAL-DEV-ONLY check for the Property Radar™ incremental sync engine (Phase 3).
 *
 * Runs the engine END-TO-END against an IN-MEMORY repository + the mock provider.
 * No Supabase, no network, no credits, no production data. It proves the core
 * incremental contract:
 *   • first run  → all listings are NEW (and each is full-fetched once)
 *   • second run → all listings are UNCHANGED (and NOTHING is full-fetched)
 *   • sources are not duplicated across runs
 *   • a sync_run row is recorded per run
 *   • a watermark is written
 *   • dryRun computes decisions without mutating the store
 *   • removing a listing eventually flips it MISSING → DELETED
 *
 * Run:
 *   npx tsx scripts/property-radar-sync-dev-check.ts
 *
 * NOTE: the mock provider returns FABRICATED data for testing only.
 */
// Import the engine + types directly (NOT the sync index) so this dev-check never
// loads the server-only Supabase repository.
import { runPropertyAreaSync } from "../src/lib/property-radar/sync/engine";
import type {
  CreateSyncRunInput,
  FinishSyncRunPatch,
  SyncRepository,
  SyncSourceRecord,
  SyncWatermarkRecord,
  UpsertWatermarkPatch,
} from "../src/lib/property-radar/sync/types";
import type { PropertyProviderName } from "../src/lib/property-radar/types";
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyRadarArea,
} from "../src/lib/property-radar/providers";
import {
  DEFAULT_RADAR_SETTINGS,
  type InsertPropertyAlertInput,
  type OpportunityScoreResult,
  type RadarIntelligenceRepository,
  type RadarSettingsLite,
} from "../src/lib/property-radar/intelligence/types";

// ── In-memory repository ─────────────────────────────────────────────────────
interface StoredSource extends SyncSourceRecord {
  city: string | null;
  neighborhood: string | null;
}

class InMemoryRepo implements SyncRepository, RadarIntelligenceRepository {
  sources = new Map<string, StoredSource>(); // key: provider|externalId
  runs: Array<{ id: string } & FinishSyncRunPatch> = [];
  watermarks = new Map<string, SyncWatermarkRecord>();
  scores = new Map<string, OpportunityScoreResult>();
  alerts: InsertPropertyAlertInput[] = [];
  private seq = 0;

  private key(provider: string, externalId: string) {
    return `${provider}|${externalId}`;
  }
  private id(prefix: string) {
    return `${prefix}-${++this.seq}`;
  }

  async createSyncRun(input: CreateSyncRunInput): Promise<string> {
    void input;
    const id = this.id("run");
    this.runs.push({ id, status: "success" } as { id: string } & FinishSyncRunPatch);
    return id;
  }
  async finishSyncRun(runId: string, patch: FinishSyncRunPatch): Promise<void> {
    const r = this.runs.find((x) => x.id === runId);
    if (r) Object.assign(r, patch);
  }
  async getExistingSourcesForArea(
    orgId: string,
    provider: PropertyProviderName,
    area: PropertyRadarArea,
  ): Promise<SyncSourceRecord[]> {
    return [...this.sources.values()].filter(
      (s) =>
        s.org_id === orgId &&
        s.provider === provider &&
        s.city === area.city &&
        (!area.neighborhood || s.neighborhood === area.neighborhood) &&
        ["active", "missing"].includes(s.source_status),
    );
  }
  async getSourceByExternalId(
    orgId: string,
    provider: PropertyProviderName,
    externalId: string,
  ): Promise<SyncSourceRecord | null> {
    return this.sources.get(this.key(provider, externalId)) ?? null;
  }
  async getStaleSources(
    orgId: string,
    provider: PropertyProviderName,
    notSeenBeforeIso: string,
  ): Promise<SyncSourceRecord[]> {
    return [...this.sources.values()].filter(
      (s) =>
        s.org_id === orgId &&
        s.provider === provider &&
        ["active", "missing"].includes(s.source_status) &&
        (!s.last_seen_at || s.last_seen_at < notSeenBeforeIso),
    );
  }
  async insertSourceFromMetadata(
    orgId: string,
    metadata: NormalizedListingMetadata,
    hash: string,
  ): Promise<string> {
    const id = this.id("src");
    const now = new Date().toISOString();
    this.sources.set(this.key(metadata.provider, metadata.externalId), {
      id,
      org_id: orgId,
      provider: metadata.provider,
      external_id: metadata.externalId,
      source_status: "active",
      content_hash: hash,
      missing_count: 0,
      price: metadata.price ?? null,
      published_at: metadata.publishedAt ?? null,
      last_seen_at: now,
      city: metadata.city ?? null,
      neighborhood: metadata.neighborhood ?? null,
    });
    return id;
  }
  async updateSourceSeen(
    sourceId: string,
    metadata: NormalizedListingMetadata,
    hash: string,
  ): Promise<void> {
    const s = this.findById(sourceId);
    if (s) {
      s.content_hash = hash;
      s.source_status = "active";
      s.missing_count = 0;
      s.last_seen_at = new Date().toISOString();
    }
  }
  async updateSourceFullDetails(
    sourceId: string,
    _details: NormalizedListingDetails,
    hash: string,
  ): Promise<void> {
    const s = this.findById(sourceId);
    if (s) s.content_hash = hash;
  }
  async markSourceMissing(sourceId: string): Promise<void> {
    const s = this.findById(sourceId);
    if (s) {
      s.missing_count += 1;
      s.source_status = "missing";
    }
  }
  async markSourceDeleted(sourceId: string): Promise<void> {
    const s = this.findById(sourceId);
    if (s) s.source_status = "deleted";
  }
  async upsertWatermark(
    orgId: string,
    provider: PropertyProviderName,
    area: PropertyRadarArea,
    patch: UpsertWatermarkPatch,
  ): Promise<void> {
    const k = `${orgId}|${provider}|${area.city}|${area.neighborhood ?? ""}`;
    this.watermarks.set(k, {
      org_id: orgId,
      provider,
      area_id: area.id ?? null,
      city: area.city,
      neighborhood: area.neighborhood ?? null,
      latest_external_id: patch.latestExternalId ?? null,
      latest_published_at: patch.latestPublishedAt ?? null,
      last_successful_scan_at: patch.lastSuccessfulScanAt ?? null,
      last_page_scanned: patch.lastPageScanned ?? null,
      stop_reason: patch.stopReason ?? null,
    });
  }
  async getWatermark(
    orgId: string,
    provider: PropertyProviderName,
    area: PropertyRadarArea,
  ): Promise<SyncWatermarkRecord | null> {
    const k = `${orgId}|${provider}|${area.city}|${area.neighborhood ?? ""}`;
    return this.watermarks.get(k) ?? null;
  }

  // ── RadarIntelligenceRepository ────────────────────────────────────────────
  async getRadarSettings(_orgId: string): Promise<RadarSettingsLite> {
    void _orgId;
    return { ...DEFAULT_RADAR_SETTINGS };
  }
  async upsertOpportunityScore(
    orgId: string,
    propertySourceId: string,
    score: OpportunityScoreResult,
  ): Promise<void> {
    this.scores.set(`${orgId}|${propertySourceId}`, score);
  }
  async existingUnreadAlertExists(
    orgId: string,
    propertySourceId: string,
    alertType: string,
  ): Promise<boolean> {
    return this.alerts.some(
      (a) => a.orgId === orgId && a.propertySourceId === propertySourceId && a.alertType === alertType,
    );
  }
  async insertPropertyAlert(input: InsertPropertyAlertInput): Promise<void> {
    this.alerts.push(input);
  }

  private findById(id: string): StoredSource | undefined {
    for (const s of this.sources.values()) if (s.id === id) return s;
    return undefined;
  }
}

// ── Assertions ───────────────────────────────────────────────────────────────
let failures = 0;
function assert(cond: boolean, label: string): void {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

async function main(): Promise<void> {
  console.log("Property Radar™ incremental sync dev-check\n");

  const repo = new InMemoryRepo();
  const orgId = "org-test";
  const area: PropertyRadarArea = { city: "תל אביב", neighborhood: "פלורנטין" };
  const base = { orgId, providerName: "mock" as const, area };

  // dryRun first — must not mutate the store
  const dry = await runPropertyAreaSync({ ...base, options: { dryRun: true } }, { repo });
  assert(dry.newCount >= 8, `dryRun decides ${dry.newCount} NEW`);
  assert(repo.sources.size === 0, "dryRun wrote no sources");
  assert(repo.runs.length === 0, "dryRun recorded no run");

  // First real run — all NEW, each full-fetched
  const run1 = await runPropertyAreaSync(base, { repo });
  assert(run1.status === "success", "run1 status success");
  assert(run1.newCount >= 8 && run1.unchangedCount === 0, `run1 all NEW (${run1.newCount})`);
  assert(run1.fullFetchCount === run1.newCount, "run1 full-fetched every NEW listing");
  assert(repo.sources.size === run1.newCount, "run1 persisted one source per listing");
  assert(repo.runs.length === 1, "run1 recorded a sync_run row");
  assert(repo.watermarks.size === 1, "run1 wrote a watermark");
  assert(run1.creditsSavedEstimate === Math.max(0, run1.scannedCount - run1.fullFetchCount),
    "run1 credit-saved math holds");

  // Second run — all UNCHANGED, zero full fetch, no duplication
  const sizeAfter1 = repo.sources.size;
  const run2 = await runPropertyAreaSync(base, { repo });
  assert(run2.unchangedCount === run1.newCount && run2.newCount === 0, "run2 all UNCHANGED");
  assert(run2.fullFetchCount === 0, "run2 performed NO full fetch");
  assert(repo.sources.size === sizeAfter1, "run2 did not duplicate sources");
  assert(run2.creditsUsed === 0, "run2 used 0 credits (mock scan + no fetch)");
  assert(repo.runs.length === 2, "run2 recorded a second sync_run row");

  // MISSING → DELETED, driven through the real engine. Insert a phantom source in
  // the same area that the mock scan will never return, then run sync repeatedly:
  // it should flip missing (count 1), missing (count 2), then deleted.
  const phantomId = await repo.insertSourceFromMetadata(
    orgId,
    {
      provider: "mock",
      externalId: "phantom-gone",
      listingType: "private",
      city: area.city,
      neighborhood: area.neighborhood,
    },
    "phantomhash",
  );
  const phantomKey = "mock|phantom-gone";

  const rMiss1 = await runPropertyAreaSync(base, { repo });
  assert(rMiss1.missingCount === 1, "phantom flagged MISSING on first absence");
  assert(repo.sources.get(phantomKey)!.source_status === "missing", "phantom status = missing");

  const rMiss2 = await runPropertyAreaSync(base, { repo });
  assert(rMiss2.missingCount === 1 && repo.sources.get(phantomKey)!.missing_count >= 2,
    "phantom missing_count climbs toward threshold");

  const rDel = await runPropertyAreaSync(base, { repo });
  assert(rDel.deletedCount === 1, "phantom flips to DELETED past threshold");
  assert(repo.sources.get(phantomKey)!.source_status === "deleted", "phantom status = deleted (soft)");
  void phantomId;

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
