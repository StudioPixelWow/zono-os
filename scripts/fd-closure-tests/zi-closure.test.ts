// ============================================================================
// ZONO — ZI Final Closure: deterministic pure-unit coverage.
// Covers the pieces of the ZI test matrix that are pure + verifiable without an
// authenticated runtime: support-intent classification (O), office role tiers
// used by the new ZI gates (D agent-denied / L marketing-role / Z resolver), and
// next-best-action determinism after removing the ad-hoc override (Y).
// The intent-routing/fact-source/cross-org matrix requires the authed ZI runtime
// and is reported HUMAN_REQUIRED (no fake PASS).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/zi-closure.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySupportIntentDeterministic } from "../../src/lib/zi-expert/support-intent.ts";
import { isManagerRole, isOwnerRole } from "../../src/lib/auth/office-roles.ts";
import { nextBestAction } from "../../src/lib/ai-copilot/recommendations.ts";

// ── O — support classification (deterministic, no LLM) ───────────────────────
test("O: explicit human request → SUPPORT lane", () => {
  const r = classifySupportIntentDeterministic("אני רוצה לדבר עם נציג");
  assert.equal(r.lane, "SUPPORT");
});
test("O: classifier always returns a valid category + lane", () => {
  for (const msg of ["למה חייבו אותי", "וואטסאפ לא נשלח", "איך מעלים נכס", "האתר לא נטען"]) {
    const r = classifySupportIntentDeterministic(msg);
    assert.ok(typeof r.category === "string" && r.category.length > 0);
    assert.ok(r.lane === "SUPPORT" || r.lane === "PRODUCT");
  }
});

// ── D / L / Z — office role tiers behind the new ZI gates ────────────────────
test("D: agent is neither manager- nor owner-tier (office-denied)", () => {
  assert.equal(isManagerRole("agent"), false);
  assert.equal(isOwnerRole("agent"), false);
  assert.equal(isManagerRole("support"), false);
});
test("L/Z: manager tier includes owner; owner tier is owner/admin only", () => {
  for (const r of ["manager", "owner", "admin", "org_admin", "office_manager"]) assert.equal(isManagerRole(r), true, r);
  for (const r of ["owner", "admin", "org_admin"]) assert.equal(isOwnerRole(r), true, r);
  assert.equal(isOwnerRole("manager"), false); // manager is NOT owner-tier (knowledge re-seed stays owner-only)
});
test("Z: role tiers are case-insensitive + null-safe", () => {
  assert.equal(isManagerRole("MANAGER"), true);
  // @ts-expect-error null tolerance
  assert.equal(isManagerRole(null), false);
});

// ── Y — next-best-action is the deterministic engine's action, verbatim ──────
test("Y: nextBestAction consumes the deterministic action (no ad-hoc invite_buyer override)", () => {
  const c = { recommendedAction: "call_today", recommendedActionReason: "r", buyerMatchCount: 5, lifecycleStage: "new_opportunity" };
  // Even with strong buyer demand on an uncontacted lead, the copilot no longer
  // mints its own action — it maps the engine's recommendedAction verbatim.
  const nba = nextBestAction(c as never);
  assert.equal(nba.kind, "call");
});
test("Y: unknown engine action falls back to wait (never invented)", () => {
  const c = { recommendedAction: "something_new", recommendedActionReason: "", buyerMatchCount: 0, lifecycleStage: "x" };
  assert.equal(nextBestAction(c as never).kind, "wait");
});
