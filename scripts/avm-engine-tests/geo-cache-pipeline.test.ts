// ============================================================================
// ZONO GEO — automatic fast pipeline: canonical cache keys + internal-first
// resolution (tsx; pure logic, offline). Proves the cost-saving core is correct
// AND honest:
//   • the SAME real location keys the same way across Hebrew⇄English spelling,
//   • a city/neighborhood coordinate can never be served as a precise one,
//   • identical addresses collapse to one lookup (dedup),
//   • a coarse coordinate never overwrites a precise one (no-promote).
// Run: node --import tsx --test scripts/avm-engine-tests/geo-cache-pipeline.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCacheKeyCandidates, writeKeyForResolution, foldStreet, resolutionForKeyType,
} from "@/lib/geo/geo-cache-key";
import {
  createEvidenceIndex, addEvidencePoint, resolveFromEvidence, resolveFromCache,
  resolveInternal, outranks, type CachedCoord,
} from "@/lib/geo/geo-evidence-index";
import { isPreciseResolution } from "@/lib/geo/address";

const KB_HE = "קרית ביאליק";
const KB_HE2 = "קריית ביאליק";   // male spelling
const KB_EN = "Kiryat Bialik";

test("canonical city key is identical across Hebrew spelling AND English transliteration", () => {
  const cityKey = (cs: ReturnType<typeof buildCacheKeyCandidates>) => cs.find((c) => c.keyType === "city")!.key;
  assert.equal(cityKey(buildCacheKeyCandidates({ city: KB_HE, neighborhood: "גבעת הרקפות" })),
               cityKey(buildCacheKeyCandidates({ city: KB_HE2, neighborhood: "גבעת הרקפות" })));
  assert.equal(cityKey(buildCacheKeyCandidates({ city: KB_HE })),
               cityKey(buildCacheKeyCandidates({ city: KB_EN }))); // EN listings ≡ HE transactions
});

test("candidate granularities are finest→coarsest with honest resolutions", () => {
  const cs = buildCacheKeyCandidates({ city: KB_EN, neighborhood: "צור שלום", street: "לוטם", streetNumber: "2" });
  assert.deepEqual(cs.map((c) => c.keyType), ["exact", "street", "neighborhood", "city"]);
  assert.deepEqual(cs.map((c) => c.resolution), ["ROOFTOP", "STREET", "NEIGHBORHOOD", "CITY"]);
});

test("street fold drops the house number (same street, different numbers → one key)", () => {
  assert.equal(foldStreet("לוטם 2"), foldStreet("לוטם 5"));
  const a = buildCacheKeyCandidates({ city: KB_EN, street: "לוטם 2" }).find((c) => c.keyType === "street")!.key;
  const b = buildCacheKeyCandidates({ city: KB_EN, street: "לוטם 5" }).find((c) => c.keyType === "street")!.key;
  assert.equal(a, b);
});

test("a city-only address yields a city key; a street-less one stops at neighborhood; no city → nothing", () => {
  assert.deepEqual(buildCacheKeyCandidates({ city: KB_EN }).map((c) => c.keyType), ["city"]);
  assert.deepEqual(buildCacheKeyCandidates({ city: KB_EN, neighborhood: "אפק" }).map((c) => c.keyType), ["neighborhood", "city"]);
  assert.deepEqual(buildCacheKeyCandidates({}), []);
});

test("writeKeyForResolution never stores a coarse result under a precise key", () => {
  const parts = { city: KB_EN, neighborhood: "אפק", street: "לוטם", streetNumber: "2" };
  assert.equal(writeKeyForResolution(parts, "CITY")!.keyType, "city");
  assert.equal(writeKeyForResolution(parts, "NEIGHBORHOOD")!.keyType, "neighborhood");
  assert.equal(writeKeyForResolution(parts, "STREET")!.keyType, "street");
  assert.equal(writeKeyForResolution(parts, "ROOFTOP")!.keyType, "exact");
});

test("evidence: same-street match is STREET-precise centroid; neighborhood/city stay coarse", () => {
  const idx = createEvidenceIndex();
  addEvidencePoint(idx, { city: KB_EN, neighborhood: "אפק", street: "לוטם", streetNumber: "2" }, { lat: 32.84, lng: 35.08 });
  addEvidencePoint(idx, { city: KB_EN, neighborhood: "אפק", street: "לוטם", streetNumber: "8" }, { lat: 32.86, lng: 35.10 });

  const street = resolveFromEvidence(idx, { city: KB_HE, street: "לוטם 4" });
  assert.ok(street);
  assert.equal(street!.source, "internal_street");
  assert.equal(street!.resolution, "STREET");
  assert.ok(isPreciseResolution(street!.resolution));
  assert.ok(Math.abs(street!.lat - 32.85) < 1e-9);

  const hood = resolveFromEvidence(idx, { city: KB_HE, neighborhood: "אפק" });
  assert.equal(hood!.source, "internal_neighborhood");
  assert.equal(hood!.resolution, "NEIGHBORHOOD");
  assert.ok(!isPreciseResolution(hood!.resolution));

  const city = resolveFromEvidence(idx, { city: KB_EN });
  assert.equal(city!.source, "internal_city");
  assert.equal(city!.resolution, "CITY");
  assert.ok(!isPreciseResolution(city!.resolution));
});

test("exact same-address evidence returns the building point (STREET-precise, never fake ROOFTOP)", () => {
  const idx = createEvidenceIndex();
  addEvidencePoint(idx, { city: KB_EN, street: "יקינתון", streetNumber: "5" }, { lat: 32.81, lng: 35.07 });
  const m = resolveFromEvidence(idx, { city: KB_HE2, street: "יקינתון", streetNumber: "5" });
  assert.equal(m!.source, "internal_exact");
  assert.equal(m!.resolution, "STREET");
  assert.equal(m!.lat, 32.81);
});

test("cache beats evidence and reports as a cache hit", () => {
  const idx = createEvidenceIndex();
  addEvidencePoint(idx, { city: KB_EN, street: "לוטם", streetNumber: "2" }, { lat: 32.84, lng: 35.08 });
  const cache = new Map<string, CachedCoord>();
  const streetKey = buildCacheKeyCandidates({ city: KB_EN, street: "לוטם" }).find((c) => c.keyType === "street")!.key;
  cache.set(streetKey, { lat: 1.23, lng: 4.56, resolution: "STREET", provider: "google" });
  const m = resolveInternal(idx, cache, { city: KB_HE, street: "לוטם 9" });
  assert.equal(m!.source, "internal_cache");
  assert.equal(m!.lat, 1.23);
});

test("no internal evidence at all → null (caller must pay the provider)", () => {
  const idx = createEvidenceIndex();
  const cache = new Map<string, CachedCoord>();
  assert.equal(resolveInternal(idx, cache, { city: "אילת", neighborhood: "שחמון" }), null);
  assert.equal(resolveFromCache(cache, { city: "אילת" }), null);
});

test("dedup: identical street-less addresses collapse to one group key", () => {
  const a = buildCacheKeyCandidates({ city: KB_EN, neighborhood: "צור שלום" })[0].key;
  const b = buildCacheKeyCandidates({ city: KB_HE, neighborhood: "צור שלום" })[0].key;
  assert.equal(a, b);
});

test("no-promote: a coarse resolution never outranks a precise one", () => {
  assert.ok(!outranks("CITY", "STREET"));
  assert.ok(!outranks("NEIGHBORHOOD", "ROOFTOP"));
  assert.ok(outranks("STREET", "CITY"));
  assert.ok(outranks("STREET", null));
  assert.equal(resolutionForKeyType("city"), "CITY");
  assert.equal(resolutionForKeyType("exact"), "ROOFTOP");
});
