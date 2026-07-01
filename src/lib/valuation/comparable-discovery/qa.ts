// ============================================================================
// ✅ Comparable Discovery self-tests (pure, offline). Phase 27.4.
// Exercises the deterministic core: distance bucketing, professional similarity
// (building/attributes/neighborhood/type), dedupe, quality score, and honest
// weak detection — no DB, no AI.
// ============================================================================
import { radiusBucket, distanceOrNull } from "./distance";
import { computeSimilarity, type SimilarityArgs } from "./similarity";
import { computeQuality } from "./quality";
import { dedupeCandidates } from "./dedupe";
import { RADIUS_LADDER } from "./types";
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
    isTraceable: true, usable: true, sameType: true, matchReasons: [], rejectionReason: null, duplicateRefs: [], ...over,
  };
}

// Baseline similarity args with all professional factors defaulted to null/false.
function sim(over: Partial<SimilarityArgs>): number {
  return computeSimilarity({
    matchLevel: "radius", distanceMeters: 1000, sameNeighborhood: false, differentKnownNeighborhood: false,
    sameStreet: false, sameBuilding: false, sameConstructionPeriod: false, sameType: false, hasType: true,
    roomsDiff: null, sqmDiffPct: null, floorDiff: null, totalFloorsDiff: null,
    parkingMatch: null, storageMatch: null, balconyMatch: null, elevatorMatch: null, conditionMatch: null, luxuryMatch: null,
    yearDiff: null, ageMonths: null, source: "external_listings", hasPrice: true, hasSqm: true, isTraceable: true, ...over,
  });
}

export function runSelfCheck(): DiscoverySelfCheck {
  const checks: DiscoveryCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Concentric ladder (Part 2) — 8 rings incl. 250/750/1500.
  add("ladder has 8 rings", RADIUS_LADDER.length === 8 && RADIUS_LADDER[0] === 250, `${RADIUS_LADDER.join(",")}`);
  add("bucket 200m→250", radiusBucket(200) === 250, `${radiusBucket(200)}`);
  add("bucket 600m→750", radiusBucket(600) === 750, `${radiusBucket(600)}`);
  add("bucket 1200m→1500", radiusBucket(1200) === 1500, `${radiusBucket(1200)}`);
  add("bucket 5000m→null", radiusBucket(5000) === null, `${radiusBucket(5000)}`);
  add("no coords → null distance", distanceOrNull(null, null, 1, 1) === null, "ok");

  // Similarity: near+same-city beats far+out.
  const near = sim({ matchLevel: "same_city", distanceMeters: 200, sameNeighborhood: true, sameType: true, roomsDiff: 0, sqmDiffPct: 0.02, source: "property_transactions" });
  const far = sim({ matchLevel: "radius", distanceMeters: 3800, sameType: false, roomsDiff: 2, sqmDiffPct: 0.4, source: "market_property_sources" });
  add("near > far", near > far, `${near}/${far}`);

  // Part 5 — same building boosts.
  add("same building boosts", sim({ sameBuilding: true }) > sim({ sameBuilding: false }), "");
  // Part 4 — same type beats different type.
  add("same type > diff type", sim({ sameType: true }) > sim({ sameType: false, hasType: true }), "");
  // Part 3 — different neighborhood reduces (not rejects).
  const diffNbr = sim({ differentKnownNeighborhood: true });
  add("diff neighborhood reduced not zero", diffNbr < sim({}) && diffNbr > 0, `${diffNbr}`);
  // Part 6 — attribute matches help.
  add("parking+condition match helps", sim({ parkingMatch: true, conditionMatch: true }) > sim({ parkingMatch: false, conditionMatch: false }), "");
  // Traceability penalty.
  add("untraceable penalized", sim({ isTraceable: false, hasPrice: false, hasSqm: false }) < near, "");

  // Dedupe: same id kept once, strongest survives, ref retained.
  const d1 = dedupeCandidates([cand({ sourceId: "A", similarityScore: 60 }), cand({ sourceId: "A", similarityScore: 80 }), cand({ sourceId: "B", similarityScore: 55 })]);
  add("dedupe same id", d1.kept.length === 2 && d1.duplicatesRemoved === 1, `${d1.kept.length}`);
  add("dedupe keeps stronger + ref", d1.kept.some((c) => c.sourceId === "A" && c.similarityScore === 80 && c.duplicateRefs.length > 0), "");

  // Quality score (Part 10): strong close official set vs weak far portal set.
  const strongSet = [1, 2, 3, 4, 5].map((i) => cand({ source: "property_transactions", sourceTable: "property_transactions", comparableType: "sold", sourceId: `s${i}`, distanceMeters: 250, similarityScore: 88, rooms: 4, sqm: 100, floor: 3, propertyType: "דירה", buildingYear: 2010 }));
  const weakSet = [1, 2].map((i) => cand({ source: "market_property_sources", sourceTable: "market_property_sources", sourceId: `w${i}`, distanceMeters: 3800, similarityScore: 40 }));
  const qStrong = computeQuality(strongSet); const qWeak = computeQuality(weakSet);
  add("quality strong > weak", qStrong.score > qWeak.score, `${qStrong.score}/${qWeak.score}`);
  add("weak flagged honestly", qWeak.weak && qWeak.label === "ההשוואות חלשות יחסית", `${qWeak.label}`);
  add("strong not weak", qStrong.band !== "weak" && !qStrong.weak, `${qStrong.band}`);
  add("empty quality = weak", computeQuality([]).weak, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
