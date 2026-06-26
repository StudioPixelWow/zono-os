/**
 * LOCAL-DEV-ONLY check for AI Resolution Center logic (Phase 26.12). Pure helpers
 * only (no DB, no React). Verifies: confidence badge states · queue filter +
 * search · low/high-confidence filters · learning aggregation (approved/rejected/
 * alias corrections) · AI accuracy · KPIs · determinism.
 *
 * Run: npx tsx scripts/resolution-center-dev-check.ts
 */
import {
  confidenceBadge, filterCandidates, queueCities, aggregateLearning, computeKpis,
  STATUS_LABEL, ACTION_LABEL,
} from "../src/lib/agencies/resolution-center/resolutionCenterFormat";
import type { ResolutionCandidate, FeedbackRecord } from "../src/lib/agencies/resolution-center/resolutionCenterFormat";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function cand(p: Partial<ResolutionCandidate>): ResolutionCandidate {
  return {
    id: p.id ?? "c", detectedName: p.detectedName ?? "REMAX KRAYOT", normalizedName: p.normalizedName ?? "remax krayot",
    suggestedAgencyId: p.suggestedAgencyId ?? null, suggestedAgencyName: p.suggestedAgencyName ?? null,
    confidence: p.confidence ?? null, source: p.source ?? null, detectionMethod: p.detectionMethod ?? null,
    status: p.status ?? "pending", city: p.city ?? null, createdAt: "2026-06-26",
  };
}
function fb(p: Partial<FeedbackRecord>): FeedbackRecord {
  return { id: p.id ?? "f", action: p.action ?? "approve", previousConfidence: p.previousConfidence ?? null,
    finalResult: p.finalResult ?? null, reason: p.reason ?? null, reviewedAt: "2026-06-26",
    detectedText: p.detectedText ?? null, agencyName: p.agencyName ?? null, alias: p.alias ?? null };
}

function main(): void {
  console.log("AI Resolution Center dev-check\n");

  console.log("Confidence badge:");
  assert(confidenceBadge(0.85).tone === "success" && confidenceBadge(0.85).pct === "85%", "high confidence → success");
  assert(confidenceBadge(0.5).tone === "warning", "medium → warning");
  assert(confidenceBadge(0.2).tone === "danger", "low → danger");
  assert(confidenceBadge(null).tone === "neutral" && confidenceBadge(null).pct === "—", "null → neutral, no fake number");

  console.log("\nQueue filter + search:");
  const list = [
    cand({ id: "1", status: "pending", confidence: 0.2, city: "חיפה", detectedName: "רימקס קריות", suggestedAgencyName: "רי/מקס" }),
    cand({ id: "2", status: "rejected", confidence: 0.9, city: "תל אביב", detectedName: "אנגלו" }),
    cand({ id: "3", status: "pending", confidence: 0.8, city: "חיפה", detectedName: "סנצ'ורי" }),
  ];
  assert(filterCandidates(list, { status: "pending" }).length === 2, "status filter");
  assert(filterCandidates(list, { status: "low_confidence" }).length === 1, "low-confidence filter (<0.4)");
  assert(filterCandidates(list, { status: "high_confidence" }).length === 2, "high-confidence filter (≥0.7)");
  assert(filterCandidates(list, { city: "חיפה" }).length === 2, "city filter");
  assert(filterCandidates(list, { query: "רימקס" }).length === 1, "free-text search");
  assert(filterCandidates(list, {}).length === 3, "no filter → all");
  assert(queueCities(list).length === 2, "distinct cities");

  console.log("\nLearning aggregation:");
  const feedback = [
    fb({ action: "approve", agencyName: "רי/מקס קריות", previousConfidence: 0.5, alias: "REMAX KRAYOT" }),
    fb({ action: "approve", agencyName: "רי/מקס קריות", previousConfidence: 0.6, alias: "remax krayot" }),
    fb({ action: "merge", agencyName: "אנגלו סכסון", previousConfidence: 0.55 }),
    fb({ action: "reject", detectedText: "ספאם משרד", previousConfidence: 0.1 }),
    fb({ action: "reject", detectedText: "ספאם משרד", previousConfidence: 0.15 }),
    fb({ action: "edit", agencyName: "סנצ'ורי 21" }),
    fb({ action: "ignore" }),
    fb({ action: "split" }),
  ];
  const ls = aggregateLearning(feedback);
  assert(ls.totalDecisions === 8 && ls.approvals === 2 && ls.merges === 1 && ls.rejections === 2 && ls.edits === 1 && ls.ignores === 1 && ls.splits === 1, "decision counts by action");
  assert(ls.topApprovedAgencies[0].name === "רי/מקס קריות" && ls.topApprovedAgencies[0].count === 2, "top approved agency");
  assert(ls.topRejectedNames[0].name === "ספאם משרד" && ls.topRejectedNames[0].count === 2, "top rejected name");
  assert(ls.topCorrectedAliases.length >= 1 && ls.topCorrectedAliases[0].agency === "רי/מקס קריות", "corrected aliases learned");
  // approvals(3: 2 approve + 1 merge) / (approvals+rejections 2) → 3/5 = 0.6
  assert(Math.abs((ls.aiAccuracy ?? 0) - 0.6) < 1e-9, "AI accuracy = approvals/(approvals+rejections)");
  assert(ls.improvementPct === 60, "improvement % derived from accuracy");
  assert(ls.avgConfidenceBefore !== null, "avg confidence before computed");

  console.log("\nKPIs:");
  const kpis = computeKpis(list, ls);
  assert(kpis.pending === 2 && kpis.approved === 2 && kpis.rejected === 2 && kpis.merged === 1, "KPIs from queue + learning");
  assert(kpis.avgConfidence !== null, "avg confidence KPI");

  console.log("\nLabels + determinism:");
  assert(STATUS_LABEL.pending === "ממתין" && ACTION_LABEL.merge === "מיזוג", "Hebrew labels present");
  assert(JSON.stringify(aggregateLearning(feedback)) === JSON.stringify(ls), "aggregation is deterministic");

  console.log(`\n${failures === 0 ? "✅ ALL RESOLUTION CENTER CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
