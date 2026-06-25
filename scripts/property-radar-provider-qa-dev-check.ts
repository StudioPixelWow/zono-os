/**
 * LOCAL-DEV-ONLY check for the Production Provider QA layer (Phase 12).
 *
 * Pure engines + an in-memory QA repository. Verifies: malformed payload
 * rejected · missing optional fields accepted · duplicate/invalid images removed ·
 * phone normalized · schema changes detected · cross-provider duplicate detector ·
 * quality score calculated · provider continues after partial errors · QA is
 * fast (<5ms/listing). Does not touch any other phase.
 *
 * Run: npx tsx scripts/property-radar-provider-qa-dev-check.ts
 */
import { validateListingFields } from "../src/lib/property-radar/provider-qa/validator";
import { runNormalizationQA } from "../src/lib/property-radar/provider-qa/normalizer-check";
import { buildSchemaFingerprint, detectSchemaChanges } from "../src/lib/property-radar/provider-qa/schema";
import { detectCrossProviderDuplicates } from "../src/lib/property-radar/provider-qa/duplicate";
import { runProviderQA } from "../src/lib/property-radar/provider-qa/engine";
import type {
  InsertSchemaEventInput, ProviderQADailyMetricsRow, ProviderQARepository, SchemaFingerprint,
} from "../src/lib/property-radar/provider-qa/types";
import type { NormalizedListingDetails, NormalizedListingMetadata } from "../src/lib/property-radar/providers";

// ── In-memory QA repo ─────────────────────────────────────────────────────────
class QARepo implements ProviderQARepository {
  fingerprints = new Map<string, SchemaFingerprint>();
  events: InsertSchemaEventInput[] = [];
  metrics: ProviderQADailyMetricsRow[] = [];
  async getSchemaFingerprint(p: string) { return this.fingerprints.get(p) ?? null; }
  async saveSchemaFingerprint(p: string, f: SchemaFingerprint) { this.fingerprints.set(p, f); }
  async insertSchemaEvent(i: InsertSchemaEventInput) { this.events.push(i); }
  async upsertDailyMetrics(r: ProviderQADailyMetricsRow) {
    const i = this.metrics.findIndex((m) => m.provider === r.provider && m.day === r.day);
    if (i >= 0) this.metrics[i] = r; else this.metrics.push(r);
  }
  async getLatestDailyMetrics() { return this.metrics; }
  async getRecentSchemaEvents() { return this.events.map((e) => ({ provider: e.provider, field: e.field, previous_type: e.previousType, new_type: e.newType, severity: e.severity, detected_at: new Date().toISOString() })); }
}

function listing(over: Partial<NormalizedListingMetadata>): NormalizedListingMetadata {
  return { provider: "yad2", externalId: "x1", listingType: "private", city: "חיפה", price: 2_000_000, rooms: 4, sizeSqm: 100, phone: "050-1234567", publishedAt: "2026-06-01T00:00:00Z", ...over };
}

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

async function main(): Promise<void> {
  console.log("Property Radar™ provider QA dev-check\n");

  // 1) malformed payload rejected (missing required fields).
  const malformed = validateListingFields({ provider: "yad2", externalId: "", city: null as never, listingType: undefined });
  assert(!malformed.valid && malformed.missingRequired.includes("externalId") && malformed.missingRequired.includes("city"), "malformed payload rejected (missing required fields listed)");

  // 2) missing OPTIONAL fields accepted.
  const minimal = validateListingFields({ provider: "yad2", externalId: "x9", city: "תל אביב", listingType: "broker" });
  assert(minimal.valid && minimal.missingOptional.length > 0, "missing optional fields accepted (still valid)");

  // 3) duplicate + invalid images removed.
  const det: NormalizedListingDetails = { ...listing({}), images: ["https://i/x.jpg", "HTTPS://I/X.JPG", "not-a-url", "https://i/y.jpg", "ftp://no"] };
  const nq = runNormalizationQA(det);
  assert(nq.cleaned.images.length === 2, `duplicate + invalid images removed (kept ${nq.cleaned.images.length}/5)`);
  assert(nq.issues.some((i) => i.code === "duplicate_images") && nq.issues.some((i) => i.code === "invalid_images"), "image issues reported");

  // 4) phone normalized.
  assert(runNormalizationQA(listing({ phone: "050-123-4567" })).cleaned.normalizedPhone != null, "phone normalized to digits");
  assert(runNormalizationQA(listing({ phone: null })).issues.some((i) => i.code === "phone_missing"), "missing phone flagged");

  // 5) schema change detection (yesterday listingId → today id).
  const prev = buildSchemaFingerprint([{ listingId: "a", price: 100, hasAgent: true }]);
  const next = buildSchemaFingerprint([{ id: "a", price: "100", hasAgent: true }]); // renamed + type change
  const changes = detectSchemaChanges("yad2", prev, next);
  assert(changes.some((c) => c.field === "listingId" && c.newType === null), "removed field detected (listingId)");
  assert(changes.some((c) => c.field === "id" && c.previousType === null), "new field detected (id)");
  assert(changes.some((c) => c.field === "price" && c.previousType === "number" && c.newType === "string"), "type change detected (price number→string)");

  // 6) cross-provider duplicate detector.
  const dupA = listing({ provider: "yad2", externalId: "y-1", phone: "0501234567", price: 2_500_000, rooms: 4, imageUrl: "https://img/1.jpg" });
  const dupB = listing({ provider: "madlan", externalId: "m-1", phone: "050-123-4567", price: 2_500_000, rooms: 4, imageUrl: "https://img/1.jpg" });
  const groups = detectCrossProviderDuplicates([dupA, dupB, listing({ provider: "yad2", externalId: "y-2", phone: "0529999999", price: 9_000_000 })]);
  assert(groups.length === 1 && groups[0]!.members.length === 2, "cross-provider duplicate group formed");
  assert(groups[0]!.providers.includes("yad2") && groups[0]!.providers.includes("madlan"), "duplicate group keeps BOTH providers");

  // 7) quality score calculated (clean high, messy lower).
  const clean = runNormalizationQA(listing({ imageUrl: "https://img/ok.jpg" }));
  const messy = runNormalizationQA(listing({ phone: null, listingType: "unknown", city: "חיפה", price: "x" as never }));
  assert(clean.qualityScore >= 90 && clean.qualityScore <= 100, `clean listing scores high (${clean.qualityScore})`);
  assert(messy.qualityScore < clean.qualityScore, `messy listing scores lower (${messy.qualityScore} < ${clean.qualityScore})`);

  // 8) provider continues after partial errors (mixed good/malformed batch).
  const repo = new QARepo();
  repo.fingerprints.set("yad2", buildSchemaFingerprint([{ listingId: "a", price: 1 }])); // seed prev schema
  const batch = await runProviderQA({
    provider: "yad2",
    listings: [
      listing({ externalId: "g1", rawMetadata: { id: "g1", price: 1 } }),
      listing({ externalId: "", city: null as never, listingType: undefined, rawMetadata: { id: "bad" } }), // malformed
      listing({ externalId: "g2", rawMetadata: { id: "g2", price: 2 } }),
    ],
    latencyMs: 12,
  }, { repo });
  assert(batch.errors.length === 0, "QA batch did not throw on partial errors");
  assert(batch.statistics.scanned === 3 && batch.statistics.rejected >= 1, `batch processed all 3, rejected the malformed (${batch.statistics.rejected})`);
  assert(repo.metrics.length === 1 && repo.metrics[0]!.listings_scanned === 3, "daily metrics persisted");
  assert(repo.events.some((e) => e.field === "listingId"), "schema change persisted as event during sync QA");

  // degraded path: an all-broken batch marks the provider degraded + admin alert.
  const repo2 = new QARepo();
  const broken = await runProviderQA({ provider: "yad2", listings: [listing({ phone: null, listingType: "unknown", city: null as never, price: "x" as never, imageUrl: null })] }, { repo: repo2 });
  assert(broken.adminAlert === true, "low quality raises admin alert (<80)");
  assert(broken.degraded === true && repo2.events.some((e) => e.field === "quality_score"), "very low quality marks provider degraded (<60) + alert event");

  // Performance: < 5ms per listing.
  const big = Array.from({ length: 2000 }, (_, i) => listing({ externalId: `p${i}` }));
  const t0 = Date.now();
  for (const l of big) runNormalizationQA(l);
  const perMs = (Date.now() - t0) / big.length;
  assert(perMs < 5, `normalization QA is fast (${perMs.toFixed(3)}ms/listing < 5ms)`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
