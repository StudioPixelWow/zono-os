// ============================================================================
// ZONO — Creative Director QA kind-awareness (Part B). Pure, deterministic.
// Run: npx tsx --test scripts/creative-qa-kind-tests/decide-creative-kind.test.ts
// Proves property-centric hard-fails apply ONLY to property-subject kinds, that
// thresholds were NOT lowered, and that bad creative of either kind still fails.
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideCreative, isPropertySubjectKind, CREATIVE_THRESHOLDS, NO_CREATIVE_HARD_FAILS,
  type CreativeScores, type CreativeHardFails,
} from "@/lib/creative-studio/creative-qa";

// Scores comfortably at/above every threshold (overallWow≥85, conversion≥85,
// visualImpact≥85, realEstateCredibility≥90).
const GOOD: CreativeScores = {
  visualImpact: 90, realEstateCredibility: 92, premiumFeeling: 90, brandConsistency: 90,
  conversionPotential: 88, typographyQuality: 90, layoutQuality: 90, imageComposition: 90, overallWow: 88,
};
const hf = (over: Partial<CreativeHardFails> = {}): CreativeHardFails => ({ ...NO_CREATIVE_HARD_FAILS, ...over });

// 1. property kind keeps ALL property-centric hard-fails.
test("1 property: textDominatesProperty is a hard-fail", () => {
  const d = decideCreative(GOOD, hf({ textDominatesProperty: true }), true, "property");
  assert.equal(d.passed, false);
  assert.ok(d.hardFailures.includes("הטקסט משתלט על הנכס"));
});
test("1b property: priceNotDominant + propertyImageTooSmall are hard-fails", () => {
  assert.equal(decideCreative(GOOD, hf({ priceNotDominant: true }), true, "property").passed, false);
  assert.equal(decideCreative(GOOD, hf({ propertyImageTooSmall: true }), true, "property").passed, false);
});

// 2. testimonial is NOT rejected merely because text dominates the property.
test("2 testimonial: textDominatesProperty does NOT fail (good scores + proud)", () => {
  const d = decideCreative(GOOD, hf({ textDominatesProperty: true, priceNotDominant: true, propertyImageTooSmall: true }), true, "testimonial");
  assert.equal(d.passed, true, d.reasons.join("; "));
  assert.equal(d.hardFailures.length, 0);
});

// 3. sold: the property-centric trio is suppressed (the word נמכר is the hero, no price).
test("3 sold: property-centric hard-fails suppressed", () => {
  const d = decideCreative(GOOD, hf({ textDominatesProperty: true, priceNotDominant: true, propertyImageTooSmall: true }), true, "sold");
  assert.equal(d.passed, true, d.reasons.join("; "));
});

// 4. omitted / unknown kind → deterministic STRICT (property-subject) behavior.
test("4 omitted kind fails safe (strict): textDominatesProperty rejects", () => {
  assert.equal(decideCreative(GOOD, hf({ textDominatesProperty: true }), true, null).passed, false);
  assert.equal(decideCreative(GOOD, hf({ textDominatesProperty: true }), true, undefined).passed, false);
  assert.equal(decideCreative(GOOD, hf({ textDominatesProperty: true }), true, "").passed, false);
});
test("4b unknown kind fails safe (strict)", () => {
  assert.equal(decideCreative(GOOD, hf({ textDominatesProperty: true }), true, "banana").passed, false);
});

// 5. thresholds were NOT globally lowered.
test("5 CREATIVE_THRESHOLDS unchanged", () => {
  assert.deepEqual({ ...CREATIVE_THRESHOLDS }, { overallWow: 85, conversionPotential: 85, visualImpact: 85, realEstateCredibility: 90 });
});

// 6. a bad recommendation still fails QA for LEGITIMATE reasons.
test("6a testimonial with low score still fails (threshold, not lowered)", () => {
  const low = { ...GOOD, overallWow: 80 };
  const d = decideCreative(low, hf({ textDominatesProperty: true }), true, "testimonial");
  assert.equal(d.passed, false);
  assert.ok(d.reasons.some((r) => r.includes("WOW")));
});
test("6b testimonial with a non-property hard-fail still fails", () => {
  assert.equal(decideCreative(GOOD, hf({ uglyCollage: true }), true, "testimonial").passed, false);
  assert.equal(decideCreative(GOOD, hf({ looksAiGenerated: true }), true, "testimonial").passed, false);
});
test("6c testimonial not proudToPublish still fails", () => {
  const d = decideCreative(GOOD, hf(), false, "testimonial");
  assert.equal(d.passed, false);
  assert.ok(d.reasons.includes("משווק מוביל לא יפרסם את זה בגאווה"));
});

// 7. a bad property creative still fails EXACTLY as before; a clean one passes.
test("7 property: unchanged behavior (bad fails, clean passes)", () => {
  assert.equal(decideCreative(GOOD, hf({ textDominatesProperty: true }), true, "property").passed, false);
  assert.equal(decideCreative(GOOD, hf(), true, "property").passed, true);
});

// 8. the classifier itself.
test("8 isPropertySubjectKind classification", () => {
  assert.equal(isPropertySubjectKind("property"), true);
  assert.equal(isPropertySubjectKind("sold"), false);
  assert.equal(isPropertySubjectKind("testimonial"), false);
  assert.equal(isPropertySubjectKind(null), true);
  assert.equal(isPropertySubjectKind(undefined), true);
  assert.equal(isPropertySubjectKind(""), true);
  assert.equal(isPropertySubjectKind("banana"), true);
});
