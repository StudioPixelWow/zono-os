// ============================================================================
// ZONO — Marketing Autopilot 2.0 plan-core: deterministic proof (pure, mocks-free).
// Run: node --experimental-strip-types --test scripts/marketing-autopilot-tests/plan-core.test.ts
// Covers the test matrix items that are PURE-decidable: recipient eligibility
// (rejected / opted-out / already-sent / removed), validation → blockers/notices,
// inactive-group removal, sold-property block, creative-not-ready block, executable
// filtering, idempotency identity, stable itemIds, and plan status roll-up
// (approval double-click, retry, partial failure, completed, cancelled legality).
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterEligibleRecipients, validatePlan, rollupPlanStatus, execIdentity, stableItemId,
  buildSummary, isExecutableItem, canApproveFrom, canActivateFrom, canEditFrom, canCancelFrom,
  type MarketingPlanSnapshot, type PlanItem, type PlanValidationFacts,
} from "../../src/lib/marketing-autopilot/plan-core.ts";

function fbItem(over: Partial<PlanItem> = {}): PlanItem {
  return {
    itemId: "facebook_publish:0", type: "facebook_publish", title: "פרסום בפייסבוק",
    why: "אין פרסום עתידי", who: "3 קבוצות", when: "יום א'", status: "ready", requiresApproval: true,
    facebook: { caption: "נכס מדהים למכירה", media: { kind: "property_primary", id: "m1", url: "u" }, creativeOutputId: null, groupIds: ["g1", "g2", "g3"], groupNames: ["א", "ב", "ג"], frequency: "three_weekly", startDate: "2026-08-24" },
    ...over,
  };
}
function buyerItem(over: Partial<PlanItem> = {}): PlanItem {
  return {
    itemId: "buyer_bundle:1", type: "buyer_bundle", title: "שליחת הנכס למתעניינים",
    why: "8 התאמות חזקות", who: "8 לקוחות", when: "יום ב'", status: "ready", requiresApproval: true,
    buyer: { recipientIds: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"], removedIds: [], estimatedRecipients: 8, channelSummary: "וואטסאפ / אימייל לפי הסכמה" },
    ...over,
  };
}
function followupItem(over: Partial<PlanItem> = {}): PlanItem {
  return {
    itemId: "interest_followup:2", type: "interest_followup", title: "טיפול בהתעניינות",
    why: "3 מתעניינים ללא ביקור", who: "3 מתעניינים", when: "יום ה'", status: "ready", requiresApproval: false,
    followup: { customerIds: ["c1", "c2", "c3"], count: 3 },
    ...over,
  };
}
function snap(items: PlanItem[], over: Partial<MarketingPlanSnapshot> = {}): MarketingPlanSnapshot {
  return {
    planId: "plan-1", propertyId: "prop-1", propertyTitle: "ברנר 21", propertyImageUrl: null,
    marketingState: "needs_distribution", stateLabel: "אין פרסום עתידי", sourceVersion: "autopilot-2.0",
    items, summary: buildSummary(items),
    audit: { preparedBy: "u1", preparedAt: "t", editedBy: null, editedAt: null, approvedBy: null, approvedAt: null, activatedBy: null, activatedAt: null },
    ...over,
  };
}
function facts(over: Partial<PlanValidationFacts> = {}): PlanValidationFacts {
  return {
    propertyMarketable: true, facebookConnected: true, activeGroupIds: ["g1", "g2", "g3"],
    creativeReadyByItem: {}, buyerEligibilityByItem: {}, ...over,
  };
}

// ── A) Recipient eligibility precedence ──────────────────────────────────────
test("A recipient filter: rejected/opted-out/already-sent/removed all excluded", () => {
  const r = filterEligibleRecipients({
    candidates: ["b1", "b2", "b3", "b4", "b5"],
    rejected: ["b2"], optedOut: ["b3"], alreadySent: ["b4"], removed: ["b5"],
  });
  assert.deepEqual(r.eligible, ["b1"]);
  assert.equal(r.excluded.length, 4);
});

test("B recipient filter dedupes candidates and never invents recipients", () => {
  const r = filterEligibleRecipients({ candidates: ["b1", "b1", "b2"] });
  assert.deepEqual(r.eligible, ["b1", "b2"]);
});

// ── C) Already-sent exclusion (J in the spec matrix) ─────────────────────────
test("C validation removes already-sent buyers with a Hebrew notice", () => {
  const s = snap([buyerItem()]);
  const v = validatePlan(s, facts({
    buyerEligibilityByItem: { "buyer_bundle:1": { candidates: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"], alreadySent: ["b1", "b2"] } },
  }));
  const b = v.snapshot.items[0].buyer!;
  assert.equal(b.recipientIds.length, 6);
  assert.equal(b.estimatedRecipients, 6);
  assert.ok(v.notices.some((n) => n.includes("כבר קיבלו את הנכס")));
  assert.equal(v.canApprove, true);
});

// ── H/I) rejected + opted-out excluded ───────────────────────────────────────
test("H+I rejected and opted-out buyers excluded at validation", () => {
  const s = snap([buyerItem()]);
  const v = validatePlan(s, facts({
    buyerEligibilityByItem: { "buyer_bundle:1": { candidates: ["b1", "b2", "b3"], rejected: ["b1"], optedOut: ["b2"] } },
  }));
  assert.deepEqual(v.snapshot.items[0].buyer!.recipientIds, ["b3"]);
  assert.ok(v.notices.some((n) => n.includes("סירבו")));
  assert.ok(v.notices.some((n) => n.includes("הסכמה")));
});

// ── F) inactive group removed at validation ──────────────────────────────────
test("F inactive groups dropped; item stays ready with remaining active groups", () => {
  const s = snap([fbItem()]);
  const v = validatePlan(s, facts({ activeGroupIds: ["g1"] }));  // g2,g3 now inactive
  assert.deepEqual(v.snapshot.items[0].facebook!.groupIds, ["g1"]);
  assert.equal(v.snapshot.items[0].status, "ready");
  assert.ok(v.notices.some((n) => n.includes("אינן פעילות")));
  assert.equal(v.canApprove, true);
});

test("F2 all groups inactive → item blocked, cannot approve", () => {
  const s = snap([fbItem()]);
  const v = validatePlan(s, facts({ activeGroupIds: [] }));
  assert.equal(v.snapshot.items[0].status, "blocked");
  assert.equal(v.canApprove, false);
  assert.ok(v.blockers.length > 0);
});

// ── G) sold property blocks activation ───────────────────────────────────────
test("G sold/unmarketable property blocks approval", () => {
  const s = snap([fbItem()]);
  const v = validatePlan(s, facts({ propertyMarketable: false }));
  assert.equal(v.canApprove, false);
  assert.ok(v.blockers.some((b) => b.includes("אינו זמין לשיווק")));
});

// ── L) creative not publish-ready blocks that item ───────────────────────────
test("L creative-not-ready blocks the facebook item", () => {
  const it = fbItem({ facebook: { ...fbItem().facebook!, creativeOutputId: "cr1" } });
  const s = snap([it]);
  const v = validatePlan(s, facts({ creativeReadyByItem: { "facebook_publish:0": false } }));
  assert.equal(v.snapshot.items[0].status, "blocked");
  assert.ok(v.blockers.some((b) => b.includes("אינו מוכן לפרסום")));
});

test("L2 facebook not connected blocks the item", () => {
  const s = snap([fbItem()]);
  const v = validatePlan(s, facts({ facebookConnected: false }));
  assert.equal(v.snapshot.items[0].status, "blocked");
});

// ── missing caption blocks ───────────────────────────────────────────────────
test("missing caption blocks the facebook item", () => {
  const it = fbItem({ facebook: { ...fbItem().facebook!, caption: "   " } });
  const v = validatePlan(snap([it]), facts());
  assert.equal(v.snapshot.items[0].status, "blocked");
});

// ── Stable item ids + idempotency identity ───────────────────────────────────
test("stableItemId + execIdentity are deterministic", () => {
  assert.equal(stableItemId("facebook_publish", 0), "facebook_publish:0");
  assert.equal(execIdentity("plan-1", "facebook_publish:0"), "marketing-plan:plan-1:facebook_publish:0");
  // same inputs → same identity (retry/double-click keys are identical)
  assert.equal(execIdentity("plan-1", "buyer_bundle:1"), execIdentity("plan-1", "buyer_bundle:1"));
});

// ── executable filter: creative never an external send; blocked/skipped skipped ─
test("isExecutableItem excludes creative, blocked, skipped", () => {
  assert.equal(isExecutableItem(fbItem()), true);
  assert.equal(isExecutableItem(fbItem({ status: "blocked" })), false);
  assert.equal(isExecutableItem({ ...fbItem(), status: "skipped" }), false);
  assert.equal(isExecutableItem({ itemId: "creative_refresh:0", type: "creative_refresh", title: "", why: "", who: "", when: null, status: "ready", requiresApproval: false }), false);
});

// ── Roll-up: partial failure, completed, retry, double-click ─────────────────
test("R+S rollup partial failure = partially_completed", () => {
  const items = [
    fbItem({ execution: { status: "scheduled" } }),
    buyerItem({ execution: { status: "failed", error: "provider" } }),
  ];
  assert.equal(rollupPlanStatus(items), "partially_completed");
});

test("T rollup all done = completed", () => {
  const items = [
    fbItem({ execution: { status: "scheduled" } }),
    buyerItem({ execution: { status: "completed" } }),
    followupItem({ execution: { status: "completed" } }),
  ];
  assert.equal(rollupPlanStatus(items), "completed");
});

test("rollup any executing = activating (double-click sees in-flight)", () => {
  const items = [fbItem({ execution: { status: "executing" } }), buyerItem({ execution: { status: "completed" } })];
  assert.equal(rollupPlanStatus(items), "activating");
});

test("rollup all failed = failed", () => {
  const items = [fbItem({ execution: { status: "failed" } }), buyerItem({ execution: { status: "failed" } })];
  assert.equal(rollupPlanStatus(items), "failed");
});

test("rollup ignores creative_refresh and skipped items", () => {
  const items = [
    fbItem({ execution: { status: "scheduled" } }),
    { itemId: "creative_refresh:1", type: "creative_refresh", title: "", why: "", who: "", when: null, status: "ready", requiresApproval: false } as PlanItem,
    buyerItem({ status: "skipped" }),
  ];
  assert.equal(rollupPlanStatus(items), "completed");
});

// ── U) transition legality (cancel/edit/approve/activate) ────────────────────
test("U transition legality guards", () => {
  assert.equal(canApproveFrom("draft"), true);
  assert.equal(canApproveFrom("approved"), false);
  assert.equal(canActivateFrom("approved"), true);
  assert.equal(canActivateFrom("partially_completed"), true);   // retry
  assert.equal(canActivateFrom("draft"), false);
  assert.equal(canEditFrom("draft"), true);
  assert.equal(canEditFrom("approved"), false);                 // approved is frozen
  assert.equal(canCancelFrom("draft"), true);
  assert.equal(canCancelFrom("active"), false);
});

// ── summary counts ───────────────────────────────────────────────────────────
test("buildSummary counts publications/groups/buyers/followups", () => {
  const s = buildSummary([fbItem(), buyerItem(), followupItem()]);
  assert.equal(s.publications, 1);
  assert.equal(s.groups, 3);
  assert.equal(s.buyers, 8);
  assert.equal(s.followups, 3);
});

// ── follow-up with zero customers is skipped ─────────────────────────────────
test("interest_followup with 0 customers skipped", () => {
  const it = followupItem({ followup: { customerIds: [], count: 0 } });
  const v = validatePlan(snap([it]), facts());
  assert.equal(v.snapshot.items[0].status, "skipped");
});

// ── D/E) caption + media parity preserved through validation ─────────────────
test("D+E caption and media survive validation unchanged (preview=payload parity)", () => {
  const it = fbItem();
  const v = validatePlan(snap([it]), facts());
  assert.equal(v.snapshot.items[0].facebook!.caption, "נכס מדהים למכירה");
  assert.deepEqual(v.snapshot.items[0].facebook!.media, { kind: "property_primary", id: "m1", url: "u" });
});

// ── user-removed recipient stays excluded at validation ──────────────────────
test("user-removed recipient excluded even if still a strong candidate", () => {
  const it = buyerItem({ buyer: { recipientIds: ["b1", "b2"], removedIds: ["b2"], estimatedRecipients: 2, channelSummary: "x" } });
  const v = validatePlan(snap([it]), facts({ buyerEligibilityByItem: { "buyer_bundle:1": { candidates: ["b1", "b2"] } } }));
  assert.deepEqual(v.snapshot.items[0].buyer!.recipientIds, ["b1"]);
});

// ── rollup: some done, none failed, rest pending = active ─────────────────────
test("rollup some scheduled + rest pending (no failures) = active", () => {
  const items = [fbItem({ execution: { status: "scheduled" } }), buyerItem({ status: "approved" })];
  assert.equal(rollupPlanStatus(items), "active");
});
