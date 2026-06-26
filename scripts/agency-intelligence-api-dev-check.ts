/**
 * LOCAL-DEV-ONLY check for the Agency Intelligence API Layer (Phase 26.13). Pure
 * layers only (permissions decision, filters, mappers — no DB). Verifies:
 * organization isolation · filter/sort/paging · DTO mapping · missing-data
 * handling + source traceability · null-vs-real-zero · no fabricated numbers.
 *
 * Run: npx tsx scripts/agency-intelligence-api-dev-check.ts
 */
import { resolveOrgAccess } from "../src/lib/agencies/api/agencyIntelligenceApiMappers";
import { applyAgencyFilters, applySignalFilters, normalizeFilters, MAX_LIMIT } from "../src/lib/agencies/api/agencyIntelligenceApiFilters";
import {
  toCardDTO, toCompetitiveDTO, toTerritoryRowDTO, toSignalDTO, toReportDTO,
  threatBand, competitionLevel, buildSourceSummary, latestDate, type ScoreInput,
} from "../src/lib/agencies/api/agencyIntelligenceApiMappers";
import type { AgencyIntelligenceCardDTO, AgencySignalDTO } from "../src/lib/agencies/api/agencyIntelligenceApiTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

const score = (p: Partial<ScoreInput>): ScoreInput => ({
  overall: null, competitionThreat: null, momentum: null, growth: null, marketStrength: null, coverage: null,
  inventory: null, luxury: null, digital: null, reputation: null, projects: null, dataConfidence: null, ...p,
});

function main(): void {
  console.log("Agency Intelligence API dev-check\n");

  // 1) Organization isolation / permission safety.
  console.log("Organization isolation:");
  assert(resolveOrgAccess("org-1", "org-1").allowed === true, "same org → allowed");
  assert(resolveOrgAccess("org-1", "org-2").allowed === false, "different org → DENIED (no cross-org data)");
  assert(resolveOrgAccess(null, "org-1").allowed === false, "no session → denied");
  assert(resolveOrgAccess("org-1", "").allowed === false, "empty requested org → denied");
  assert(resolveOrgAccess("org-1", "org-2").orgId === "org-1", "denied result still exposes only the caller's own org id");

  // 2) Filters: sort / thresholds / paging.
  console.log("\nFilters:");
  const cards: AgencyIntelligenceCardDTO[] = [
    card("a", { threat: 40, overall: 90, momentum: 30, dataConfidence: 80, city: "חיפה" }),
    card("b", { threat: 80, overall: 50, momentum: 70, dataConfidence: 20, city: "תל אביב" }),
    card("c", { threat: null, overall: 70, momentum: null, dataConfidence: 55, city: "חיפה" }),
  ];
  assert(applyAgencyFilters(cards, { sortBy: "threat" })[0].agencyId === "b", "sort by threat → highest first");
  assert(applyAgencyFilters(cards, { sortBy: "overall" })[0].agencyId === "a", "sort by overall → highest first");
  assert(applyAgencyFilters(cards, { threatMin: 70 }).length === 1, "threatMin threshold filters");
  assert(applyAgencyFilters(cards, { city: "חיפה" }).length === 2, "city filter");
  assert(applyAgencyFilters(cards, { confidenceMin: 50 }).length === 2, "confidenceMin threshold");
  assert(applyAgencyFilters(cards, { limit: 1 }).length === 1 && applyAgencyFilters(cards, { offset: 2, limit: 5 }).length === 1, "limit + offset paging");
  assert(normalizeFilters({ limit: 9999 }).limit === MAX_LIMIT, "limit is clamped to MAX_LIMIT");
  const sigs: AgencySignalDTO[] = [sig("1", "price_drop", "high"), sig("2", "new_listing", "low"), sig("3", "price_drop", "critical")];
  assert(applySignalFilters(sigs, { signalType: "price_drop" }).length === 2, "signal type filter");
  assert(applySignalFilters(sigs, { severity: "critical" }).length === 1, "signal severity filter");

  // 3) DTO mapping + source traceability.
  console.log("\nDTO mapping + source traceability:");
  const comp = toCompetitiveDTO("a", "אנגלו", score({ overall: 80, competitionThreat: 60, momentum: 50, dataConfidence: 75, periodEnd: "2026-06-01", calculatedAt: "2026-06-26" }));
  assert(comp.scores.overall === 80 && comp.scores.threat === 60, "competitive DTO maps scores");
  assert(comp.sourceSummary.categories.includes("agency_scores") && comp.sourceSummary.lastCalculated === "2026-06-26", "source_summary: categories + lastCalculated");
  assert(comp.sourceSummary.confidence === 75, "source_summary carries data confidence");
  const terr = toTerritoryRowDTO({ territoryType: "neighborhood", city: "חיפה", neighborhood: "אפקה", street: null, dominanceScore: 82, inventoryShare: 0.4, momentumScore: 55, trend: "growing", confidence: 0.6 });
  assert(terr.label === "אפקה" && terr.dominance === 82, "territory row DTO maps label + dominance");
  const sigDto = toSignalDTO({ id: "s1", signalType: "price_drop", severity: "high", title: "ירידת מחיר", description: null, city: "חיפה", importance: 70, confidence: 0.8, detectedAt: "2026-06-26" });
  assert(sigDto.territoryLabel === "חיפה" && sigDto.confidence === 0.8, "signal DTO derives territory label");
  assert(toReportDTO(null) === null, "report DTO: null in → null out (no fabrication)");

  // 4) Missing data + null-vs-zero.
  console.log("\nMissing data + null-vs-zero:");
  const cardNoData = toCardDTO({ agencyId: "x", name: "X", displayName: null, city: null, score: null, topSignalTitle: null, summarySnippet: null });
  assert(cardNoData.overall === null && cardNoData.threat === null, "no score → null metrics (never fake 0)");
  assert(cardNoData.sourceSummary.missingData.length > 0, "missing data is disclosed in source_summary");
  const cardRealZero = toCardDTO({ agencyId: "y", name: "Y", displayName: null, city: null, score: score({ overall: 0, competitionThreat: 0, momentum: 0, dataConfidence: 0 }), topSignalTitle: null, summarySnippet: null });
  assert(cardRealZero.overall === 0 && cardRealZero.threat === 0, "a REAL 0 score is preserved as 0");

  // 5) Derived bands / levels.
  console.log("\nDerived bands:");
  assert(threatBand(85) === "critical" && threatBand(65) === "high" && threatBand(45) === "moderate" && threatBand(10) === "low" && threatBand(null) === null, "threat band thresholds + null");
  assert(competitionLevel(0) === "none" && competitionLevel(1) === "low" && competitionLevel(3) === "moderate" && competitionLevel(6) === "high", "competition level from agency count");
  assert(latestDate("2026-01-01", null, "2026-06-26", undefined) === "2026-06-26", "latestDate picks the newest non-null");
  assert(buildSourceSummary([], null, null, []).confidence === null, "empty source summary → null confidence (no fabrication)");

  console.log(`\n${failures === 0 ? "✅ ALL AGENCY INTELLIGENCE API CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

function card(id: string, p: Partial<AgencyIntelligenceCardDTO>): AgencyIntelligenceCardDTO {
  return {
    agencyId: id, name: id.toUpperCase(), displayName: null, city: p.city ?? null,
    overall: p.overall ?? null, threat: p.threat ?? null, momentum: p.momentum ?? null, growth: p.growth ?? null,
    dataConfidence: p.dataConfidence ?? null, topSignalTitle: null, summarySnippet: null,
    sourceSummary: buildSourceSummary(["agency_scores"], null, p.dataConfidence ?? null, []),
  };
}
function sig(id: string, type: string, sev: string): AgencySignalDTO {
  return { id, signalType: type, severity: sev, title: "t", description: null, territoryLabel: null, importance: null, confidence: null, detectedAt: "2026-06-26" };
}

main();
