// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.1 · Canonical transitions (PURE).
// Validates a proposed stage move against the machine and produces the EXACT
// row shape `journeys` + `journey_events` need. Deterministic, no I/O.
//
// Real estate is non-linear: skipping rungs is legitimate (a hot buyer can go
// `new` → `negotiation`). So the machine does not enforce a rigid adjacency
// matrix — it enforces the rules that actually protect data integrity:
//   · unknown stages are rejected outright
//   · a WON journey is final (nothing reopens a closed win)
//   · terminal → open is a REOPEN, never a silent advance
//   · lateral stages (seller churn_risk) are never "progress"
//   · same-stage is a no-op and must NOT append a history row
// ============================================================================
import { stageDef } from "./machines";
import type {
  JourneyStatus,
  JourneyType,
  StageKind,
  StageTransition,
  TransitionResult,
} from "./types";

/** The `journeys.status` a stage implies. Single mapping, used everywhere. */
export function statusForKind(kind: StageKind): JourneyStatus {
  switch (kind) {
    case "won": return "won";
    case "lost": return "lost";
    case "paused": return "paused";
    case "inactive": return "inactive";
    default: return "active";
  }
}

/** Which `journeys` timestamp column the stage stamps, if any. */
export function timestampFieldForKind(kind: StageKind): StageTransition["timestampField"] {
  switch (kind) {
    case "won": return "completed_at";
    case "lost": return "lost_at";
    case "paused":
    case "inactive": return "paused_at";
    default: return null;
  }
}

/**
 * Can the journey move from → to?
 * `from = null` means the journey is being opened.
 */
export function validateTransition(
  journeyType: JourneyType,
  from: string | null,
  to: string,
): TransitionResult {
  const r = (ok: boolean, kind: TransitionResult["kind"], reason: string): TransitionResult =>
    ({ ok, kind, reason, from: from ?? "", to });

  const toDef = stageDef(journeyType, to);
  if (!toDef) return r(false, "noop", "unknown_target_stage");

  // Opening the journey.
  if (from === null || from === "") return r(true, "advance", "journey_opened");

  const fromDef = stageDef(journeyType, from);
  if (!fromDef) return r(false, "noop", "unknown_source_stage");

  // Same stage → no history row. This is what stops a replayed event from
  // appending a duplicate transition even before the DB unique index bites.
  if (from === to) return r(false, "noop", "same_stage");

  // A win is final. Nothing — no event, no replay, no manual move — reopens it.
  if (fromDef.kind === "won") return r(false, "noop", "journey_won_is_final");

  // Leaving any other terminal (lost / inactive / paused) back into work.
  if (fromDef.terminal && !toDef.terminal) return r(true, "reopen", "journey_reopened");

  // Entering a terminal stage.
  if (toDef.terminal) return r(true, "close", `journey_closed_${toDef.kind}`);

  // Lateral (seller churn_risk): open and workable, but never forward progress.
  if (toDef.lateral) return r(true, "regress", "lateral_attention_required");
  if (fromDef.lateral) return r(true, "advance", "recovered_from_lateral");

  // Both on the ladder.
  return toDef.position > fromDef.position
    ? r(true, "advance", "stage_advanced")
    : r(true, "regress", "stage_regressed");
}

/**
 * Build the canonical transition to persist, or null when the move is invalid
 * or a no-op. Callers (the 5.2 subscriber, the UI action) never construct rows
 * by hand — they take what this returns.
 */
export function buildTransition(
  journeyType: JourneyType,
  from: string | null,
  to: string,
  opts: { reason?: string; evidence?: Record<string, unknown> } = {},
): StageTransition | null {
  const v = validateTransition(journeyType, from, to);
  if (!v.ok) return null;

  const toDef = stageDef(journeyType, to)!;
  return {
    journeyType,
    fromStage: from && from.length ? from : null,
    toStage: to,
    kind: v.kind,
    status: statusForKind(toDef.kind),
    reason: opts.reason ?? v.reason,
    timestampField: timestampFieldForKind(toDef.kind),
    evidence: opts.evidence ?? {},
  };
}

/** True when the move would change nothing — the caller should skip the write. */
export function isNoop(journeyType: JourneyType, from: string | null, to: string): boolean {
  return validateTransition(journeyType, from, to).kind === "noop";
}
