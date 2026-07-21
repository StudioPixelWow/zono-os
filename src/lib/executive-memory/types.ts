// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.9 · EXECUTIVE MEMORY — types.
//
// Executive Memory answers ONE question: "מה השתנה מאז הביקור האחרון?"
// It is NOT another decision engine / coach / analytics / recommendation
// system. It observes the EXISTING Executive Decisions over time by comparing
// immutable snapshots. It never recomputes, never reprioritizes, never judges.
// ============================================================================
import type { DecisionAudience, DecisionCategory } from "@/lib/executive-decision/types";

/** One decision as REMEMBERED — canonical identities + the diffable fields.
 *  No duplicated facts beyond what change detection needs. */
export interface MemoryDecisionEntry {
  decisionId: string;              // the Decision Engine's deterministic id
  category: DecisionCategory;
  priority: number;                // ordinal rank as issued (1..3)
  upstreamPriority: number | null; // the upstream number it derived from
  confidence: number | null;       // inherited-or-null, verbatim
  headline: string;
  recommendedAction: string;       // the EXISTING upstream action, verbatim
  /** Canonical evidence identities (recommendationId / journeyId / label). */
  evidenceIds: string[];
}

/** One immutable snapshot row. */
export interface MemorySnapshot {
  id: string;
  orgScoped: true;                 // rows are RLS org-scoped; orgId never leaves the DB layer
  audience: DecisionAudience;
  takenAt: string;
  entries: MemoryDecisionEntry[];
  noActionRequired: boolean;
}

/** The ONLY change kinds Memory detects. No heuristics, no interpretation. */
export type MemoryChangeKind =
  | "NEW_DECISION" | "REMOVED_DECISION" | "PRIORITY_CHANGED"
  | "CONFIDENCE_CHANGED" | "EVIDENCE_CHANGED" | "CATEGORY_CHANGED" | "ACTION_CHANGED";

export interface MemoryChange {
  kind: MemoryChangeKind;
  decisionId: string;
  headline: string;
  /** Human line in the mandated language ("נוספה החלטה" / "עדיפות השתנתה"…). */
  detail: string;
  /** Old/new values for the changed field, verbatim (null when N/A). */
  from: string | null;
  to: string | null;
  oldSnapshotId: string | null;    // null when there is no previous snapshot
  newSnapshotId: string;
}

export interface MemoryTimelineItem {
  snapshotId: string;
  takenAt: string;
  decisionIds: string[];
  noActionRequired: boolean;
}

export interface ExecutiveMemoryReport {
  /** "מאז הביקור האחרון…" — assembled ONLY from detected changes. */
  summary: string;
  newDecisions: MemoryChange[];
  resolvedDecisions: MemoryChange[];
  priorityChanges: MemoryChange[];
  confidenceChanges: MemoryChange[];
  evidenceChanges: MemoryChange[];
  categoryChanges: MemoryChange[];
  actionChanges: MemoryChange[];
  /** Snapshot history within the retention window, newest first. */
  timeline: MemoryTimelineItem[];
  /** TRUE on the very first review (nothing to compare against). */
  firstReview: boolean;
  audience: DecisionAudience;
  previousSnapshotAt: string | null;
  currentSnapshotId: string;
}

/** Retention is configurable; snapshots outside the window are not read. */
export const DEFAULT_RETENTION_DAYS = 90;
