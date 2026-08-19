// ============================================================================
// ZONO — Property control-center next-action core: deterministic proof (pure).
// Run: node --experimental-strip-types --test scripts/control-center-tests/next-action-core.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivePropertyNextAction, buildRecoFunnel, recoStatusLabel, type ControlSignals,
} from "../../src/lib/properties/control-center-core.ts";

function sig(over: Partial<ControlSignals> = {}): ControlSignals {
  return {
    closed: false, failedPublications: 0, sellerActionRequested: false, hotBuyerWaiting: false,
    priceDropResponses: 0, viewingFollowupOverdue: false, dealReadyBuyer: false, hasOpenDeal: false,
    strongUncontactedMatches: 0, viewingFeedbackPending: 0, sellerStrategyNeeded: false,
    noFutureMarketing: false, notMarketed: false, noRecentInterest: false, reportDueUnsent: false, ...over,
  };
}

// ── Priority ladder ─────────────────────────────────────────────────────────
test("closed → none", () => {
  assert.equal(derivePropertyNextAction(sig({ closed: true, failedPublications: 3 })).priority, "none");
});
test("P0: failed publication wins over everything", () => {
  const a = derivePropertyNextAction(sig({ failedPublications: 2, sellerActionRequested: true, priceDropResponses: 5 }));
  assert.equal(a.priority, "P0"); assert.equal(a.code, "publish_failed");
});
test("P0: seller action before buyer waiting", () => {
  const a = derivePropertyNextAction(sig({ sellerActionRequested: true, priceDropResponses: 3 }));
  assert.equal(a.code, "seller_action");
});
test("P0: price-drop responses surfaced with count", () => {
  const a = derivePropertyNextAction(sig({ priceDropResponses: 3 }));
  assert.equal(a.priority, "P0"); assert.equal(a.code, "buyer_waiting");
  assert.ok(a.label.includes("3"));
});
test("P0: viewing followup overdue", () => {
  assert.equal(derivePropertyNextAction(sig({ viewingFollowupOverdue: true })).code, "viewing_followup");
});
test("P1: deal-ready buyer with no deal → open deal", () => {
  const a = derivePropertyNextAction(sig({ dealReadyBuyer: true }));
  assert.equal(a.priority, "P1"); assert.equal(a.code, "open_deal");
});
test("P1: deal-ready buyer but deal already open → not open_deal", () => {
  const a = derivePropertyNextAction(sig({ dealReadyBuyer: true, hasOpenDeal: true, strongUncontactedMatches: 2 }));
  assert.equal(a.code, "contact_matches");
});
test("P1: strong uncontacted matches", () => {
  const a = derivePropertyNextAction(sig({ strongUncontactedMatches: 4 }));
  assert.equal(a.priority, "P1"); assert.ok(a.label.includes("4"));
});
test("P1: viewing feedback pending", () => {
  assert.equal(derivePropertyNextAction(sig({ viewingFeedbackPending: 2 })).code, "collect_feedback");
});
test("P1: seller strategy needed", () => {
  assert.equal(derivePropertyNextAction(sig({ sellerStrategyNeeded: true })).code, "seller_strategy");
});
test("P2: not marketed → start marketing", () => {
  const a = derivePropertyNextAction(sig({ notMarketed: true }));
  assert.equal(a.priority, "P2"); assert.equal(a.code, "start_marketing");
});
test("nothing pending → all_good", () => {
  assert.equal(derivePropertyNextAction(sig()).code, "all_good");
});

// ── Recommendation funnel (no fabricated opens) ─────────────────────────────
test("funnel derives from real status counts, no opened step", () => {
  const f = buildRecoFunnel({ matchCount: 12, statusCounts: { recommended: 3, interested: 2, rejected: 1, viewing_requested: 1, viewed: 1 } });
  assert.equal(f.matched, 12);
  assert.equal(f.sent, 8);           // 3+2+1+1+1
  assert.equal(f.responded, 4);      // interested+rejected+viewing_requested
  assert.equal(f.interested, 2);
  assert.equal(f.viewingRequested, 1);
  assert.equal(f.rejected, 1);
  assert.ok(!("opened" in f));       // never fabricated
});
test("funnel: matched never below sent", () => {
  const f = buildRecoFunnel({ matchCount: 0, statusCounts: { recommended: 5 } });
  assert.equal(f.matched, 5);
});

// ── Status labels ───────────────────────────────────────────────────────────
test("reco status labels", () => {
  assert.equal(recoStatusLabel("interested"), "מעניין");
  assert.equal(recoStatusLabel("viewing_requested"), "ביקש ביקור");
  assert.equal(recoStatusLabel(null), "טרם נשלח");
  assert.equal(recoStatusLabel(undefined), "טרם נשלח");
});
