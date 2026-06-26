/**
 * LOCAL-DEV-ONLY check for AI SWOT + Executive Agency Summary (Phase 26.7).
 * Pure layers only (no DB). Verifies: SWOT generation gated on real data ·
 * missing-data handling · recommendation generation + priority · executive
 * summary structure (Hebrew) · low-confidence wording · no invented facts ·
 * determinism (idempotent generation).
 *
 * Run: npx tsx scripts/agency-reports-dev-check.ts
 */
import { generateAgencySwot } from "../src/lib/agencies/reports/agencySwotGenerator";
import { generateAgencyExecutiveSummary } from "../src/lib/agencies/reports/agencyExecutiveSummaryGenerator";
import { generateAgencyRecommendations } from "../src/lib/agencies/reports/agencyRecommendationEngine";
import { confidenceWord } from "../src/lib/agencies/reports/agencyReportTypes";
import type { AgencyReportSnapshot, SnapshotSignal } from "../src/lib/agencies/reports/agencyReportTypes";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function sig(over: Partial<SnapshotSignal>): SnapshotSignal {
  return { id: over.id ?? "s1", signalType: over.signalType ?? "territory_opportunity", severity: over.severity ?? "info", importance: over.importance ?? 60, title: over.title ?? "כותרת", territoryLabel: over.territoryLabel ?? "קריית ביאליק" };
}

function snap(over: Partial<AgencyReportSnapshot> = {}): AgencyReportSnapshot {
  return {
    agencyId: "ag1", agencyName: "משרד הדגמה", periodStart: "2026-03-28T00:00:00.000Z", periodEnd: "2026-06-26T00:00:00.000Z",
    scores: { overall: 64, marketStrength: 70, growth: 68, digital: 55, luxury: 30, inventory: 72, coverage: 66, projects: 40, reputation: null, momentum: 70, competitionThreat: 50, dataConfidence: 72 },
    territory: { cities: ["קריית ביאליק", "קריות"], neighborhoods: ["מרכז"], streets: [], topDominant: [{ label: "קריית ביאליק", dominance: 72 }], avgDominance: 68, avgMomentum: 70, activeListings: 14, soldCount: 4, dealsCount: 3, luxuryShare: 0.22 },
    graph: { agentCount: 6, branchCount: 2, projectCount: 1, developerCount: 1, propertyCount: 14 },
    signals: [sig({ signalType: "territory_opportunity", title: "הזדמנות באזור — קריית מוצקין", territoryLabel: "קריית מוצקין" })],
    recentEvents: [], hasDigital: true, hasReputation: false, missing: [],
    ...over,
  };
}

function main(): void {
  console.log("AI SWOT + Executive Agency Summary dev-check\n");

  // 1) SWOT from real data.
  console.log("SWOT:");
  const swot = generateAgencySwot(snap());
  assert(swot.strengths.some((x) => x.key === "dominance"), "high dominance → strength");
  assert(swot.strengths.some((x) => x.key === "inventory"), "strong inventory → strength");
  assert(swot.strengths.some((x) => x.key === "luxury"), "luxury share → strength");
  assert(swot.opportunities.some((x) => x.label.includes("הזדמנות")), "opportunity signal → SWOT opportunity");
  assert(swot.strengths.every((x) => !!x.evidence), "every strength cites real evidence (no invented facts)");

  // 2) Missing data handling — sparse agency.
  console.log("\nMissing data:");
  const sparse = generateAgencySwot(snap({
    scores: { overall: null, marketStrength: null, growth: null, digital: null, luxury: null, inventory: null, coverage: null, projects: null, reputation: null, momentum: null, competitionThreat: null, dataConfidence: 20 },
    territory: { cities: [], neighborhoods: [], streets: [], topDominant: [], avgDominance: null, avgMomentum: null, activeListings: 0, soldCount: 0, dealsCount: 0, luxuryShare: null },
    graph: { agentCount: 0, branchCount: 0, projectCount: 0, developerCount: 0, propertyCount: 0 },
    signals: [], hasDigital: false, missing: ["נתוני עסקאות מאומתים", "נתוני נוכחות דיגיטלית"],
  }));
  assert(sparse.strengths.length === 0, "no data → no fabricated strengths");
  assert(sparse.weaknesses.some((x) => x.key === "low_confidence"), "low confidence → weakness");
  assert(sparse.weaknesses.some((x) => x.key === "weak_digital"), "no digital → weakness");

  // 3) Executive summary structure (Hebrew) + confidence/missing disclosure.
  console.log("\nExecutive summary:");
  const sum = generateAgencyExecutiveSummary(snap());
  assert(sum.includes("קריית ביאליק") && sum.includes("נכסים פעילים"), "summary grounded in real activity + areas");
  assert(sum.includes("מומנטום"), "mentions momentum (measured)");
  const lowSum = generateAgencyExecutiveSummary(snap({ scores: { ...snap().scores, dataConfidence: 25 }, missing: ["נתוני עסקאות מאומתים"] }));
  assert(lowSum.includes("רמת הביטחון בדאטה נמוכה") && lowSum.includes("חסרים"), "low confidence + missing data disclosed");
  assert(!/סוד|חשאי|מודיעין/.test(sum), "no 'secret intelligence' wording");

  // 4) Recommendations + priority.
  console.log("\nRecommendations:");
  const recs = generateAgencyRecommendations(snap({
    signals: [
      sig({ id: "x1", signalType: "user_weak_area", title: "אזור חולשה", territoryLabel: "קריית ים" }),
      sig({ id: "x2", signalType: "high_competition_threat", title: "איום תחרותי", territoryLabel: "קריית מוצקין" }),
      sig({ id: "x3", signalType: "low_competition_area", title: "תחרות נמוכה", territoryLabel: "קריית חיים" }),
    ],
  }));
  assert(recs.length >= 3, "recommendations generated from signals");
  assert(recs.every((r) => "title" in r && "reason" in r && "priority" in r && "confidence" in r), "each rec has title/reason/priority/confidence");
  assert(recs[0].priority === "high", "high-priority recommendation surfaces first");
  assert(recs.some((r) => r.relatedSignalId === "x1"), "recommendation links back to source signal");
  const lowConfRecs = generateAgencyRecommendations(snap({ scores: { ...snap().scores, dataConfidence: 20 } }));
  assert(lowConfRecs.some((r) => r.title.includes("סקירה ידנית")), "low confidence → manual-review recommendation");

  // 5) Confidence word.
  console.log("\nConfidence word:");
  assert(confidenceWord(80) === "גבוהה" && confidenceWord(45) === "בינונית" && confidenceWord(20) === "נמוכה" && confidenceWord(null) === "נמוכה", "confidence wording bands");

  // 6) Determinism.
  console.log("\nDeterminism:");
  assert(JSON.stringify(generateAgencySwot(snap())) === JSON.stringify(generateAgencySwot(snap())), "identical snapshot → identical SWOT");
  assert(generateAgencyExecutiveSummary(snap()) === generateAgencyExecutiveSummary(snap()), "identical snapshot → identical summary");

  console.log(`\n${failures === 0 ? "✅ ALL AGENCY REPORT CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
