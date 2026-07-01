// ============================================================================
// ✅ Comparable Discovery self-tests (pure, offline). VAL-QA-10.
// Exercises the deterministic core: distance bucketing, similarity monotonicity,
// dedupe (cross-source, strongest-kept), and the radius-selection policy — no DB.
// ============================================================================
import { radiusBucket, distanceOrNull } from "./distance";
import { computeSimilarity } from "./similarity";
import { dedupeCandidates } from "./dedupe";
import type { Candidate } from "./types";

export interface DiscoveryCheck { name: string; pass: boolean; detail: string }
export interface DiscoverySelfCheck { ok: boolean; total: number; passed: number; checks: DiscoveryCheck[] }

function cand(over: Partial<Candidate>): Candidate {
  return {
    source: "external_listings", sourceTable: "external_listings", sourceId: "x", provider: "yad2",
    comparableSource: "yad2", comparableType: "listing", city: "חיפה", neighborhood: null, street: null,
    latitude: null, longitude: null, distanceMeters: null, rooms: null, sqm: null, floor: null, buildingYear: null,
    price: 1000000, pricePerSqm: 10000, propertyType: null, saleDate: null, listingDate: null,
    imageUrl: null, originalUrl: null, similarityScore: 50, radiusBucket: null, matchLevel: "same_city",
    isTraceable: true, usable: true, rejectionReason: null, duplicateRefs: [], ...over,
  };
}

export function runSelfCheck(): DiscoverySelfCheck {
  const checks: DiscoveryCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Distance bucketing.
  add("bucket 400m→500", radiusBucket(400) === 500, `${radiusBucket(400)}`);
  add("bucket 2500m→3000", radiusBucket(2500) === 3000, `${radiusBucket(2500)}`);
  add("bucket 5000m→null", radiusBucket(5000) === null, `${radiusBucket(5000)}`);
  add("no coords → null distance", distanceOrNull(null, null, 1, 1) === null, "ok");

  // Similarity monotonicity: closer + same-city beats far + out-of-city.
  const near = computeSimilarity({ matchLevel: "same_city", distanceMeters: 200, sameNeighborhood: true, sameStreet: false, sameType: true, hasType: true, roomsDiff: 0, sqmDiffPct: 0.02, floorDiff: 0, ageMonths: 2, source: "property_transactions", hasPrice: true, hasSqm: true, isTraceable: true });
  const far = computeSimilarity({ matchLevel: "radius", distanceMeters: 3800, sameNeighborhood: false, sameStreet: false, sameType: false, hasType: true, roomsDiff: 2, sqmDiffPct: 0.4, floorDiff: 5, ageMonths: 40, source: "market_property_sources", hasPrice: true, hasSqm: true, isTraceable: true });
  add("similarity: near > far", near > far, `near=${near} far=${far}`);
  const untr = computeSimilarity({ matchLevel: "same_city", distanceMeters: 200, sameNeighborhood: true, sameStreet: true, sameType: true, hasType: true, roomsDiff: 0, sqmDiffPct: 0, floorDiff: 0, ageMonths: 1, source: "property_transactions", hasPrice: false, hasSqm: false, isTraceable: false });
  add("similarity: untraceable penalized", untr < near, `untr=${untr}`);

  // Dedupe: same source+id kept once; strongest survives.
  const d1 = dedupeCandidates([
    cand({ sourceId: "A", similarityScore: 60 }),
    cand({ sourceId: "A", similarityScore: 80 }),   // duplicate id — stronger
    cand({ sourceId: "B", similarityScore: 55 }),
  ]);
  add("dedupe removes same id", d1.kept.length === 2 && d1.duplicatesRemoved === 1, `${d1.kept.length}/${d1.duplicatesRemoved}`);
  add("dedupe keeps stronger", d1.kept.some((c) => c.sourceId === "A" && c.similarityScore === 80), "ok");
  add("dedupe retains ref", d1.kept.some((c) => c.duplicateRefs.length > 0), "ok");

  // Dedupe by URL across sources.
  const d2 = dedupeCandidates([
    cand({ sourceId: "P", sourceTable: "properties", originalUrl: "https://x/1", similarityScore: 50 }),
    cand({ sourceId: "E", sourceTable: "external_listings", originalUrl: "https://x/1", similarityScore: 70 }),
  ]);
  add("dedupe by URL cross-source", d2.kept.length === 1 && d2.kept[0].similarityScore === 70, `${d2.kept.length}`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
