// ============================================================================
// 🧠 Organizational Memory — Executive Memory (pure). 27.8. Part 8.
// Top successes, top failures, biggest improvements, recurring problems and
// lessons learned — distilled from real patterns/learnings for the CEO surface.
// ============================================================================
import type { Pattern, Learning, ExecutiveMemory } from "./types";

export function buildExecutiveMemory(successPatterns: Pattern[], failurePatterns: Pattern[], learnings: Learning[]): ExecutiveMemory {
  const successLearnings = learnings.filter((l) => l.kind === "success");
  const failureLearnings = learnings.filter((l) => l.kind === "failure");

  const biggestImprovements = [...successPatterns]
    .sort((a, b) => b.occurrences - a.occurrences).slice(0, 5)
    .map((p) => ({ key: p.key, note: p.title, occurrences: p.occurrences }));

  const recurringProblems = [...failurePatterns]
    .sort((a, b) => b.occurrences - a.occurrences).slice(0, 5)
    .map((p) => ({ key: p.key, note: p.title, occurrences: p.occurrences }));

  const lessonsLearned = [...learnings]
    .sort((a, b) => b.confidence - a.confidence).slice(0, 8)
    .map((l) => l.recommendation);

  return {
    topSuccesses: successLearnings.slice(0, 5),
    topFailures: failureLearnings.slice(0, 5),
    biggestImprovements, recurringProblems, lessonsLearned,
  };
}
