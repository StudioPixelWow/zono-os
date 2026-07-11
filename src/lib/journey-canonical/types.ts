// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.1 · Canonical Journey · types (PURE).
// Client-safe. No I/O, no server imports.
//
// This module is the SINGLE source of truth for journey stage vocabulary.
// It does not introduce a new Journey system: it names the stages that the
// EXISTING `journeys` + `journey_events` tables persist, and that the EXISTING
// kernel journey-subscriber (wired in 5.2) and journey services consume.
// ============================================================================

/** The five journey subjects ZONO tracks. `journeys.journey_type`. */
export type JourneyType = "buyer" | "seller" | "lead" | "property" | "deal";

/** `journeys.entity_type` — 1:1 with JourneyType today, kept separate because
 *  the spine is entity-agnostic by design (a future journey type could hang off
 *  an existing entity). */
export type JourneyEntityType = JourneyType;

/**
 * What a stage MEANS for the journey's lifecycle. Terminal-ness and outcome are
 * a property of the stage — never re-derived by callers, so every surface agrees.
 */
export type StageKind = "open" | "won" | "lost" | "paused" | "inactive";

/** Canonical `journeys.status`. Derived from the current stage's kind. */
export type JourneyStatus = "active" | "won" | "lost" | "paused" | "inactive";

export interface CanonicalStage {
  key: string;
  /** Hebrew label — ZONO is an RTL product; the label lives with the stage. */
  label: string;
  /** 1-based order within the machine. Drives progress + advance/regress. */
  position: number;
  kind: StageKind;
  /** True for every non-"open" kind. Precomputed for callers. */
  terminal: boolean;
  /**
   * A lateral stage sits OUTSIDE the linear ladder (e.g. seller `churn_risk`):
   * it is open and workable, but moving into it is never an "advance" — it
   * demands attention. Modelled explicitly so position alone never mislabels it.
   */
  lateral?: boolean;
}

export interface StageMachine {
  journeyType: JourneyType;
  entityType: JourneyEntityType;
  /** Ordered: open stages first (by position), then terminals. */
  stages: CanonicalStage[];
  /** The stage a journey opens in. */
  initial: string;
}

/** How a proposed move relates to the machine. */
export type TransitionKind = "advance" | "regress" | "close" | "reopen" | "noop";

export interface TransitionResult {
  ok: boolean;
  kind: TransitionKind;
  /** Hebrew-free machine reason, safe to store in `journey_events.reason`. */
  reason: string;
  from: string;
  to: string;
}

/**
 * The canonical shape a stage transition writes. Mirrors the (now extended)
 * `journey_events` columns exactly, so the 5.2 subscriber has nothing to invent.
 */
export interface StageTransition {
  journeyType: JourneyType;
  fromStage: string | null;
  toStage: string;
  kind: TransitionKind;
  status: JourneyStatus;
  reason: string;
  /** Which timestamp column the transition sets on `journeys`, if any. */
  timestampField: "completed_at" | "lost_at" | "paused_at" | null;
  /** Facts the transition was derived from → `journey_events.evidence`. */
  evidence: Record<string, unknown>;
}
