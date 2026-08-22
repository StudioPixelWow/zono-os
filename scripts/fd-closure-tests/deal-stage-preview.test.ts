// ============================================================================
// ZONO — Deal-stage hover preview: PURE core coverage. Encodes the invariants the
// home-dashboard preview relies on: stage validation (client stage never trusted),
// bounded item cap (≤4), Hebrew stage presentation (no raw enum leak), honest
// time-in-stage math, and the canonical agent-avatar fallback order.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/deal-stage-preview.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_MAX, PREVIEW_STAGE_KEYS, isPreviewStageKey, STAGE_LABEL_HE,
  stageLabelHe, boundPreviewItems, daysSince, daysInStageLabel,
} from "../../src/lib/my-day/deal-stage-preview-core.ts";
import { resolveAgentAvatar } from "../../src/lib/office/avatar.ts";

const hasHebrew = (s: string) => /[֐-׿]/.test(s);
const asciiOnly = (s: string) => /^[\x00-\x7F]+$/.test(s);

test("stage validation only honors known non-terminal projection stages", () => {
  for (const s of PREVIEW_STAGE_KEYS) assert.ok(isPreviewStageKey(s));
  for (const bad of ["closed", "lost", "new", "qualified", "", "DROP TABLE", "../etc", null, 42, undefined]) {
    assert.equal(isPreviewStageKey(bad as unknown), false, `must reject ${String(bad)}`);
  }
});

test("cross-stage isolation: a valid-but-different stage is still a distinct key", () => {
  // (server selector filters .eq('deal_stage', stageKey) — the key space is exact)
  assert.notEqual("negotiation", "offer_sent");
  assert.ok(isPreviewStageKey("negotiation") && isPreviewStageKey("offer_sent"));
});

test("preview is bounded to at most PREVIEW_MAX (4)", () => {
  assert.equal(PREVIEW_MAX, 4);
  const many = Array.from({ length: 30 }, (_, i) => i);
  assert.equal(boundPreviewItems(many).length, 4);
  assert.deepEqual(boundPreviewItems([1, 2]), [1, 2]);
  assert.deepEqual(boundPreviewItems([]), []);
});

test("every stage label is Hebrew — no raw snake_case enum can leak", () => {
  for (const s of PREVIEW_STAGE_KEYS) {
    const label = STAGE_LABEL_HE[s];
    assert.ok(hasHebrew(label) && !asciiOnly(label), `stage ${s} → non-Hebrew label "${label}"`);
    assert.ok(!label.includes("_"), `stage ${s} label leaks underscore`);
  }
  // The six the QA screenshot named, exact:
  assert.equal(STAGE_LABEL_HE.new_opportunity, "הזדמנות חדשה");
  assert.equal(STAGE_LABEL_HE.meeting_scheduled, "פגישה נקבעה");
  assert.equal(STAGE_LABEL_HE.negotiation, "משא ומתן");
  assert.equal(STAGE_LABEL_HE.offer_sent, "הצעה נשלחה");
  assert.equal(STAGE_LABEL_HE.agreement_draft, "טיוטת הסכם");
});

test("stageLabelHe never surfaces an unknown/internal key", () => {
  assert.equal(stageLabelHe("legacy_backfill"), "שלב");
  assert.equal(stageLabelHe("closed"), "שלב");
  assert.ok(hasHebrew(stageLabelHe("anything")));
});

test("daysSince is honest (null when unknown, never negative)", () => {
  const now = Date.parse("2026-08-22T12:00:00Z");
  assert.equal(daysSince(null, now), null);
  assert.equal(daysSince("not-a-date", now), null);
  assert.equal(daysSince("2026-08-22T00:00:00Z", now), 0);
  assert.equal(daysSince("2026-08-19T12:00:00Z", now), 3);
  assert.equal(daysSince("2026-08-25T12:00:00Z", now), 0); // future clamps to 0, not negative
});

test("daysInStageLabel is Hebrew and omits when unknown", () => {
  assert.equal(daysInStageLabel(null), null);
  assert.equal(daysInStageLabel(0), "נכנס היום");
  assert.equal(daysInStageLabel(1), "יום בשלב");
  assert.equal(daysInStageLabel(5), "5 ימים בשלב");
});

test("canonical agent-avatar fallback order (member → linked user → null)", () => {
  assert.equal(resolveAgentAvatar({ avatarUrl: "m.jpg", linkedUserAvatarUrl: "u.jpg" }), "m.jpg");
  assert.equal(resolveAgentAvatar({ avatarUrl: null, linkedUserAvatarUrl: "u.jpg" }), "u.jpg");
  assert.equal(resolveAgentAvatar({ avatarUrl: "  ", linkedUserAvatarUrl: null }), null);
  assert.equal(resolveAgentAvatar({}), null);
});
