// ============================================================================
// ZONO — Office Intelligence core: deterministic proof (pure, mocks-free).
// Run: node --experimental-strip-types --test scripts/office-intelligence-tests/intelligence-core.test.ts
// Covers the matrix: empty/new office, low sample → insufficient_data, funnel,
// lead-source high-vol-low-progression vs low-vol-high-progression, fast/slow
// response cohorts, no first-response data, deal bottleneck, high-demand-low-
// progression property, inventory gap / no gap, lost reasons, deterministic
// ordering, confidence gating, and the NO-CAUSALITY language guarantee.
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFunnel, analyzeLeadSources, analyzeResponseTime, analyzeFollowupGap,
  analyzeDealBottleneck, classifyPropertyDemand, analyzeInventoryGaps, analyzeLostReasons,
  analyzeMarketing, buildRecommendations, pickHeroInsight, isLearningOffice,
  confidenceForSample, ratePct, type Insight,
} from "../../src/lib/office/intelligence-core.ts";

// Forbidden causal words (Phase 34) — must never appear in generated text.
const CAUSAL = ["גרם", "גרמה", "caused", "because of", "בגלל ש"];
function assertNoCausality(texts: string[]) {
  for (const t of texts) for (const w of CAUSAL) assert.ok(!t.includes(w), `causal word "${w}" in: ${t}`);
}
function allText(i: Insight | null): string[] { return i ? [i.title, i.explanation, ...i.evidence] : []; }

// ── A/Z) new office learning + insufficient data ─────────────────────────────
test("A new office → learning state", () => {
  assert.equal(isLearningOffice({ leads: 2, deals: 0, properties: 1 }), true);
  assert.equal(isLearningOffice({ leads: 40, deals: 5, properties: 20 }), false);
});
test("confidence gating by sample size", () => {
  assert.equal(confidenceForSample(5), "insufficient_data");
  assert.equal(confidenceForSample(15), "moderate");
  assert.equal(confidenceForSample(40), "strong");
});

// ── C) funnel ────────────────────────────────────────────────────────────────
test("C funnel conversions computed only between supported steps", () => {
  const f = buildFunnel([
    { key: "new", label: "לידים", count: 100 },
    { key: "contacted", label: "נוצר קשר", count: 60 },
    { key: "viewing", label: "ביקור", count: 15 },
  ]);
  assert.equal(f[0].conversionFromPrev, null);
  assert.equal(f[1].conversionFromPrev, 60);
  assert.equal(f[2].conversionFromPrev, 25);
});

// ── D/E) lead source: high-vol-low-progression vs low-vol-high-progression ──
test("D+E lead source insight compares SHARE, not volume; no 'best by count'", () => {
  const a = analyzeLeadSources([
    { source: "facebook", label: "פייסבוק", leads: 50, contacted: 40, progressed: 5, deals: 1 },   // high vol, 10% share
    { source: "google", label: "גוגל", leads: 20, contacted: 18, progressed: 8, deals: 3 },          // low vol, 40% share
  ]);
  assert.ok(a.insight);
  assert.match(a.insight!.title, /גוגל/);           // higher share wins, not higher volume
  assertNoCausality(allText(a.insight));
});
test("lead source: no insight when only one source has enough leads", () => {
  const a = analyzeLeadSources([{ source: "facebook", label: "פייסבוק", leads: 50, contacted: 40, progressed: 5, deals: 1 }, { source: "ref", label: "המלצה", leads: 3, contacted: 2, progressed: 1, deals: 0 }]);
  assert.equal(a.insight, null);
});

// ── F/G/H) response time cohorts ─────────────────────────────────────────────
test("F+G response time: faster cohort progressed more (associative, gated)", () => {
  const r = analyzeResponseTime([
    { band: "עד שעה", leads: 40, progressed: 20 },   // 50%
    { band: "1-4 שעות", leads: 30, progressed: 9 },
    { band: "מעל יממה", leads: 20, progressed: 4 },   // 20%
  ]);
  assert.ok(r.insight);
  assert.equal(r.confidence, "strong");
  assertNoCausality(allText(r.insight));
  assert.match(r.insight!.explanation, /לא הוכחת סיבתיות|התאמה שנצפתה/);
});
test("H no first-response data → insufficient_data insight, honest wording", () => {
  const r = analyzeResponseTime([{ band: "עד שעה", leads: 2, progressed: 1 }]);
  assert.equal(r.confidence, "insufficient_data");
  assert.match(r.insight!.title, /אין עדיין מספיק נתונים/);
});

// ── follow-up gap ────────────────────────────────────────────────────────────
test("follow-up gap insight when active leads have no next action", () => {
  const i = analyzeFollowupGap({ activeLeads: 40, noNextAction: 12, overdue: 5 });
  assert.ok(i);
  assert.equal(i!.type, "followup_gap");
  assert.equal(i!.actionLabel, "פתח חריגים");
});
test("no follow-up gap insight when clean", () => {
  assert.equal(analyzeFollowupGap({ activeLeads: 40, noNextAction: 0, overdue: 0 }), null);
});

// ── I) deal bottleneck ───────────────────────────────────────────────────────
test("I deal bottleneck surfaces the markedly-slower stage", () => {
  const a = analyzeDealBottleneck([
    { stage: "negotiation", label: "משא ומתן", medianDays: 12, count: 6 },
    { stage: "qualified", label: "מוסמך", medianDays: 3, count: 8 },
    { stage: "contract", label: "חוזה", medianDays: 4, count: 5 },
  ]);
  assert.ok(a.insight);
  assert.match(a.insight!.title, /משא ומתן/);
  assertNoCausality(allText(a.insight));
});
test("no bottleneck when stages are balanced", () => {
  const a = analyzeDealBottleneck([{ stage: "a", label: "א", medianDays: 4, count: 5 }, { stage: "b", label: "ב", medianDays: 5, count: 5 }]);
  assert.equal(a.insight, null);
});

// ── M) high-match low-viewing property ───────────────────────────────────────
test("M property high demand low progression classified + insight", () => {
  const a = classifyPropertyDemand([
    { propertyId: "p1", title: "הרצל 18", matches: 9, interested: 4, viewings: 0, deals: 0 },
    { propertyId: "p2", title: "ויצמן 3", matches: 8, interested: 3, viewings: 2, deals: 0 },
  ]);
  assert.equal(a.highDemandLowProgression.length, 1);
  assert.equal(a.highDemandLowProgression[0].propertyId, "p1");
  assert.ok(a.insight);
  assertNoCausality(allText(a.insight));
});
test("low-demand property classified", () => {
  const a = classifyPropertyDemand([{ propertyId: "p3", title: "x", matches: 0, interested: 0, viewings: 0, deals: 0 }]);
  assert.equal(a.lowDemand.length, 1);
});

// ── K/L) inventory gap ───────────────────────────────────────────────────────
test("K inventory gap from real clusters (high demand, low inventory)", () => {
  const a = analyzeInventoryGaps([
    { area: "רחובות", propertyType: "דירה", roomsBucket: "4 חדרים", activeBuyers: 14, inventory: 3, gapBand: "high" },
    { area: "יבנה", propertyType: "דירה", roomsBucket: "3 חדרים", activeBuyers: 2, inventory: 5, gapBand: "low" },
  ]);
  assert.equal(a.gaps.length, 1);
  assert.match(a.insight!.title, /רחובות/);
});
test("L no gap when inventory matches demand", () => {
  const a = analyzeInventoryGaps([{ area: "יבנה", propertyType: "דירה", roomsBucket: "3", activeBuyers: 2, inventory: 5, gapBand: "low" }]);
  assert.equal(a.gaps.length, 0);
  assert.equal(a.insight, null);
});

// ── lost reasons only from structured input ──────────────────────────────────
test("lost reasons aggregated from structured objections", () => {
  const i = analyzeLostReasons([{ reason: "price", label: "מחיר", count: 6 }, { reason: "timing", label: "תזמון", count: 3 }]);
  assert.ok(i);
  assert.match(i!.title, /מחיר/);
});
test("lost reasons suppressed under sample", () => {
  assert.equal(analyzeLostReasons([{ reason: "price", label: "מחיר", count: 2 }]), null);
});

// ── marketing correlation-safe ───────────────────────────────────────────────
test("W marketing summary uses correlation language, no fabricated attribution", () => {
  const i = analyzeMarketing({ publications: 20, propertiesPublished: 8, matchSends: 30, responses: 6, failures: 2, propertiesNoMarketing: 3 });
  assert.ok(i);
  assertNoCausality(allText(i));
  assert.match(i!.explanation, /לא בייחוס סיבתי/);
});

// ── recommendations rule-based, skip insufficient ────────────────────────────
test("recommendations are rule-based and skip insufficient_data", () => {
  const insights: Insight[] = [
    { id: "a", type: "followup_gap", severity: "attention", title: "t", explanation: "e", evidence: [], confidence: "moderate" },
    { id: "b", type: "response_time", severity: "info", title: "t", explanation: "e", evidence: [], confidence: "insufficient_data" },
  ];
  const recs = buildRecommendations(insights);
  assert.equal(recs.length, 1);
});

// ── hero insight picks highest severity+confidence ───────────────────────────
test("hero insight = highest severity then confidence; ignores insufficient", () => {
  const insights: Insight[] = [
    { id: "info", type: "marketing", severity: "info", title: "t", explanation: "e", evidence: [], confidence: "strong" },
    { id: "crit", type: "deal_bottleneck", severity: "critical", title: "t", explanation: "e", evidence: [], confidence: "moderate" },
    { id: "insf", type: "response_time", severity: "critical", title: "t", explanation: "e", evidence: [], confidence: "insufficient_data" },
  ];
  assert.equal(pickHeroInsight(insights)?.id, "crit");
  assert.equal(pickHeroInsight([{ id: "x", type: "marketing", severity: "info", title: "t", explanation: "e", evidence: [], confidence: "insufficient_data" }]), null);
});

// ── V) deterministic same input ──────────────────────────────────────────────
test("V deterministic: same input → same output", () => {
  const input = [{ source: "a", label: "A", leads: 30, contacted: 20, progressed: 10, deals: 2 }, { source: "b", label: "B", leads: 25, contacted: 20, progressed: 2, deals: 0 }];
  assert.deepEqual(analyzeLeadSources(input).rows.map((r) => r.source), analyzeLeadSources(input).rows.map((r) => r.source));
});

// ── safe math ────────────────────────────────────────────────────────────────
test("ratePct null-safe on zero denominator", () => {
  assert.equal(ratePct(5, 0), null);
  assert.equal(ratePct(1, 4), 25);
});
