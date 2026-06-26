/**
 * LOCAL-DEV-ONLY check for Competition Radar UI logic (Phase 26.8). Pure helpers
 * only (no DB, no React). Verifies: sort by threat/overall/momentum/confidence ·
 * city + severity filters · confidence badge states · severity tones · empty-state
 * selection · never-fabricate-zero formatting · determinism.
 *
 * Run: npx tsx scripts/competition-radar-dev-check.ts
 */
import {
  sortAgencies, filterAgenciesByCity, radarCities, filterSignalsBySeverity,
  confidenceBadge, severityTone, fmtScore, fmtShare, pickEmptyState, RADAR_EMPTY_TEXT,
} from "../src/lib/agencies/ui/competitionRadarFormat";
import type { RadarAgencySummary, RadarSignalRow, RadarOverview } from "../src/lib/agencies/ui/competitionRadarFormat";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function ag(p: Partial<RadarAgencySummary>): RadarAgencySummary {
  return { id: p.id ?? "a", name: p.name ?? "משרד", city: p.city ?? "חיפה", overall: p.overall ?? null, threat: p.threat ?? null, momentum: p.momentum ?? null, dataConfidence: p.dataConfidence ?? null, topSignalTitle: null, summarySnippet: null };
}
function sig(p: Partial<RadarSignalRow>): RadarSignalRow {
  return { id: p.id ?? "s", signalType: p.signalType ?? "x", severity: p.severity ?? "low", title: "t", description: null, territoryLabel: null, importance: null, confidence: null, detectedAt: "2026-06-26" };
}

function main(): void {
  console.log("Competition Radar UI dev-check\n");

  const list = [
    ag({ id: "1", name: "א", threat: 40, overall: 60, momentum: 30, dataConfidence: 80, city: "חיפה" }),
    ag({ id: "2", name: "ב", threat: 80, overall: 50, momentum: 70, dataConfidence: 20, city: "תל אביב" }),
    ag({ id: "3", name: "ג", threat: null, overall: 90, momentum: null, dataConfidence: 55, city: "חיפה" }),
  ];

  // 1) Sorting.
  console.log("Sorting:");
  assert(sortAgencies(list, "threat")[0].id === "2", "sort by threat → highest first");
  assert(sortAgencies(list, "overall")[0].id === "3", "sort by overall → highest first");
  assert(sortAgencies(list, "momentum")[0].id === "2", "sort by momentum → highest first");
  assert(sortAgencies(list, "confidence")[0].id === "1", "sort by confidence → highest first");
  assert(sortAgencies(list, "threat")[2].id === "3", "null threat sorts last");
  assert(list[0].id === "1", "sort is non-mutating (original order preserved)");

  // 2) Filters.
  console.log("\nFilters:");
  assert(filterAgenciesByCity(list, "חיפה").length === 2, "city filter narrows to matching city");
  assert(filterAgenciesByCity(list, null).length === 3, "null city → no filter");
  assert(radarCities(list).length === 2 && radarCities(list).includes("תל אביב"), "distinct cities for dropdown");
  const signals = [sig({ severity: "critical" }), sig({ severity: "low" }), sig({ severity: "high" })];
  assert(filterSignalsBySeverity(signals, "all").length === 3, "severity 'all' → no filter");
  assert(filterSignalsBySeverity(signals, "critical").length === 1, "severity filter narrows");

  // 3) Confidence + severity badges.
  console.log("\nBadges:");
  assert(confidenceBadge(80).tone === "success" && confidenceBadge(80).label.includes("גבוה"), "high confidence → success");
  assert(confidenceBadge(45).tone === "warning", "medium confidence → warning");
  assert(confidenceBadge(15).tone === "danger", "low confidence → danger");
  assert(confidenceBadge(null).tone === "neutral" && confidenceBadge(null).label === "ללא נתונים", "no confidence → neutral + honest label");
  assert(severityTone("critical") === "danger" && severityTone("medium") === "warning" && severityTone("low") === "neutral", "severity tones map correctly");

  // 4) Never-fabricate-zero formatting.
  console.log("\nFormatting (no fake 0):");
  assert(fmtScore(null) === "—" && fmtScore(63.4) === "63", "score: null → em-dash, number rounded");
  assert(fmtShare(null) === "—" && fmtShare(0.5) === "50%", "share: null → em-dash, number → %");
  assert(fmtScore(0) === "0", "a REAL 0 score is shown as 0 (only nulls become —)");

  // 5) Empty states.
  console.log("\nEmpty states:");
  const ov = (over: Partial<RadarOverview>): RadarOverview => ({ agencies: 0, agentsLinked: 0, territories: 0, activeSignals: 0, highThreat: 0, opportunities: 0, ...over });
  assert(pickEmptyState(ov({ agencies: 0 }), 0) === "no_agencies", "no agencies → no_agencies");
  assert(pickEmptyState(ov({ agencies: 5 }), 0) === "no_scores", "agencies but no scores → no_scores");
  assert(pickEmptyState(ov({ agencies: 5 }), 3) === "none", "agencies + scores → render radar");
  assert(RADAR_EMPTY_TEXT.no_agencies.includes("רדאר מתחרים") && RADAR_EMPTY_TEXT.no_signals.includes("אין אותות"), "empty texts match spec wording");
  assert(!RADAR_EMPTY_TEXT.no_agencies.includes("מודיעין סודי"), "no 'secret intelligence' wording");

  // 6) Determinism.
  console.log("\nDeterminism:");
  assert(JSON.stringify(sortAgencies(list, "threat")) === JSON.stringify(sortAgencies(list, "threat")), "identical input → identical sort");

  console.log(`\n${failures === 0 ? "✅ ALL COMPETITION RADAR CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
