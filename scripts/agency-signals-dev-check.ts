/**
 * LOCAL-DEV-ONLY check for Agency Signals + Timeline Intelligence (Phase 26.6).
 * Pure layers only (no DB, no network). Verifies: signal creation from real
 * change · dedupe key generation · duplicate prevention · severity + importance
 * calculation · score-spike / dominance-gained / inventory-growth detection ·
 * timeline-worthy gating · determinism (idempotent detection).
 *
 * Run: npx tsx scripts/agency-signals-dev-check.ts
 */
import { detectAgencySignals } from "../src/lib/agencies/intelligence/agencySignalDetector";
import { dedupeKey, metricKey, materiallyChanged, dedupeDetectedBatch } from "../src/lib/agencies/intelligence/agencySignalDedupe";
import { severityFor, importanceFor } from "../src/lib/agencies/intelligence/agencySignalTypes";
import { classifyScoreChange, classifyCountChange } from "../src/lib/agencies/intelligence/agencyChangeDetector";
import type { AgencySnapshot, TerritorySnapshot } from "../src/lib/agencies/intelligence/agencySignalTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function terr(over: Partial<TerritorySnapshot>): TerritorySnapshot {
  return {
    territoryType: over.territoryType ?? "city", city: over.city ?? "תל אביב", neighborhood: over.neighborhood ?? null,
    street: over.street ?? null, territoryKey: over.territoryKey ?? "city::תל אביב",
    dominance: over.dominance ?? null, momentum: over.momentum ?? null, activeListings: over.activeListings ?? 0,
    opportunityTypes: over.opportunityTypes ?? [],
  };
}
function snap(over: Partial<AgencySnapshot> = {}): AgencySnapshot {
  return {
    agencyId: "ag1", overall: 60, growth: 50, momentum: 55, competitionThreat: 50, dataConfidence: 70,
    agentCount: 5, projectCount: 1, developerCount: 1, territories: [], ...over,
  };
}

function main(): void {
  console.log("Agency Signals + Timeline Intelligence dev-check\n");

  // 1) Change classification primitives.
  console.log("Change detection:");
  assert(classifyScoreChange(50, 70, { deltaThreshold: 15 }).direction === "up", "score +20 → up");
  assert(classifyScoreChange(50, 55, { deltaThreshold: 15 }).direction === "none", "score +5 below threshold → none");
  assert(classifyScoreChange(null, 80, { newSignificantAt: 60 }).direction === "new", "first-seen high score → new");
  assert(classifyCountChange(4, 12, { deltaThreshold: 3, pctThreshold: 0.3 }).direction === "up", "listings 4→12 → up");
  assert(classifyCountChange(10, 11, { deltaThreshold: 3, pctThreshold: 0.3 }).direction === "none", "listings 10→11 → none");

  // 2) Dedupe key generation + duplicate prevention.
  console.log("\nDedupe:");
  assert(dedupeKey("ag1", "agency_score_spike") === "ag1::agency_score_spike::agency", "agency-level dedupe key");
  assert(dedupeKey("ag1", "agency_dominance_gained", "city::tlv") === "ag1::agency_dominance_gained::city::tlv", "territory dedupe key");
  assert(metricKey("ag1", "dom", "city::tlv") === "ag1|dom|city::tlv", "metric key format");
  const batch = dedupeDetectedBatch([
    { dedupeKey: "k1", importance: 50 } as never, { dedupeKey: "k1", importance: 80 } as never, { dedupeKey: "k2", importance: 30 } as never,
  ]);
  assert(batch.length === 2, "batch dedupe collapses same key");
  assert((batch.find((b) => b.dedupeKey === "k1")!.importance) === 80, "dedupe keeps higher importance");
  assert(materiallyChanged({ scoreAfter: 60, severity: "medium", importance: 50 }, { scoreAfter: 75, severity: "high", importance: 70 } as never), "big move → material change");
  assert(!materiallyChanged({ scoreAfter: 60, severity: "medium", importance: 50 }, { scoreAfter: 61, severity: "medium", importance: 52 } as never), "tiny move → not material");

  // 3) Severity + importance.
  console.log("\nSeverity / importance:");
  assert(severityFor("high_competition_threat", 0.5, { userOverlap: true }) === "critical", "threat + user overlap → critical");
  assert(severityFor("agency_inventory_growth", 0.1) === "low", "small inventory growth → low");
  assert(importanceFor({ type: "agency_dominance_gained", magnitude: 0.8, territoryType: "city", userOverlap: true }) > importanceFor({ type: "agency_dominance_gained", magnitude: 0.2, territoryType: "street" }), "city + overlap + big move → higher importance");
  assert(importanceFor({ type: "weak_data_confidence", magnitude: 0.4, confidence: 0.2, isRisk: false }) < 60, "low-confidence non-risk → dampened importance");

  // 4) Detection — score spike.
  console.log("\nScore spike detection:");
  const prevA = { [metricKey("ag1", "overall")]: 55 };
  const spikes = detectAgencySignals({ snapshot: snap({ overall: 78 }), prevMetrics: prevA });
  assert(spikes.some((s) => s.signalType === "agency_score_spike" && s.scoreBefore === 55 && s.scoreAfter === 78), "overall 55→78 → score spike with before/after");

  // 5) Dominance gained (territory, first-seen high).
  console.log("\nDominance detection:");
  const dom = detectAgencySignals({ snapshot: snap({ territories: [terr({ dominance: 72, activeListings: 6, territoryKey: "city::tlv" })] }), prevMetrics: {} });
  assert(dom.some((s) => s.signalType === "agency_dominance_gained" && s.territoryType === "city"), "first-seen dominance 72 → dominance gained");
  assert(dom.some((s) => s.signalType === "agency_entered_new_area"), "new territory with listings → entered new area");

  // 6) Inventory growth + activity spike.
  console.log("\nInventory / activity:");
  const prevB = { [metricKey("ag1", "inv", "city::tlv")]: 4, [metricKey("ag1", "activity")]: 4 };
  const inv = detectAgencySignals({ snapshot: snap({ territories: [terr({ dominance: 50, activeListings: 14, territoryKey: "city::tlv" })] }), prevMetrics: prevB });
  assert(inv.some((s) => s.signalType === "agency_inventory_growth"), "listings 4→14 → inventory growth");
  assert(inv.some((s) => s.signalType === "agency_activity_spike"), "total activity jump → activity spike");

  // 7) Agent network + project/developer connections.
  console.log("\nGraph signals:");
  const prevC = { [metricKey("ag1", "agents")]: 3, [metricKey("ag1", "projects")]: 0, [metricKey("ag1", "developers")]: 0 };
  const graph = detectAgencySignals({ snapshot: snap({ agentCount: 7, projectCount: 2, developerCount: 1 }), prevMetrics: prevC });
  assert(graph.some((s) => s.signalType === "agent_network_expanded"), "agents 3→7 → network expanded");
  assert(graph.some((s) => s.signalType === "project_connection_detected"), "projects 0→2 → project connection");
  assert(graph.some((s) => s.signalType === "developer_connection_detected"), "developers 0→1 → developer connection");

  // 8) High competition threat + opportunities.
  console.log("\nThreat + opportunities:");
  const threat = detectAgencySignals({ snapshot: snap({ competitionThreat: 82, territories: [terr({ opportunityTypes: ["territory_opportunity", "low_competition_area"], territoryKey: "city::tlv" })] }), prevMetrics: {} });
  assert(threat.some((s) => s.signalType === "high_competition_threat" && (s.severity === "high" || s.severity === "critical")), "threat 82 → high_competition_threat");
  assert(threat.some((s) => s.signalType === "territory_opportunity") && threat.some((s) => s.signalType === "low_competition_area"), "opportunity types surfaced as signals");

  // 9) No fake signals when nothing changed.
  console.log("\nNo-change → no signals:");
  const steady = {
    [metricKey("ag1", "overall")]: 60, [metricKey("ag1", "momentum")]: 55, [metricKey("ag1", "activity")]: 0,
    [metricKey("ag1", "agents")]: 5, [metricKey("ag1", "projects")]: 1, [metricKey("ag1", "developers")]: 1,
  };
  const none = detectAgencySignals({ snapshot: snap({ competitionThreat: 40 }), prevMetrics: steady });
  assert(none.length === 0, "stable metrics → zero signals (no spam)");

  // 10) Determinism.
  console.log("\nDeterminism:");
  const i1 = JSON.stringify(detectAgencySignals({ snapshot: snap({ overall: 78 }), prevMetrics: prevA }));
  const i2 = JSON.stringify(detectAgencySignals({ snapshot: snap({ overall: 78 }), prevMetrics: prevA }));
  assert(i1 === i2, "identical input → identical signals (idempotent)");

  console.log(`\n${failures === 0 ? "✅ ALL AGENCY SIGNALS CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
