// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.8 · EXECUTIVE DECISION ENGINE (PURE).
//
// A PRIORITIZATION layer. Given canonical evidence that ALREADY EXISTS, name
// the at-most-three decisions that deserve executive attention now.
//
// WHAT THIS FILE REFUSES TO DO (QA-locked):
//   · compute a score — ordering reuses UPSTREAM priorities (the queue's own
//     priority/confidence numbers and the Coach's attention judgment) with the
//     same deterministic tie-breaks the projection already uses. No new
//     prioritization arithmetic exists here.
//   · create a recommendation — recommendedAction is always an EXISTING
//     canonical action (queue suggestedAction / coach next step), verbatim.
//   · invent a fact — every sentence is assembled from provider-carried
//     labels; every decision carries evidence references.
//   · fabricate urgency — when nothing deserves attention the single honest
//     decision is "אין פעולה ניהולית נדרשת כרגע".
//   · compute confidence — inherited from upstream or null. Never derived.
//   · speak in speculation — "בהתבסס על…" / "הראיה הקנונית הנוכחית…", never
//     "נראה ש" / "כנראה" / "probably".
// ============================================================================
import type { CoachOverview } from "@/lib/journey-coach/engine";
import type {
  DecisionAudience, DecisionQueueItem, ExecutiveDecision, ExecutiveDecisions,
} from "./types";
import type { DecisionCategory } from "./types";

/** Existing intelligence areas → allowed decision categories. Nothing new. */
const AREA_CATEGORY: Record<string, DecisionCategory> = {
  journey: "Journey",
  deal: "Pipeline",
  buyer: "Pipeline",
  seller: "Pipeline",
  acquisition: "Opportunities",
  office: "Office",
  daily: "Performance",
};

const MAX_DECISIONS = 3;

/** Deterministic upstream ordering — the SAME comparator family the shared
 *  projection uses (priority ↓, confidence ↓, id ↑). No new arithmetic. */
const byUpstreamPriority = (a: DecisionQueueItem, b: DecisionQueueItem): number =>
  (b.priority - a.priority) || (b.confidence - a.confidence) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function fromQueueItem(item: DecisionQueueItem, rank: number): ExecutiveDecision {
  return {
    id: `decision:queue:${item.id}`,
    category: AREA_CATEGORY[item.area] ?? "Performance",
    priority: rank,
    upstreamPriority: item.priority,
    headline: item.title,
    summary: `בהתבסס על תור המודיעין הקנוני: ${item.why}`,
    whyNow: `בהתבסס על ההמלצה הקנונית ${item.id} — דחיפות "${item.urgency}" ועדיפות ${item.priority} בתור, מגובה ב-${item.evidence.length} ראיות. זו ההמלצה הפעילה במקום ה-${rank} בתור כרגע.`,
    recommendedAction: item.suggestedAction,
    expectedImpact: item.expectedImpact,
    evidence: [
      { label: item.title, source: "broker-intelligence queue", recommendationId: item.id },
      ...item.evidence.map((e) => ({ label: e.label, source: e.source, recommendationId: item.id })),
    ],
    affectedEntities: [{ entityType: item.entityType, entityId: item.entityId, title: item.title, href: item.href }],
    confidence: item.confidence,                     // inherited — the recommendation's own number
    links: item.href ? [item.href] : [],
  };
}

/** A coach-flagged journey WITHOUT a queue recommendation (verified stall /
 *  recorded blocker). The action is the coach's own next step — not invented. */
function fromCoachBriefing(b: CoachOverview["briefings"][number], rank: number): ExecutiveDecision {
  return {
    id: `decision:coach:${b.facts.journeyId}`,
    category: "Journey",
    priority: rank,
    upstreamPriority: null,
    headline: `מסע הדורש טיפול: ${b.facts.entityName} · ${b.facts.stageLabel}`,
    summary: b.situation,
    whyNow: b.whyThisMatters,
    recommendedAction: b.recommendedNextStep,
    expectedImpact: b.expectedOutcome,
    evidence: b.facts.evidenceRefs.map((r) => ({
      label: r.label, source: r.source, recommendationId: r.recommendationId, journeyId: r.journeyId,
    })),
    affectedEntities: [{ entityType: b.facts.journeyType, entityId: b.facts.journeyId, title: b.facts.entityName, href: b.facts.href }],
    confidence: b.confidence.value,                  // inherited from the coach (itself inherited-or-null)
    links: [b.facts.href],
  };
}

/** Coverage gap — a canonical data-quality FACT (records without a canonical
 *  journey), stated from the shared projection's own audited numbers. */
function coverageDecision(coverageValue: number, fallbackRecords: number, rank: number): ExecutiveDecision {
  return {
    id: "decision:coverage:journey-records",
    category: "Data Quality",
    priority: rank,
    upstreamPriority: null,
    headline: `כיסוי ראיות מסעות: ${coverageValue}% — ${fallbackRecords} רשומות ללא מסע קנוני`,
    summary: `בהתבסס על ההקרנה הקנונית: ${fallbackRecords} רשומות תאימות פועלות ללא מסע קנוני, כך שמצבן אינו ניתן למדידה מגובת-ראיות.`,
    whyNow: `הראיה הקנונית הנוכחית: כיסוי הראיות עומד על ${coverageValue}% — כל עוד קיימות רשומות ללא מסע קנוני, חלק מהעסק אינו מדיד.`,
    recommendedAction: "תיעוד האירוע העסקי הבא של כל רשומת תאימות ייצור עבורה מסע קנוני (הזרימה הקיימת — ללא כלי חדש).",
    expectedImpact: "העלאת כיסוי הראיות — יותר מהעסק נמדד על בסיס ראיות מאומתות.",
    evidence: [{ label: `כיסוי ראיות מסעות ${coverageValue}% · ${fallbackRecords} רשומות גיבוי`, source: "executive journey projection (coverage)" }],
    affectedEntities: [],
    confidence: null,                                // no upstream confidence exists for coverage
    links: ["/journeys"],
  };
}

const NO_ACTION: Omit<ExecutiveDecision, "priority"> = {
  id: "decision:none",
  category: "Performance",
  upstreamPriority: null,
  headline: "אין פעולה ניהולית נדרשת כרגע",
  summary: "בהתבסס על כלל הראיות הקנוניות הזמינות: אין החלטה ניהולית שעומדת ברף הראיות כרגע.",
  whyNow: "הראיה הקנונית הנוכחית אינה מצביעה על סיכון, תקיעה או הזדמנות שעומדים ברף — אפס כנה, לא עדות לתקינות מוחלטת.",
  recommendedAction: "אין פעולה נדרשת. ההמלצה הבאה תופיע כשראיה קנונית תעמוד ברף.",
  expectedImpact: "לא נטענת תוצאה — אין החלטה פעילה.",
  evidence: [{ label: "תור המודיעין הקנוני ריק מהמלצות ברף הראיות; אין מסע תקוע/חסום מאומת", source: "broker-intelligence queue + journey-coach" }],
  affectedEntities: [],
  confidence: null,
  links: [],
};

export interface DecisionInputs {
  /** Canonical queue items, verbatim (lifecycle-filtered upstream). */
  queueItems: DecisionQueueItem[];
  /** The Journey Coach overview (already member-safe, already evidence-native). */
  coach: CoachOverview | null;
  audience: DecisionAudience;
}

/** Org-level categories that only managers see. Facts are never altered —
 *  visibility of ORG-scope decisions is the only audience difference. */
const MANAGER_ONLY: DecisionCategory[] = ["Data Quality", "Coverage", "Office"];

export function buildExecutiveDecisions(input: DecisionInputs): ExecutiveDecisions {
  const basis: string[] = ["broker-intelligence queue", "journey-coach"];
  const candidates: ExecutiveDecision[] = [];

  // 1 · Canonical queue recommendations — the primary decision source.
  //     insufficient-evidence items are NEVER decisions (no fabricated urgency).
  const eligible = input.queueItems.filter((q) => !q.insufficientEvidence).sort(byUpstreamPriority);
  for (const q of eligible) candidates.push(fromQueueItem(q, candidates.length + 1));

  // 2 · Coach-flagged journeys not already covered by a queue recommendation.
  const covered = new Set(eligible.map((q) => `${q.entityType}:${q.entityId}`));
  for (const b of input.coach?.briefings ?? []) {
    if (!b.needsAttention || b.facts.recommendation) continue;
    if (covered.has(`${b.facts.journeyType}:${b.facts.journeyId}`)) continue;
    candidates.push(fromCoachBriefing(b, candidates.length + 1));
  }

  // 3 · Coverage gap — a real canonical fact, ranked last (never urgent).
  const proj = input.coach?.projection ?? null;
  if (proj && proj.coverage.value !== null && proj.audit.fallbackRecords > 0) {
    candidates.push(coverageDecision(proj.coverage.value, proj.audit.fallbackRecords, candidates.length + 1));
  }

  // Audience visibility: org-scope categories are manager-only. Facts of the
  // remaining decisions are untouched.
  const visible = candidates.filter((d) => input.audience === "manager" || !MANAGER_ONLY.includes(d.category));

  // TOP THREE — never more. Re-rank ordinally after the visibility filter.
  const top = visible.slice(0, MAX_DECISIONS).map((d, i) => ({ ...d, priority: i + 1 }));

  if (top.length === 0) {
    return { decisions: [{ ...NO_ACTION, priority: 1 }], noActionRequired: true, audience: input.audience, basis };
  }
  return { decisions: top, noActionRequired: false, audience: input.audience, basis };
}
