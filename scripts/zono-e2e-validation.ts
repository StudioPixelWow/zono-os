/**
 * ZONO — End-to-End System Validation (Phase 21, section 1).
 *
 * Validates complete user journeys deterministically using the PURE launch +
 * plan layers (no DB/network). Covers: new-org onboarding from 0→100%, the
 * twelve capability journeys gated by plan + entitlement, beta enrollment,
 * production-score banding, diagnostics rollup and usage privacy. Real runtime
 * probing (DB/providers/AI) is covered by the deployment-validation server
 * action + the readiness gate; this asserts the journey LOGIC is sound.
 *
 * Run: npx tsx scripts/zono-e2e-validation.ts
 */
import {
  ENTITLEMENTS, planAllows, upgradeFor, PLAN_ORDER,
  ONBOARDING_STEPS, emptyProgress, computeOnboarding, markStep,
  computeProductionScore, rollupDiagnostics, sanitizeUsageEvent, betaActiveFor,
} from "../src/lib/launch";
import type { BetaEnrollment, EntitlementKey, PlanTier } from "../src/lib/launch";

let failures = 0;
function ok(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

// The twelve capability journeys from the Phase 21 spec → entitlement key + the
// lowest plan that unlocks them (deterministic expectation).
const JOURNEYS: { name: string; key: EntitlementKey; minPlan: PlanTier }[] = [
  { name: "New organization onboarding", key: ENTITLEMENTS.PROPERTY_RADAR, minPlan: "starter" },
  { name: "First login", key: ENTITLEMENTS.PROPERTY_RADAR, minPlan: "starter" },
  { name: "Operating area setup", key: ENTITLEMENTS.PROPERTY_RADAR, minPlan: "starter" },
  { name: "Property Radar synchronization", key: ENTITLEMENTS.PROPERTY_RADAR, minPlan: "starter" },
  { name: "Shared Market Cache", key: ENTITLEMENTS.PROPERTY_RADAR, minPlan: "starter" },
  { name: "Buyer Matching", key: ENTITLEMENTS.BUYER_MATCHING, minPlan: "starter" },
  { name: "Seller Intelligence", key: ENTITLEMENTS.SELLER_INTELLIGENCE, minPlan: "professional" },
  { name: "AI Copilot", key: ENTITLEMENTS.AI_COPILOT, minPlan: "professional" },
  { name: "Journey Automation", key: ENTITLEMENTS.JOURNEY_AUTOMATION, minPlan: "professional" },
  { name: "Office Intelligence", key: ENTITLEMENTS.OFFICE_INTELLIGENCE, minPlan: "office" },
  { name: "Executive Intelligence", key: ENTITLEMENTS.EXECUTIVE_INTELLIGENCE, minPlan: "office" },
  { name: "Competitor Intelligence", key: ENTITLEMENTS.COMPETITOR_INTELLIGENCE, minPlan: "office" },
];

function main(): void {
  console.log("ZONO — End-to-End System Validation\n" + "=".repeat(52) + "\n");

  // Journey 1: a brand-new org walks the onboarding checklist to completion.
  console.log("New organization journey");
  let prog = emptyProgress();
  ok(computeOnboarding(prog).percent === 0, "fresh org starts at 0% onboarding");
  prog = markStep(prog, "org_created", "t");
  prog = markStep(prog, "operating_areas", "t");
  prog = markStep(prog, "first_radar_scan", "t");
  ok(computeOnboarding(prog).percent === Math.round((3 / ONBOARDING_STEPS.length) * 100), "partial progress reflects completed steps");
  for (const s of ONBOARDING_STEPS) prog = markStep(prog, s.key, "t");
  ok(computeOnboarding(prog).complete, "org can complete onboarding independently");

  // Journeys 2–13: capability access is correct per plan + has a real upgrade path.
  console.log("\nCapability journeys (plan gating)");
  for (const j of JOURNEYS) {
    const minIdx = PLAN_ORDER.indexOf(j.minPlan);
    const allowedFromMin = PLAN_ORDER.every((p, i) => planAllows(p, j.key) === (i >= minIdx));
    ok(allowedFromMin, `${j.name}: unlocked from ${j.minPlan}+ (and not below)`);
    if (minIdx > 0) {
      const below = PLAN_ORDER[minIdx - 1]!;
      ok(upgradeFor(below, j.key) === j.minPlan, `${j.name}: upgrade path from ${below} → ${j.minPlan}`);
    }
  }

  // No cross-org leakage is an RLS guarantee (org-scoped queries) — asserted at
  // the SQL/server layer; here we assert entitlement checks are pure + stable.
  console.log("\nIntegrity");
  ok(planAllows("enterprise", ENTITLEMENTS.PLATFORM_ADMIN) && !planAllows("starter", ENTITLEMENTS.PLATFORM_ADMIN), "platform admin gated to enterprise");

  // Beta journey.
  const beta: BetaEnrollment[] = [{ orgId: "o", userId: null, enabled: true, channel: "beta" }];
  ok(betaActiveFor(beta, "anyone"), "beta enrollment activates for org members");

  // Production score + diagnostics banding.
  ok(computeProductionScore({ infrastructure: 1, security: 1, performance: 1, monitoring: 1, reliability: 1 }).band === "ready", "all-green ⇒ launch ready");
  ok(rollupDiagnostics([{ key: "a", label: "A", status: "pass" }, { key: "b", label: "B", status: "warning" }]) === "warning", "diagnostics surface the worst signal");

  // Privacy: usage analytics never carries business content.
  const ev = sanitizeUsageEvent({ category: "ai", name: "copilot.run", props: { durationMs: 120, clientName: "פרטי" } });
  ok(!!ev && ev.props.durationMs === 120 && !("clientName" in ev.props), "usage analytics excludes sensitive business content");

  console.log("\n" + "=".repeat(52));
  console.log(failures === 0 ? "RESULT: ✅ ALL USER JOURNEYS VALID" : `RESULT: ❌ ${failures} JOURNEY CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
