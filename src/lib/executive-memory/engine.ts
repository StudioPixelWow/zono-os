// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.9 · EXECUTIVE MEMORY diff engine (PURE).
//
// Deterministic snapshot comparison. Nothing else.
//   · READ-ONLY over decisions: entries are SELECTED from ExecutiveDecision
//     fields verbatim — no recomputation, no reprioritization, no judgment.
//   · Detects ONLY: NEW / REMOVED / PRIORITY / CONFIDENCE / EVIDENCE /
//     CATEGORY / ACTION changes. No business conclusions, no inferred causes,
//     no success/failure opinions.
//   · Stable ordering everywhere (decision id ascending). No randomization.
//   · Language contract: "מאז הביקור האחרון…", "נוספה החלטה", "הוסרה החלטה",
//     "עדיפות השתנתה", "הראיות השתנו" — never "המערכת חושבת"/"כנראה"/"נראה ש".
// ============================================================================
import type { ExecutiveDecision } from "@/lib/executive-decision/types";
import type {
  ExecutiveMemoryReport, MemoryChange, MemoryDecisionEntry, MemorySnapshot, MemoryTimelineItem,
} from "./types";

const byId = <T extends { decisionId: string }>(a: T, b: T) =>
  a.decisionId < b.decisionId ? -1 : a.decisionId > b.decisionId ? 1 : 0;

/** ExecutiveDecision → remembered entry. Pure SELECTION — fields verbatim. */
export function toMemoryEntries(decisions: ExecutiveDecision[]): MemoryDecisionEntry[] {
  return decisions
    .map((d) => ({
      decisionId: d.id,
      category: d.category,
      priority: d.priority,
      upstreamPriority: d.upstreamPriority,
      confidence: d.confidence,
      headline: d.headline,
      recommendedAction: d.recommendedAction,
      // Canonical evidence identities, deduplicated, stable order.
      evidenceIds: [...new Set(d.evidence.map((e) => e.recommendationId ?? e.journeyId ?? e.label))].sort(),
    }))
    .sort(byId);
}

const num = (n: number | null) => (n === null ? "—" : String(n));

/** Compare two snapshots. Pure, deterministic, stable. */
export function diffSnapshots(prev: MemorySnapshot | null, curr: MemorySnapshot): Omit<ExecutiveMemoryReport,
  "timeline" | "audience"> {
  const oldId = prev?.id ?? null;
  const mk = (kind: MemoryChange["kind"], e: MemoryDecisionEntry, detail: string, from: string | null, to: string | null): MemoryChange =>
    ({ kind, decisionId: e.decisionId, headline: e.headline, detail, from, to, oldSnapshotId: oldId, newSnapshotId: curr.id });

  const prevMap = new Map((prev?.entries ?? []).map((e) => [e.decisionId, e]));
  const currMap = new Map(curr.entries.map((e) => [e.decisionId, e]));

  const newDecisions: MemoryChange[] = [];
  const resolvedDecisions: MemoryChange[] = [];
  const priorityChanges: MemoryChange[] = [];
  const confidenceChanges: MemoryChange[] = [];
  const evidenceChanges: MemoryChange[] = [];
  const categoryChanges: MemoryChange[] = [];
  const actionChanges: MemoryChange[] = [];

  for (const e of curr.entries) {
    const old = prevMap.get(e.decisionId);
    if (!old) {
      if (prev) newDecisions.push(mk("NEW_DECISION", e, `נוספה החלטה: ${e.headline}`, null, e.headline));
      continue;
    }
    if (old.priority !== e.priority || old.upstreamPriority !== e.upstreamPriority) {
      priorityChanges.push(mk("PRIORITY_CHANGED", e,
        `עדיפות השתנתה: ${e.headline} — מ-${old.priority} (עדיפות מקור ${num(old.upstreamPriority)}) ל-${e.priority} (עדיפות מקור ${num(e.upstreamPriority)})`,
        `${old.priority}/${num(old.upstreamPriority)}`, `${e.priority}/${num(e.upstreamPriority)}`));
    }
    if (old.confidence !== e.confidence) {
      confidenceChanges.push(mk("CONFIDENCE_CHANGED", e,
        `ביטחון ההמלצה השתנה: ${e.headline} — מ-${num(old.confidence)} ל-${num(e.confidence)}`,
        num(old.confidence), num(e.confidence)));
    }
    if (JSON.stringify(old.evidenceIds) !== JSON.stringify(e.evidenceIds)) {
      evidenceChanges.push(mk("EVIDENCE_CHANGED", e,
        `הראיות השתנו: ${e.headline} — ${old.evidenceIds.length} ← ${e.evidenceIds.length} הפניות`,
        old.evidenceIds.join(" | "), e.evidenceIds.join(" | ")));
    }
    if (old.category !== e.category) {
      categoryChanges.push(mk("CATEGORY_CHANGED", e,
        `קטגוריה השתנתה: ${e.headline} — מ-${old.category} ל-${e.category}`, old.category, e.category));
    }
    if (old.recommendedAction !== e.recommendedAction) {
      actionChanges.push(mk("ACTION_CHANGED", e,
        `הפעולה המומלצת השתנתה: ${e.headline}`, old.recommendedAction, e.recommendedAction));
    }
  }
  for (const old of prev?.entries ?? []) {
    if (!currMap.has(old.decisionId)) {
      resolvedDecisions.push(mk("REMOVED_DECISION", old, `הוסרה החלטה: ${old.headline}`, old.headline, null));
    }
  }

  // Stable ordering everywhere.
  for (const arr of [newDecisions, resolvedDecisions, priorityChanges, confidenceChanges, evidenceChanges, categoryChanges, actionChanges]) {
    arr.sort(byId);
  }

  const total = newDecisions.length + resolvedDecisions.length + priorityChanges.length
    + confidenceChanges.length + evidenceChanges.length + categoryChanges.length + actionChanges.length;

  const summary = !prev
    ? "זהו סיור הביקורת הראשון — אין תמונת מצב קודמת להשוואה. תמונת המצב הנוכחית נשמרה."
    : total === 0
      ? `מאז הביקור האחרון (${prev.takenAt.slice(0, 16).replace("T", " ")}): אין שינוי בהחלטות הניהוליות — אותן ${curr.entries.length} החלטות, אותן עדיפויות, אותן ראיות.`
      : `מאז הביקור האחרון (${prev.takenAt.slice(0, 16).replace("T", " ")}): ${newDecisions.length} החלטות נוספו · ${resolvedDecisions.length} הוסרו · ${priorityChanges.length} שינויי עדיפות · ${confidenceChanges.length} שינויי ביטחון · ${evidenceChanges.length} שינויי ראיות.`;

  return {
    summary,
    newDecisions, resolvedDecisions, priorityChanges, confidenceChanges,
    evidenceChanges, categoryChanges, actionChanges,
    firstReview: !prev,
    previousSnapshotAt: prev?.takenAt ?? null,
    currentSnapshotId: curr.id,
  };
}

/** Snapshot history → timeline items. Pure selection, newest first. */
export function toTimeline(snapshots: MemorySnapshot[]): MemoryTimelineItem[] {
  return snapshots
    .map((s) => ({
      snapshotId: s.id,
      takenAt: s.takenAt,
      decisionIds: s.entries.map((e) => e.decisionId).sort(),
      noActionRequired: s.noActionRequired,
    }))
    .sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0));
}

/** Two entry sets are equal ⇔ nothing to persist (append-only dedup). */
export function entriesEqual(a: MemoryDecisionEntry[], b: MemoryDecisionEntry[]): boolean {
  return JSON.stringify([...a].sort(byId)) === JSON.stringify([...b].sort(byId));
}
