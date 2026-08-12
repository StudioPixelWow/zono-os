/*
 * P5.4 — Effective Access resolver QA (LOCAL, no DB, no network).
 * Proves the canonical resolver is deterministic, fail-safe, correctly plan-
 * gated, override-aware, and that drift is classified so enforcement can't
 * silently remove live access. Run: npx tsx scripts/platform-access-qa.ts
 */
import {
  FEATURE_CATALOG, featureByKey, normalizePlanTier, resolveFeatureAccess, classifyDrift,
  buildAccessMatrix, summarizeDrift, PLAN_TIERS,
} from "../src/lib/platform-admin/access/model";
import type { PlanTier } from "../src/lib/launch/types";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }
const TIERS: PlanTier[] = ["starter", "professional", "office", "enterprise"];

function main(): void {
  console.log("P5.4 effective-access resolver QA\n");

  // ── 1. Plan-tier normalization (org_plan enum vocab → PlanTier). ──
  assert(normalizePlanTier("pro") === "professional", "normalize pro → professional");
  assert(normalizePlanTier("team") === "office", "normalize team → office");
  assert(normalizePlanTier("enterprise") === "enterprise", "normalize enterprise");
  assert(normalizePlanTier(null) === "starter" && normalizePlanTier("") === "starter" && normalizePlanTier("bogus") === "starter", "normalize null/empty/unknown → starter (safe default)");

  // ── 2. Determinism: same inputs → identical output. ──
  const a = resolveFeatureAccess("starter", featureByKey("ai"), null);
  const b = resolveFeatureAccess("starter", featureByKey("ai"), null);
  assert(JSON.stringify(a) === JSON.stringify(b), "resolver is deterministic");

  // ── 3. Base (ungated) modules are always enabled on every tier. ──
  for (const t of TIERS) {
    for (const key of ["crm", "properties", "leads", "whatsapp", "distribution", "facebook", "agent_website"]) {
      const r = resolveFeatureAccess(t, featureByKey(key), null);
      assert(r.enabled && r.source === "base", `${key} always enabled (base) on ${t}`);
    }
  }

  // ── 4. Plan gating: starter LACKS ai/journeys/analytics/office_website; enterprise has all. ──
  for (const key of ["ai", "journeys", "automations", "analytics", "office_website", "competitor_intelligence", "multi_agent"]) {
    assert(!resolveFeatureAccess("starter", featureByKey(key), null).enabled, `starter: ${key} DISABLED (plan)`);
    assert(resolveFeatureAccess("enterprise", featureByKey(key), null).enabled, `enterprise: ${key} enabled`);
  }
  assert(resolveFeatureAccess("professional", featureByKey("ai"), null).enabled, "professional: ai enabled");
  assert(!resolveFeatureAccess("professional", featureByKey("competitor_intelligence"), null).enabled, "professional: competitor_intelligence DISABLED (office+)");
  assert(resolveFeatureAccess("office", featureByKey("competitor_intelligence"), null).enabled, "office: competitor_intelligence enabled");

  // ── 5. Overrides: org/global flag forces on/off, and is reported as the source. ──
  const forcedOn = resolveFeatureAccess("starter", featureByKey("ai"), { enabled: true, scope: "org" });
  assert(forcedOn.enabled && forcedOn.source === "org_override" && forcedOn.override === true, "org override can ENABLE a plan-gated feature");
  const forcedOff = resolveFeatureAccess("enterprise", featureByKey("ai"), { enabled: false, scope: "global" });
  assert(!forcedOff.enabled && forcedOff.source === "feature_flag", "global flag can DISABLE an entitled feature");
  // planEntitled is preserved regardless of override (explainability).
  assert(forcedOn.planEntitled === false && forcedOff.planEntitled === true, "planEntitled preserved under override (explainable)");

  // ── 6. Fail-safe: unknown feature → disabled. ──
  const unknown = resolveFeatureAccess("enterprise", featureByKey("nope"), null);
  assert(!unknown.enabled, "unknown feature fails safe (disabled)");
  assert(featureByKey("nope") === null, "featureByKey unknown → null");

  // ── 7. Drift (shadow mode): plan-gated-off features are CRITICAL (would remove live access). ──
  const starterAi = classifyDrift(resolveFeatureAccess("starter", featureByKey("ai"), null), true);
  assert(starterAi.severity === "critical", "drift: starter ai currently-on but resolver-off → CRITICAL");
  const enterpriseAi = classifyDrift(resolveFeatureAccess("enterprise", featureByKey("ai"), null), true);
  assert(enterpriseAi.severity === "none", "drift: enterprise ai on/on → none");
  const overrideDrift = classifyDrift(resolveFeatureAccess("starter", featureByKey("ai"), { enabled: true, scope: "org" }), true);
  assert(overrideDrift.severity === "info", "drift: override-enabled → info");

  // ── 8. Catalog integrity. ──
  assert(FEATURE_CATALOG.length >= 14, `catalog has ${FEATURE_CATALOG.length} features`);
  assert(new Set(FEATURE_CATALOG.map((f) => f.key)).size === FEATURE_CATALOG.length, "catalog keys unique");

  // ── 9. Access matrix: one row per feature, one cell per tier, monotonic-ish. ──
  const matrix = buildAccessMatrix();
  assert(matrix.length === FEATURE_CATALOG.length, "matrix row per catalog feature");
  assert(matrix.every((r) => r.cells.length === PLAN_TIERS.length), "matrix cell per plan tier");
  // Base modules entitled on EVERY tier; enterprise entitled to EVERYTHING.
  assert(matrix.filter((r) => r.entitlement === null).every((r) => r.cells.every((c) => c.entitled)), "matrix: base modules entitled on all tiers");
  assert(matrix.every((r) => r.cells.find((c) => c.tier === "enterprise")!.entitled), "matrix: enterprise entitled to every feature");
  // starter must NOT be entitled to a known plan-gated feature.
  assert(matrix.find((r) => r.feature === "competitor_intelligence")!.cells.find((c) => c.tier === "starter")!.entitled === false, "matrix: starter lacks competitor_intelligence");

  // ── 10. Drift summary aggregation matches per-entry classification. ──
  const drift = FEATURE_CATALOG.map((f) => classifyDrift(resolveFeatureAccess("starter", f, null), true));
  const sum = summarizeDrift(drift);
  assert(sum.total === drift.length, "drift summary total == entries");
  assert(sum.critical + sum.warning + sum.info + sum.none === drift.length, "drift summary buckets sum to total");
  assert(sum.critical === drift.filter((d) => d.severity === "critical").length, "drift summary critical count matches");
  assert(sum.critical > 0, "starter (grandfathered) has CRITICAL drift → enforcement must not silently remove access");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
