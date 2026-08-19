// ============================================================================
// ZONO — Seller lifecycle core: deterministic proof (pure, mocks-free).
// Run: node --experimental-strip-types --test scripts/seller-lifecycle-tests/lifecycle-core.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveSellerLifecycleState, deriveMarketingHealth, nextAgentAction,
  isSellerLifecycleClosed, sellerSafeFeedbackSummary, type SellerSignals,
} from "../../src/lib/sellers/lifecycle-core.ts";

function sig(over: Partial<SellerSignals> = {}): SellerSignals {
  return {
    status: "active", daysListed: 1, hasActiveCampaign: false, publications: 0,
    hasFuturePublication: false, interestedCount: 0, qualifiedLeads: 0,
    viewingsScheduled: 0, viewingsCompleted: 0, feedbackCount: 0,
    hasOpenDeal: false, hasOffer: false, dealWon: false, lastActivityDaysAgo: 0, ...over,
  };
}

// ── Lifecycle state ─────────────────────────────────────────────────────────
test("draft property → preparing", () => {
  assert.equal(deriveSellerLifecycleState(sig({ status: "draft" })), "preparing");
});
test("ready property, no marketing → ready_to_market", () => {
  assert.equal(deriveSellerLifecycleState(sig({ status: "ready" })), "ready_to_market");
});
test("active property, no marketing yet → ready_to_market", () => {
  assert.equal(deriveSellerLifecycleState(sig({ status: "active" })), "ready_to_market");
});
test("active campaign, no interest → marketing (A: goes live)", () => {
  assert.equal(deriveSellerLifecycleState(sig({ hasActiveCampaign: true })), "marketing");
});
test("publications + interest → interest", () => {
  assert.equal(deriveSellerLifecycleState(sig({ publications: 2, interestedCount: 1 })), "interest");
});
test("scheduled viewings → viewings", () => {
  assert.equal(deriveSellerLifecycleState(sig({ hasActiveCampaign: true, viewingsScheduled: 2 })), "viewings");
});
test("14+ days marketing, no traction → needs_strategy", () => {
  assert.equal(deriveSellerLifecycleState(sig({ hasActiveCampaign: true, daysListed: 20 })), "needs_strategy");
});
test("2 completed viewings, no deal, 14+ days → needs_strategy", () => {
  assert.equal(deriveSellerLifecycleState(sig({ hasActiveCampaign: true, daysListed: 20, viewingsCompleted: 2 })), "needs_strategy");
});
test("open deal → progressing", () => {
  assert.equal(deriveSellerLifecycleState(sig({ hasActiveCampaign: true, hasOpenDeal: true })), "progressing");
});
test("offer present → progressing", () => {
  assert.equal(deriveSellerLifecycleState(sig({ hasOffer: true })), "progressing");
});
test("under_offer status → progressing", () => {
  assert.equal(deriveSellerLifecycleState(sig({ status: "under_offer" })), "progressing");
});
test("sold → closed", () => {
  assert.equal(deriveSellerLifecycleState(sig({ status: "sold" })), "closed");
});
test("deal won → closed even if status active", () => {
  assert.equal(deriveSellerLifecycleState(sig({ status: "active", dealWon: true })), "closed");
});

// ── Marketing health ────────────────────────────────────────────────────────
test("no marketing → not_marketed", () => {
  const h = deriveMarketingHealth(sig({ status: "active" }));
  assert.equal(h.health, "not_marketed");
  assert.deepEqual(h.reasons, ["not_marketed"]);
});
test("3 interested → strong_interest", () => {
  assert.equal(deriveMarketingHealth(sig({ hasActiveCampaign: true, interestedCount: 3 })).health, "strong_interest");
});
test("2 completed viewings, no deal → viewings_no_progress", () => {
  assert.equal(deriveMarketingHealth(sig({ publications: 3, viewingsCompleted: 2 })).health, "viewings_no_progress");
});
test("published but no future/active → no_future_marketing", () => {
  assert.equal(deriveMarketingHealth(sig({ publications: 2, hasActiveCampaign: false, hasFuturePublication: false })).health, "no_future_marketing");
});
test("14+ days, active campaign, no interest → no_recent_interest", () => {
  assert.equal(deriveMarketingHealth(sig({ hasActiveCampaign: true, hasFuturePublication: true, daysListed: 20 })).health, "no_recent_interest");
});
test("progressing property → healthy", () => {
  assert.equal(deriveMarketingHealth(sig({ hasOpenDeal: true })).health, "healthy");
});

// ── Next agent action ───────────────────────────────────────────────────────
test("next action: strong interest → contact buyers", () => {
  assert.equal(nextAgentAction("interest", "strong_interest"), "contact_interested_buyers");
});
test("next action: viewings no progress → discuss strategy", () => {
  assert.equal(nextAgentAction("needs_strategy", "viewings_no_progress"), "discuss_strategy_with_seller");
});
test("next action: closed → none", () => {
  assert.equal(nextAgentAction("closed", "healthy"), "none");
});

// ── Closed guard ────────────────────────────────────────────────────────────
test("isSellerLifecycleClosed", () => {
  for (const st of ["sold", "rented", "withdrawn", "archived"]) assert.equal(isSellerLifecycleClosed(st, false), true);
  assert.equal(isSellerLifecycleClosed("active", false), false);
  assert.equal(isSellerLifecycleClosed("active", true), true);   // deal won
});

// ── Seller-safe feedback (privacy: counts only, no invented sentiment) ────────
test("G: no feedback → says none, invents nothing", () => {
  assert.deepEqual(sellerSafeFeedbackSummary({ interested: 0, advancing: 0, notSuitable: 0, total: 0 }), ["טרם נרשם משוב מביקורים."]);
});
test("feedback summary uses counts only, no identities", () => {
  const out = sellerSafeFeedbackSummary({ interested: 1, advancing: 1, notSuitable: 2, total: 4 });
  const joined = out.join(" ");
  assert.ok(joined.includes("ביקשו להמשיך") || joined.includes("ביקש להמשיך"));
  // must never contain a phone/email/name placeholder
  assert.ok(!/@|05\d|שם/.test(joined));
});
