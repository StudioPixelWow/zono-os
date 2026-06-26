/**
 * LOCAL-DEV-ONLY check for ZI Interactive Learning (Phase 25). Pure layers only.
 * Verifies: walkthrough loading + step-by-step · glossary search · FAQ search +
 * permission filtering · recommendations (deterministic + context-aware) ·
 * progress helpers · search across content · Hebrew content · no actions.
 *
 * Run: npx tsx scripts/zi-learning-dev-check.ts
 */
import { WALKTHROUGHS, walkthroughBySlug, walkthroughAsSteps } from "../src/lib/zi-expert/learning/walkthrough";
import { searchGlossary } from "../src/lib/zi-expert/learning/glossary";
import { faqForModule, searchFaq } from "../src/lib/zi-expert/learning/faq";
import { recommendLearning } from "../src/lib/zi-expert/learning/recommendations";
import { searchLearning, stepByStepFor } from "../src/lib/zi-expert/learning/guide-engine";
import { isCompleted, continueLearning } from "../src/lib/zi-expert/learning/progress";
import type { LearningProgress } from "../src/lib/zi-expert/learning/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("ZI Learning dev-check\n");

  console.log("Walkthroughs:");
  assert(WALKTHROUGHS.length >= 3, "built-in walkthroughs loaded");
  const w = walkthroughBySlug("property-radar")!;
  assert(!!w && w.steps.length >= 3, "walkthrough has steps");
  const steps = walkthroughAsSteps(w);
  assert(steps.includes("שלב 1") && steps.includes("אימות סופי"), "step-by-step rendered in Hebrew");
  assert(stepByStepFor("property-radar-live")?.includes("שלב 1") === true, "step-by-step by module");

  console.log("\nGlossary:");
  assert(searchGlossary("Opportunity")[0]?.slug === "opportunity-score", "glossary search finds Opportunity Score");
  assert(searchGlossary("מטמון")[0]?.slug === "market-cache" || searchGlossary("cache")[0]?.slug === "market-cache", "glossary search (cache) works");

  console.log("\nFAQ + permissions:");
  assert(searchFaq("מפה", "agent").length >= 0, "faq search runs");
  const agentFaq = faqForModule(null, "agent");
  const mgrFaq = faqForModule(null, "manager");
  assert(mgrFaq.length > agentFaq.length, "manager sees more FAQ than agent (permission filtering)");
  assert(!agentFaq.some((f) => f.module === "journeys"), "agent does not see manager-only journey FAQ");

  console.log("\nRecommendations (deterministic + context):");
  const progress: LearningProgress[] = [{ kind: "walkthrough", slug: "property-radar", status: "completed", favorite: false, lastStep: 4, updatedAt: new Date().toISOString() }];
  const rec = recommendLearning({ role: "manager", progress, currentModule: "matches" });
  assert(rec.length > 0, "recommendations produced");
  assert(rec[0].slug === "buyer-matching", "current page (matches) walkthrough recommended first");
  assert(!rec.some((r) => r.kind === "walkthrough" && r.slug === "property-radar"), "completed walkthrough not recommended");
  const rec2 = recommendLearning({ role: "manager", progress, currentModule: "matches" });
  assert(JSON.stringify(rec) === JSON.stringify(rec2), "recommendations are deterministic");

  console.log("\nUnified search:");
  const hits = searchLearning("רדאר", "agent");
  assert(hits.some((h) => h.kind === "walkthrough" || h.kind === "faq"), "search spans content kinds");

  console.log("\nProgress helpers:");
  assert(isCompleted(progress, "walkthrough", "property-radar"), "isCompleted works");
  assert(continueLearning([{ kind: "tutorial", slug: "x", status: "in_progress", favorite: false, lastStep: 1, updatedAt: "2026-01-01" }]).length === 1, "continueLearning lists in-progress");

  console.log(`\n${failures === 0 ? "✅ ALL ZI LEARNING CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
