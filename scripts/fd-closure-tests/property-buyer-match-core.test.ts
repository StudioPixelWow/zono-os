// ============================================================================
// ZONO — Property⇄buyer "why matched" PURE coverage. Reasons are evidence-backed
// only (no invented "why"); fits respect open-ended budget/rooms bands; area match
// is loose-contains both ways; labels are Hebrew and omit when unknown; buyer stage
// never leaks a raw English enum.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/property-buyer-match-core.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetFits, roomsFits, matchedArea, buildWhyReasons,
  budgetLabel, roomsLabel, areasLabel, stageLabelHe, matchTone,
  type BuyerCriteria,
} from "../../src/lib/matching-intelligence/property-buyer-match-core.ts";

const C = (o: Partial<BuyerCriteria> = {}): BuyerCriteria => ({
  budgetMin: 1_000_000, budgetMax: 1_500_000, roomsMin: 4, roomsMax: 5, preferredAreas: ["קרית ביאליק"], ...o,
});
const hasHebrew = (s: string) => /[֐-׿]/.test(s);

test("budgetFits respects band + open-ended bounds", () => {
  assert.equal(budgetFits(C(), 1_200_000), true);
  assert.equal(budgetFits(C(), 1_600_000), false);
  assert.equal(budgetFits(C({ budgetMin: null }), 500_000), true);   // only max
  assert.equal(budgetFits(C({ budgetMax: null }), 9_000_000), true); // only min
  assert.equal(budgetFits(C({ budgetMin: null, budgetMax: null }), 1_000_000), false); // no band → no claim
  assert.equal(budgetFits(C(), null), false);
});

test("roomsFits respects band", () => {
  assert.equal(roomsFits(C(), 4), true);
  assert.equal(roomsFits(C(), 6), false);
  assert.equal(roomsFits(C({ roomsMin: null, roomsMax: null }), 4), false);
});

test("matchedArea is loose-contains both directions", () => {
  assert.equal(matchedArea(C(), "קרית ביאליק", null), "קרית ביאליק");
  assert.equal(matchedArea(C({ preferredAreas: ["ביאליק"] }), "קרית ביאליק", null), "ביאליק");
  assert.equal(matchedArea(C(), "חיפה", null), null);
  assert.equal(matchedArea(C({ preferredAreas: [] }), "קרית ביאליק", null), null);
});

test("buildWhyReasons returns only evidence-backed Hebrew reasons", () => {
  const reasons = buildWhyReasons(C(), { price: 1_200_000, city: "קרית ביאליק", neighborhood: null, rooms: 4 });
  assert.ok(reasons.length >= 2);
  for (const r of reasons) { assert.ok(r.ok); assert.ok(hasHebrew(r.label)); }
  const labels = reasons.map((r) => r.label);
  assert.ok(labels.some((l) => l.includes("קרית ביאליק")));
  assert.ok(labels.some((l) => l.includes("תקציב")));
  // no match at all → empty (caller shows the honest fallback)
  assert.deepEqual(buildWhyReasons(C({ preferredAreas: [], budgetMin: null, budgetMax: null, roomsMin: null, roomsMax: null }), { price: 1, city: "x", neighborhood: null, rooms: 9 }), []);
});

test("labels are Hebrew and omit when unknown", () => {
  assert.equal(budgetLabel(C()), "₪1M–₪1.5M");
  assert.equal(budgetLabel(C({ budgetMin: null })), "עד ₪1.5M");
  assert.equal(budgetLabel(C({ budgetMin: null, budgetMax: null })), null);
  assert.equal(roomsLabel(C()), "4–5 חד׳");
  assert.equal(roomsLabel(C({ roomsMin: 4, roomsMax: 4 })), "4 חד׳");
  assert.equal(roomsLabel(C({ roomsMin: null, roomsMax: null })), null);
  assert.equal(areasLabel(C({ preferredAreas: ["א", "ב", "ג", "ד"] })), "א, ב, ג");
  assert.equal(areasLabel(C({ preferredAreas: [] })), null);
});

test("buyer stage → Hebrew, raw enum never leaks", () => {
  assert.equal(stageLabelHe("qualified"), "מוסמך");
  assert.equal(stageLabelHe("hot"), "חם");
  assert.equal(stageLabelHe("some_internal_stage"), null); // unknown ASCII → omitted
  assert.equal(stageLabelHe("בחיפוש"), "בחיפוש");          // already Hebrew passes
  assert.equal(stageLabelHe(null), null);
});

test("matchTone thresholds", () => {
  assert.equal(matchTone(80), "good");
  assert.equal(matchTone(50), "medium");
  assert.equal(matchTone(20), "risk");
  assert.equal(matchTone(null), "risk");
});
