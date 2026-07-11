// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.3 · Backfill PLANNER (PURE).
//
// Decides WHAT the backfill should do for one legacy source row. Performs
// nothing. Every decision is offline-testable, which is the whole point: the
// rules that must never be violated (no regression, no guess, no duplicate,
// event-driven wins) are enforced here, not in a SQL script nobody can test.
//
// The four safety invariants, in one place:
//   1. NO REGRESSION      — a canonical journey is never moved backward.
//   2. EVENT WINS         — a journey with source='event' is newer truth than any
//                           legacy row; the backfill may enrich it, never move it.
//   3. NO GUESS           — unmappable/ambiguous → `conflict`, never a written stage.
//   4. NO FABRICATION     — history is one `legacy_backfill` snapshot, never an
//                           invented ladder of transitions the business never had.
// ============================================================================
import type { JourneyType } from "@/lib/journey-canonical";
import {
  isBackfillable, mostAdvancedStage, stagePosition,
  type ResolvedStage,
} from "@/lib/journey-canonical";

/** One legacy record, already resolved against the canonical vocabulary. */
export interface BackfillCandidate {
  orgId: string;
  journeyType: JourneyType;
  entityType: string;
  /** ALWAYS the canonical entity id (for deals: public.deals.id, never a profile id). */
  entityId: string;
  /** Where the row came from — kept in metadata, never invented. */
  sourceTable: string;
  sourceRowId: string;
  /** Resolved evidence from the LEGACY journey row (may be absent). */
  legacyStage: ResolvedStage | null;
  /** Resolved evidence from the ENTITY's own lifecycle field (may be absent). */
  entityStage: ResolvedStage | null;
  /** Real timestamps from the source. Never synthesised. */
  legacyUpdatedAt: string | null;
  entityUpdatedAt: string | null;
  startedAt: string | null;
  ownerUserId: string | null;
  /** Set when the entity the row points at does not exist / is in another org. */
  anomaly?: "missing_entity" | "cross_org";
}

/** The canonical journey that already exists for this entity, if any. */
export interface ExistingJourney {
  id: string;
  currentStage: string;
  status: string;
  source: string | null;   // 'event' = written by the kernel = newest truth
}

export type BackfillAction =
  | { kind: "create"; stage: string; reason: string; quality: string }
  | { kind: "advance"; journeyId: string; from: string; to: string; reason: string; quality: string }
  | { kind: "unchanged"; journeyId: string; reason: string }
  | { kind: "skip"; reason: string }
  | { kind: "conflict"; reason: string; detail: string };

export interface BackfillDecision {
  candidate: BackfillCandidate;
  action: BackfillAction;
  /** Preserved verbatim on the written row. Legacy truth is never lost. */
  evidence: Record<string, unknown>;
}

/**
 * Decide what to do with ONE candidate. Deterministic, side-effect free.
 */
export function planBackfill(
  c: BackfillCandidate,
  existing: ExistingJourney | null,
): BackfillDecision {
  const evidence: Record<string, unknown> = {
    sourceTable: c.sourceTable,
    sourceRowId: c.sourceRowId,
    legacyStage: c.legacyStage ? { raw: c.legacyStage.legacy, vocabulary: c.legacyStage.vocabulary, canonical: c.legacyStage.canonical, quality: c.legacyStage.quality } : null,
    entityStage: c.entityStage ? { raw: c.entityStage.legacy, vocabulary: c.entityStage.vocabulary, canonical: c.entityStage.canonical, quality: c.entityStage.quality } : null,
    legacyUpdatedAt: c.legacyUpdatedAt,
    entityUpdatedAt: c.entityUpdatedAt,
  };
  const decide = (action: BackfillAction): BackfillDecision => ({ candidate: c, action, evidence });

  // ── 0. Structural anomalies are never written, only reported. ─────────────
  if (c.anomaly === "missing_entity") {
    return decide({ kind: "conflict", reason: "missing_entity", detail: `${c.entityType} ${c.entityId} does not exist` });
  }
  if (c.anomaly === "cross_org") {
    return decide({ kind: "conflict", reason: "cross_org", detail: `${c.sourceTable}:${c.sourceRowId} points at an entity in another organization` });
  }

  // ── 1. Resolve the target from the evidence we actually have. ─────────────
  const legacyOk = c.legacyStage && isBackfillable(c.legacyStage) ? c.legacyStage.canonical : null;
  const entityOk = c.entityStage && isBackfillable(c.entityStage) ? c.entityStage.canonical : null;

  if (!legacyOk && !entityOk) {
    const bad = c.legacyStage ?? c.entityStage;
    if (bad && (bad.quality === "unmappable" || bad.quality === "ambiguous")) {
      return decide({
        kind: "conflict",
        reason: bad.quality === "ambiguous" ? "ambiguous_stage" : "unmappable_stage",
        detail: `${bad.vocabulary}='${bad.legacy}' — ${bad.note ?? "no canonical peer"}; NOT guessed`,
      });
    }
    return decide({ kind: "skip", reason: "no_stage_evidence" });
  }

  // Two real truths about the same entity → take the more advanced one. This is
  // the rule, not a preference: the legacy property_journeys rows are all stale
  // (untouched since creation) while properties.status kept moving.
  const target = mostAdvancedStage(c.journeyType, legacyOk, entityOk)!;
  const chosen = target === entityOk && target !== legacyOk ? c.entityStage! : (c.legacyStage ?? c.entityStage!);
  const quality = chosen.quality;
  evidence.chosenFrom = chosen.vocabulary;
  evidence.chosenBecause = legacyOk && entityOk && legacyOk !== entityOk
    ? `two real evidences disagreed (legacy='${legacyOk}', entity='${entityOk}') — took the more advanced, never backward`
    : "single evidence";

  // ── 2. No canonical journey yet → create one, opened at the real stage. ───
  if (!existing) {
    return decide({
      kind: "create",
      stage: target,
      quality,
      reason: `legacy_backfill from ${c.sourceTable}`,
    });
  }

  // ── 3. A canonical journey exists. The kernel's own state is NEWER TRUTH than
  //       any legacy row — a legacy backfill must never move it.
  if (existing.source === "event") {
    return decide({
      kind: "unchanged",
      journeyId: existing.id,
      reason: `event-driven journey at '${existing.currentStage}' wins over legacy '${target}' — legacy never overrides the kernel`,
    });
  }

  // ── 4. Same stage → nothing to do (this is what makes a re-run a no-op). ──
  if (existing.currentStage === target) {
    return decide({ kind: "unchanged", journeyId: existing.id, reason: "already at the backfilled stage (idempotent re-run)" });
  }

  // ── 5. Would this move the journey BACKWARD? Then refuse. ────────────────
  const pExisting = stagePosition(c.journeyType, existing.currentStage);
  const pTarget = stagePosition(c.journeyType, target);
  if (pTarget <= pExisting) {
    return decide({
      kind: "unchanged",
      journeyId: existing.id,
      reason: `canonical journey is already at '${existing.currentStage}' (position ${pExisting}); legacy evidence '${target}' (position ${pTarget}) would regress it`,
    });
  }

  return decide({
    kind: "advance",
    journeyId: existing.id,
    from: existing.currentStage,
    to: target,
    quality,
    reason: `legacy_backfill from ${c.sourceTable}`,
  });
}

export interface BackfillTotals {
  candidates: number;
  created: number;
  advanced: number;
  unchanged: number;
  skipped: number;
  conflicts: number;
}

export function summarize(decisions: BackfillDecision[]): BackfillTotals {
  const t: BackfillTotals = { candidates: decisions.length, created: 0, advanced: 0, unchanged: 0, skipped: 0, conflicts: 0 };
  for (const d of decisions) {
    if (d.action.kind === "create") t.created++;
    else if (d.action.kind === "advance") t.advanced++;
    else if (d.action.kind === "unchanged") t.unchanged++;
    else if (d.action.kind === "skip") t.skipped++;
    else t.conflicts++;
  }
  return t;
}
