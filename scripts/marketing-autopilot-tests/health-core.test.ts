// ============================================================================
// ZONO — Marketing Autopilot core: deterministic proof (pure, mocks-free).
// Run: node --experimental-strip-types --test scripts/marketing-autopilot-tests/health-core.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveMarketingRecommendation, deriveMarketingState, deriveMarketingReasons,
  buildWeeklyPlan, marketingUrgency, type MarketingSignals,
} from "../../src/lib/marketing-autopilot/health-core.ts";

function sig(over: Partial<MarketingSignals> = {}): MarketingSignals {
  return {
    propertyStatus: "active", daysListed: 5, hasActiveCampaign: true, publications: 3, failedPublications: 0,
    hasFuturePublication: true, lastPublishedDaysAgo: 2, activeGroups: 10, usedGroups: 3, unusedGroups: 7,
    hasPrimaryImage: true, approvedCreativeExists: true, selectedCreativeReady: true, creativeReuseCount: 1,
    strongMatches: 0, strongUnsent: 0, interested: 0, interestedNoViewing: 0, viewingsCompleted: 0,
    viewingsNoProgress: false, hasOpenDeal: false, facebookConnected: true, canPromote: false, sellerMarketingHealth: "healthy", ...over,
  };
}

// A. never marketed
test("A never marketed → not_started / start_marketing", () => {
  const s = sig({ publications: 0, hasActiveCampaign: false, hasFuturePublication: false });
  assert.equal(deriveMarketingState(s), "not_started");
  assert.equal(deriveMarketingRecommendation(s).actionType, "start_marketing");
  assert.equal(deriveMarketingRecommendation(s).priority, "P1");
});
// B. active healthy
test("B active healthy → healthy / prepare or expand", () => {
  const s = sig({ unusedGroups: 0 });
  assert.equal(deriveMarketingState(s), "healthy");
  assert.equal(deriveMarketingRecommendation(s).priority, "P2");
});
// C. no future marketing
test("C no future marketing → needs_distribution / schedule", () => {
  const s = sig({ hasActiveCampaign: false, hasFuturePublication: false });
  assert.equal(deriveMarketingState(s), "needs_distribution");
  assert.equal(deriveMarketingRecommendation(s).actionType, "schedule_marketing");
});
// D. failed publication (P0)
test("D failed publication → blocked / fix (P0), wins over all", () => {
  const s = sig({ failedPublications: 2, strongUnsent: 5 });
  assert.equal(deriveMarketingState(s), "blocked");
  const r = deriveMarketingRecommendation(s);
  assert.equal(r.priority, "P0"); assert.equal(r.actionType, "fix_publication");
  assert.ok(r.reason.includes("2"));
});
// E. no photo
test("E no photo → needs_content / prepare_creative", () => {
  const s = sig({ hasPrimaryImage: false });
  assert.equal(deriveMarketingState(s), "needs_content");
  assert.equal(deriveMarketingRecommendation(s).actionType, "prepare_creative");
});
// F. stale creative
test("F stale creative reuse → needs_refresh", () => {
  const s = sig({ creativeReuseCount: 4 });
  assert.equal(deriveMarketingState(s), "needs_refresh");
  assert.equal(deriveMarketingRecommendation(s).actionType, "refresh_creative");
});
// G. strong matches unsent
test("G strong unsent → needs_followup / send_matches", () => {
  const s = sig({ strongUnsent: 8 });
  assert.equal(deriveMarketingState(s), "needs_followup");
  const r = deriveMarketingRecommendation(s);
  assert.equal(r.actionType, "send_matches"); assert.ok(r.reason.includes("8"));
});
// H. all matches already sent
test("H all sent → no send_matches P1", () => {
  const s = sig({ strongUnsent: 0, strongMatches: 5, unusedGroups: 0 });
  assert.notEqual(deriveMarketingRecommendation(s).actionType, "send_matches"); // falls to P2 (matches or prepare)
});
// I. interested without viewing
test("I interest without viewing → interest_followup", () => {
  const s = sig({ interestedNoViewing: 3 });
  assert.equal(deriveMarketingRecommendation(s).actionType, "interest_followup");
});
// K. property sold
test("K sold → blocked / none", () => {
  const s = sig({ propertyStatus: "sold" });
  assert.equal(deriveMarketingState(s), "blocked");
  assert.equal(deriveMarketingRecommendation(s).priority, "none");
  assert.deepEqual(deriveMarketingReasons(s), ["הנכס אינו זמין לשיווק."]);
});
// N. Studio creative not publish-ready (P0)
test("N creative not ready → blocked / prepare_creative P0", () => {
  const s = sig({ selectedCreativeReady: false });
  assert.equal(deriveMarketingState(s), "blocked");
  const r = deriveMarketingRecommendation(s);
  assert.equal(r.priority, "P0"); assert.equal(r.actionType, "prepare_creative");
});
// O/P. canPrepareAutomatically reflects manager promotion ability
test("O agent cannot promote → canPrepareAutomatically false", () => {
  assert.equal(deriveMarketingRecommendation(sig({ selectedCreativeReady: false, canPromote: false })).canPrepareAutomatically, false);
});
test("P manager can promote → canPrepareAutomatically true", () => {
  assert.equal(deriveMarketingRecommendation(sig({ selectedCreativeReady: false, canPromote: true })).canPrepareAutomatically, true);
});
// Q. campaign already covers group → no expansion when unusedGroups 0
test("Q no unused groups → no expand_groups", () => {
  assert.notEqual(deriveMarketingRecommendation(sig({ unusedGroups: 0 })).actionType, "expand_groups");
});

// Reasons are backed by real numbers, never invented analytics.
test("reasons contain no fabricated analytics words", () => {
  const joined = deriveMarketingReasons(sig({ failedPublications: 1, strongUnsent: 4, lastPublishedDaysAgo: 10, creativeReuseCount: 5, interestedNoViewing: 2, unusedGroups: 3 })).join(" ");
  for (const bad of ["impressions", "CTR", "engagement", "clicks", "reach", "צפיות", "חשיפות"]) assert.ok(!joined.toLowerCase().includes(bad.toLowerCase()), `reason must not fabricate ${bad}`);
});

// Urgency ordering.
test("urgency P0 > P1 > P2 > none", () => {
  assert.ok(marketingUrgency(deriveMarketingRecommendation(sig({ failedPublications: 1 }))) > marketingUrgency(deriveMarketingRecommendation(sig({ publications: 0, hasActiveCampaign: false, hasFuturePublication: false }))));
  assert.ok(marketingUrgency(deriveMarketingRecommendation(sig({ propertyStatus: "sold" }))) === 0);
});

// Weekly plan: real, routes into existing engines, none auto-executed.
test("weekly plan for never-marketed property includes a facebook publish routed to the wizard", () => {
  const plan = buildWeeklyPlan("p1", sig({ publications: 0, hasActiveCampaign: false, hasFuturePublication: false }));
  const pub = plan.find((i) => i.type === "facebook_publish");
  assert.ok(pub); assert.ok(pub!.executionRoute.includes("/distribution/campaign-wizard?property=p1"));
});
test("weekly plan for strong-unsent includes a buyer bundle needing approval", () => {
  const plan = buildWeeklyPlan("p1", sig({ strongUnsent: 8 }));
  const b = plan.find((i) => i.type === "buyer_bundle");
  assert.ok(b); assert.equal(b!.requiresApproval, true); assert.ok(b!.audience.includes("8"));
});
test("sold property → empty plan", () => {
  assert.equal(buildWeeklyPlan("p1", sig({ propertyStatus: "sold" })).length, 0);
});
