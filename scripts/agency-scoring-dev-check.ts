/**
 * LOCAL-DEV-ONLY check for the Agency Scoring Engine (Phase 26.5). Pure layers
 * only (no DB, no network). Verifies: null handling (no fake 0) · weight
 * redistribution · market-strength / growth / coverage / overall scores · data
 * confidence · competition-threat · comparison · determinism (idempotent calc).
 *
 * Run: npx tsx scripts/agency-scoring-dev-check.ts
 */
import { computeAgencyScores, threatAgainstUserArea } from "../src/lib/agencies/scoring/agencyScoreCalculator";
import { weightedOverall, dataConfidence } from "../src/lib/agencies/scoring/agencyScoreBreakdown";
import type { AgencyScoreInput, AgencyScoreKey } from "../src/lib/agencies/scoring/agencyScoringTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function input(over: Partial<AgencyScoreInput> = {}): AgencyScoreInput {
  return {
    avgDominance: 60, avgMomentum: 55, cities: 2, neighborhoods: 3, streets: 5,
    activeListings: 10, soldCount: 4, dealsCount: 3, luxuryShare: 0.2, propertyTypeDiversity: 3,
    exclusiveCount: 2, territoryStatsCount: 6, agentCount: 5, branchCount: 2, projectCount: 1,
    developerCount: 1, recentSignalCount: 3, growthEventCount: 2,
    hasWebsite: true, socialLinkCount: 2, hasGooglePlace: true, digitalFieldsTracked: true,
    hasReputationData: false, rating: null, reviewCount: 0, dataAgeDays: 10,
    ...over,
  };
}

function main(): void {
  console.log("Agency Scoring Engine dev-check\n");

  // 1) Full data → all scores present + overall.
  console.log("Full scoring:");
  const full = computeAgencyScores(input());
  assert(full.marketStrength != null && full.marketStrength > 0, "market strength computed");
  assert(full.growth != null && full.coverage != null && full.inventory != null, "growth/coverage/inventory computed");
  assert(full.overall != null && full.overall > 0 && full.overall <= 100, "overall in range");
  assert(full.reputation === null, "reputation null (no real review data)");

  // 2) Null handling — missing data is null, NOT 0.
  console.log("\nNull handling (no fake 0):");
  const sparse = computeAgencyScores(input({
    avgDominance: null, avgMomentum: null, activeListings: 0, soldCount: 0, dealsCount: 0,
    luxuryShare: null, cities: 0, neighborhoods: 0, streets: 0, territoryStatsCount: 0,
    projectCount: 0, developerCount: 0, exclusiveCount: 0, recentSignalCount: 0, growthEventCount: 0,
    digitalFieldsTracked: false, hasWebsite: false, socialLinkCount: 0, hasGooglePlace: false,
  }));
  assert(sparse.marketStrength === null, "no market evidence → null (not 0)");
  assert(sparse.digital === null, "no digital fields → null");
  assert(sparse.luxury === null, "no luxury data → null");
  assert(sparse.projects === null, "no project graph → null");
  assert(sparse.coverage === null, "no territory → coverage null");
  assert(sparse.overall === null, "no components → overall null (not 0)");

  // 3) Weight redistribution — null components don't drag the score.
  console.log("\nWeight redistribution:");
  const comps: Record<AgencyScoreKey, number | null> = {
    marketStrength: 80, growth: null, digital: null, luxury: null, inventory: null,
    coverage: null, projects: null, reputation: null, momentum: null, competitionThreat: null,
  };
  const one = weightedOverall(comps);
  assert(one.overall === 80, "single available component → its own value (weight redistributed to 100%)");
  assert(one.missing.length === 9, "9 components flagged missing");
  const two = weightedOverall({ ...comps, growth: 40 });
  // market_strength 0.25 + growth 0.15 → renormalized 0.625/0.375 → 80*.625 + 40*.375 = 65.
  assert(two.overall === 65, "two components renormalize correctly (→ 65)");

  // 4) Digital score formula.
  console.log("\nDigital score:");
  const d = computeAgencyScores(input({ hasWebsite: true, socialLinkCount: 4, hasGooglePlace: true }));
  assert(d.digital === 100, "website + 4 socials + google → 100");
  const d2 = computeAgencyScores(input({ hasWebsite: true, socialLinkCount: 0, hasGooglePlace: false }));
  assert(d2.digital === 40, "website only → 40");

  // 5) Competition threat.
  console.log("\nCompetition threat:");
  assert((full.competitionThreat ?? 0) > 0, "threat computed from dominance + momentum");
  assert(computeAgencyScores(input({ avgDominance: null, avgMomentum: null })).competitionThreat === null, "no dominance/momentum → threat null");
  assert((threatAgainstUserArea(80, 1) ?? 0) > (threatAgainstUserArea(80, 0) ?? 0), "area overlap amplifies threat");
  assert(threatAgainstUserArea(null, 1) === null, "null base threat → null");

  // 6) Data confidence reflects evidence, not score height.
  console.log("\nData confidence:");
  const richConf = dataConfidence(input());
  const poorConf = dataConfidence(input({ activeListings: 0, soldCount: 0, dealsCount: 0, territoryStatsCount: 0, agentCount: 0, cities: 0, neighborhoods: 0, digitalFieldsTracked: false, dataAgeDays: null }));
  assert(richConf > 60 && poorConf < 20, "rich evidence → high confidence, sparse → low");
  assert(full.dataConfidence === richConf, "result carries the computed data confidence");

  // 7) Determinism / idempotency.
  console.log("\nDeterminism:");
  assert(JSON.stringify(computeAgencyScores(input())) === JSON.stringify(computeAgencyScores(input())), "identical input → identical scores (idempotent)");

  console.log(`\n${failures === 0 ? "✅ ALL AGENCY SCORING CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
