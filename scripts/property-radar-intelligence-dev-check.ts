/**
 * LOCAL-DEV-ONLY check for Property Radar™ opportunity scoring + alerts (Phase 4).
 *
 * Runs the sync engine END-TO-END against an in-memory repo + the mock provider
 * and verifies the intelligence layer:
 *   • first sync calculates + stores an opportunity score per NEW listing
 *   • private listings produce alerts
 *   • alert metadata carries WhatsApp + call links + Hebrew reasons
 *   • re-evaluating (forceFullFetch) does NOT create a duplicate unread alert
 *   • a plain re-sync (all UNCHANGED) creates no new alerts
 *   • if scoring throws, the run becomes PARTIAL (not failed) and import continues
 *
 * Run:
 *   npx tsx scripts/property-radar-intelligence-dev-check.ts
 *
 * NOTE: mock data is fabricated for testing only — never real market data.
 */
import { runPropertyAreaSync } from "../src/lib/property-radar/sync/engine";
import type {
  CreateSyncRunInput,
  FinishSyncRunPatch,
  SyncRepository,
  SyncSourceRecord,
  SyncWatermarkRecord,
  UpsertWatermarkPatch,
} from "../src/lib/property-radar/sync/types";
import { getPropertyProvider } from "../src/lib/property-radar/providers";
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

interface StoredSource extends SyncSourceRecord {
  city: string | null;
  neighborhood: string | null;
}

class InMemoryRepo implements SyncRepository, RadarIntelligenceRepository {
  sources = new Map<string, StoredSource>();
  runs: Array<{ id: string } & FinishSyncRunPatch> = [];
  watermarks = new Map<string, SyncWatermarkRecord>();
  scores = new Map<string, OpportunityScoreResult>();
  alerts: InsertPropertyAlertInput[] = [];
  failScoring = false;
  private seq = 0;

  private key(p: string, e: string) { return `${p}|${e}`; }
  private id(p: string) { return `${p}-${++this.seq}`; }

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
  async getExistingSourcesForArea(orgId: string, provider: string, area: PropertyRadarArea): Promise<SyncSourceRecord[]> {
    return [...this.sources.values()].filter(
      (s) => s.org_id === orgId && s.provider === provider && s.city === area.city &&
        (!area.neighborhood || s.neighborhood === area.neighborhood) &&
        ["active", "missing"].includes(s.source_status),
    );
  }
  async getSourceByExternalId(orgId: string, provider: string, externalId: string): Promise<SyncSourceRecord | null> {
    void orgId;
    return this.sources.get(this.key(provider, externalId)) ?? null;
  }
  async getStaleSources(): Promise<SyncSourceRecord[]> { return []; }
  async insertSourceFromMetadata(orgId: string, metadata: NormalizedListingMetadata, hash: string): Promise<string> {
    const id = this.id("src");
    const now = new Date().toISOString();
    this.sources.set(this.key(metadata.provider, metadata.externalId), {
      id, org_id: orgId, provider: metadata.provider, external_id: metadata.externalId,
      source_status: "active", content_hash: hash, missing_count: 0,
      price: metadata.price ?? null, published_at: metadata.publishedAt ?? null, last_seen_at: now,
      city: metadata.city ?? null, neighborhood: metadata.neighborhood ?? null,
    });
    return id;
  }
  async updateSourceSeen(sourceId: string, _m: NormalizedListingMetadata, hash: string): Promise<void> {
    const s = this.byId(sourceId);
    if (s) { s.content_hash = hash; s.source_status = "active"; s.missing_count = 0; s.last_seen_at = new Date().toISOString(); }
  }
  async updateSourceFullDetails(sourceId: string, _d: NormalizedListingDetails, hash: string): Promise<void> {
    const s = this.byId(sourceId);
    if (s) s.content_hash = hash;
  }
  async markSourceMissing(sourceId: string): Promise<void> {
    const s = this.byId(sourceId);
    if (s) { s.missing_count += 1; s.source_status = "missing"; }
  }
  async markSourceDeleted(sourceId: string): Promise<void> {
    const s = this.byId(sourceId);
    if (s) s.source_status = "deleted";
  }
  async upsertWatermark(orgId: string, provider: string, area: PropertyRadarArea, patch: UpsertWatermarkPatch): Promise<void> {
    this.watermarks.set(`${orgId}|${provider}|${area.city}|${area.neighborhood ?? ""}`, {
      org_id: orgId, provider, area_id: area.id ?? null, city: area.city, neighborhood: area.neighborhood ?? null,
      latest_external_id: patch.latestExternalId ?? null, latest_published_at: patch.latestPublishedAt ?? null,
      last_successful_scan_at: patch.lastSuccessfulScanAt ?? null, last_page_scanned: patch.lastPageScanned ?? null,
      stop_reason: patch.stopReason ?? null,
    });
  }
  async getWatermark(orgId: string, provider: string, area: PropertyRadarArea): Promise<SyncWatermarkRecord | null> {
    return this.watermarks.get(`${orgId}|${provider}|${area.city}|${area.neighborhood ?? ""}`) ?? null;
  }

  // intelligence
  async getRadarSettings(): Promise<RadarSettingsLite> { return { ...DEFAULT_RADAR_SETTINGS }; }
  async upsertOpportunityScore(orgId: string, propertySourceId: string, score: OpportunityScoreResult): Promise<void> {
    if (this.failScoring) throw new Error("simulated scoring failure");
    this.scores.set(`${orgId}|${propertySourceId}`, score);
  }
  async existingUnreadAlertExists(orgId: string, propertySourceId: string, alertType: string): Promise<boolean> {
    return this.alerts.some((a) => a.orgId === orgId && a.propertySourceId === propertySourceId && a.alertType === alertType);
  }
  async insertPropertyAlert(input: InsertPropertyAlertInput): Promise<void> { this.alerts.push(input); }

  private byId(id: string): StoredSource | undefined {
    for (const s of this.sources.values()) if (s.id === id) return s;
    return undefined;
  }
}

let failures = 0;
function assert(cond: boolean, label: string): void {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}`); }
}
const HEBREW = /[֐-׿]/;

async function main(): Promise<void> {
  console.log("Property Radar™ intelligence (scoring + alerts) dev-check\n");

  const orgId = "org-test";
  const area: PropertyRadarArea = { city: "תל אביב", neighborhood: "פלורנטין" };
  const base = { orgId, providerName: "mock" as const, area };

  // How many private listings does the mock emit for this area?
  const scanned = await getPropertyProvider("mock").scanAreaMetadata(area);
  const privateCount = scanned.listings.filter((l) => l.listingType === "private").length;
  assert(privateCount > 0, `mock emits ${privateCount} private listings`);

  const repo = new InMemoryRepo();

  // First sync — scores + alerts.
  const run1 = await runPropertyAreaSync(base, { repo });
  assert(run1.status === "success", "run1 success");
  assert(repo.scores.size === run1.newCount, `score saved per NEW listing (${repo.scores.size})`);
  assert(repo.alerts.length === privateCount, `private listings created ${repo.alerts.length} alerts`);
  assert(repo.alerts.every((a) => a.alertType === "new_private_property"), "all alerts are private-property alerts");

  const sample = repo.alerts[0]!;
  const md = sample.metadata as Record<string, unknown>;
  assert(typeof md.whatsappUrl === "string" && (md.whatsappUrl as string).startsWith("https://wa.me/"), "alert metadata has whatsappUrl");
  assert(typeof md.callUrl === "string" && (md.callUrl as string).startsWith("tel:+"), "alert metadata has callUrl");
  assert(Array.isArray(md.reasons) && (md.reasons as string[]).some((r) => HEBREW.test(r)), "alert reasons are Hebrew");
  assert(typeof md.price !== "undefined" && typeof md.rooms !== "undefined" && typeof md.imageUrl !== "undefined", "alert metadata has property details");

  const anyScore = [...repo.scores.values()][0]!;
  assert(anyScore.reasons.some((r) => HEBREW.test(r)), "score reasons are Hebrew");
  assert(anyScore.totalScore >= 0 && anyScore.totalScore <= 100, "score is clamped 0–100");

  // Re-evaluate via forceFullFetch → must NOT duplicate the unread alerts.
  const alertsBefore = repo.alerts.length;
  const run2 = await runPropertyAreaSync({ ...base, options: { forceFullFetch: true } }, { repo });
  assert(run2.updatedCount === run1.newCount, "run2 re-evaluated every listing (forceFullFetch)");
  assert(repo.alerts.length === alertsBefore, "no duplicate unread alerts created");

  // Plain re-sync — everything UNCHANGED → no new alerts, no new scores beyond keys.
  const run3 = await runPropertyAreaSync(base, { repo });
  assert(run3.newCount === 0 && run3.unchangedCount === run1.newCount, "run3 all UNCHANGED");
  assert(repo.alerts.length === alertsBefore, "UNCHANGED listings created no new alerts");

  // Resilience: scoring failure must downgrade run to PARTIAL, not fail import.
  const failRepo = new InMemoryRepo();
  failRepo.failScoring = true;
  const runFail = await runPropertyAreaSync(base, { repo: failRepo });
  assert(runFail.status === "partial", "scoring failure → run status partial (not failed)");
  assert(failRepo.sources.size === runFail.newCount && runFail.newCount > 0, "import continued despite scoring failure");
  assert(failRepo.alerts.length === 0, "no alerts when scoring failed");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
