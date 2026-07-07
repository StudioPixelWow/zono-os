// ============================================================================
// 🧬 ZONO — Self-Learning AI — offline self-check (pure). PHASE 54.0.
// Spec QA: repeated success, repeated failure, mixed outcomes, no data, false-
// pattern prevention, stale learning, cross-module learning. Runs with tsx.
// ============================================================================
import { learnPatterns } from "./learn";
import type { LearningSignal, LearningDimension } from "./types";

const NOW = Date.parse("2026-07-06T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

function sigs(dim: LearningDimension, value: string, successes: number, failures: number, lastDays = 2): LearningSignal[] {
  const out: LearningSignal[] = [];
  for (let i = 0; i < successes; i++) out.push({ dimension: dim, value, label: value, outcome: "success", at: daysAgo(lastDays + i) });
  for (let i = 0; i < failures; i++) out.push({ dimension: dim, value, label: value, outcome: "failure", at: daysAgo(lastDays + successes + i) });
  return out;
}

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });
  const find = (r: ReturnType<typeof learnPatterns>, dim: string, value: string) =>
    r.dimensions.find((d) => d.dimension === dim)?.patterns.find((p) => p.value === value);

  // 1. Repeated success → learned + boost.
  const r1 = learnPatterns(sigs("group", "g1", 8, 1), {}, NOW);
  const p1 = find(r1, "group", "g1")!;
  add("repeated success → learned + boost", p1.status === "learned" && p1.direction === "boost" && p1.confidence >= 60);

  // 2. Repeated failure → learned + caution.
  const r2 = learnPatterns(sigs("copy_angle", "urgency", 1, 8), {}, NOW);
  const p2 = find(r2, "copy_angle", "urgency")!;
  add("repeated failure → learned + caution", p2.status === "learned" && p2.direction === "caution");

  // 3. Mixed outcomes → inconclusive (not learned).
  const r3 = learnPatterns(sigs("hour", "20:00", 5, 5), {}, NOW);
  const p3 = find(r3, "hour", "20:00")!;
  add("mixed → inconclusive, not learned", p3.status === "inconclusive" && p3.direction === "none");

  // 4. No data → no learning, honest note.
  const r4 = learnPatterns([], {}, NOW);
  add("no data → empty + note", !r4.hasData && r4.totals.learned === 0 && r4.notes.some((n) => n.includes("אין")));

  // 5. False-pattern prevention → tiny sample even at 100% success is NOT learned.
  const r5 = learnPatterns(sigs("street", "הרצל", 2, 0), {}, NOW);
  const p5 = find(r5, "street", "הרצל")!;
  add("false pattern: 2/2 success → insufficient, not learned", p5.status === "insufficient" && p5.successRate === 100);

  // 6. Stale learning → old strong signal flagged stale + decayed confidence.
  const r6 = learnPatterns(sigs("group", "gOld", 8, 1, 200), {}, NOW);
  const p6 = find(r6, "group", "gOld")!;
  add("stale: old evidence → stale status + lower confidence", p6.status === "stale" && p6.stale && p6.confidence < p1.confidence);

  // 7. Cross-module learning → multiple dimensions learned in one report.
  const r7 = learnPatterns([
    ...sigs("group", "g1", 8, 1), ...sigs("copy_angle", "lifestyle", 7, 1), ...sigs("hour", "13:00", 6, 1),
  ], {}, NOW);
  add("cross-module: 3 dimensions produce learned patterns", r7.dimensions.filter((d) => d.learnedCount > 0).length === 3 && r7.recommendations.length >= 3);

  // 8. Recommendations are advisory + carry confidence + evidence.
  add("recs: advisory with confidence + evidence", r7.recommendations.every((rec) => rec.confidence > 0 && rec.evidence.length > 0));

  // 9. Emerging: decisive but not-yet-confident sample sits between insufficient and learned.
  const r9 = learnPatterns(sigs("broker", "dana", 4, 0), {}, NOW);
  const p9 = find(r9, "broker", "dana")!;
  add("emerging: 4/0 decisive → emerging (not yet learned)", p9.status === "emerging" && p9.direction === "boost");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
