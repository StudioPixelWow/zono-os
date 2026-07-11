// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5 · SHARED CANONICAL COCKPIT JOURNEY MODEL.
//
// Every entity cockpit (Buyer / Seller / Lead / Property / Deal) has been showing
// its OWN lifecycle. The property cockpit had the worst of it: JourneyPanel wrote
// straight into `property_journeys` through setJourneyStage() — no buildTransition(),
// no journey_events, no domain event. Batch 5.3 retired ensureJourney and
// advanceStage as canonical writers, but that UI writer was never in scope, so a
// broker clicking "advance" moved the LEGACY table while the canonical spine sat
// still. Two lifecycles for one property.
//
// 5.5 gives all five cockpits ONE model, read from the spine, with the same shape:
//   canonical journey → this record. No canonical journey → fallback, MARKED.
//
// This file is types only. The assembler is pure (assemble.ts) so every rule below
// is testable without a database.
// ============================================================================
import type { JourneyType } from "@/lib/journey-canonical";

/** The entities that own a canonical journey. Mirrors journey-center's type. */
export type CockpitEntityType = "buyer" | "seller" | "lead" | "property" | "deal";

/** One rung of the canonical ladder, as the cockpit renders it. */
export interface CockpitStage {
  key: string;
  label: string;
  index: number;
  done: boolean;
  current: boolean;
  terminal: boolean;
}

/** One REAL transition, read from journey_events. Never fabricated. */
export interface CockpitTransition {
  id: string;
  fromStage: string | null;
  fromLabel: string | null;
  toStage: string;
  toLabel: string;
  occurredAt: string | null;
  /** Why it moved. Null when the source event carried no reason — not invented. */
  reason: string | null;
  /** Who moved it. NULL when the kernel did it — an honest null, not "System". */
  actorUserId: string | null;
  /** 'event' | 'compat' | 'legacy_backfill' — where this transition came from. */
  source: string | null;
}

/** A blocker is an OBSERVED fact, never a guess. */
export interface CockpitBlocker {
  kind: "stalled" | "paused" | "non_canonical_stage" | "no_owner";
  message: string;
}

/** Links out of the journey to real surfaces. `href` must always resolve. */
export interface CockpitLink {
  kind: CockpitEntityType | "document" | "task" | "meeting";
  id: string;
  label: string;
  href: string;
}

/**
 * The ONE journey block every cockpit renders. Anything unknown stays null —
 * a cockpit that invents a stage is worse than a cockpit that admits it has none.
 */
export interface CockpitJourney {
  // identity
  journeyId: string | null;          // null ⇒ fallback (no canonical journey yet)
  journeyType: JourneyType;
  entityType: CockpitEntityType;
  entityId: string;

  // lifecycle position — all of it from the canonical machine
  currentStage: string;
  stageLabel: string;
  ladder: CockpitStage[];
  progress: number;
  status: string;                    // active | paused | won | lost | …
  terminal: boolean;

  // time
  stageEnteredAt: string | null;
  stageAgeDays: number | null;       // null ⇒ unmeasurable, NOT 0
  lastActivityAt: string | null;

  // provenance — the cockpit must never hide where its truth came from
  source: "canonical" | "fallback";
  canonicalSource: string | null;    // journeys.source when canonical
  fallback: boolean;
  fallbackReason: string | null;

  // evidence
  history: CockpitTransition[];      // REAL journey_events, newest first
  blockers: CockpitBlocker[];
  nextMilestone: { key: string; label: string } | null;  // next rung, if any
  recommendation: string | null;     // null unless a real engine produced one

  // context
  ownerUserId: string | null;
  openTasks: number;
  upcomingMeetingAt: string | null;
  linked: CockpitLink[];

  /** Which canonical commands are legal RIGHT NOW (5.5G). Never render a dead one. */
  allowedCommands: CockpitCommand[];
}

/** The canonical commands. A command absent from `allowedCommands` is NOT rendered. */
export type CockpitCommand = "advance" | "override" | "pause" | "resume" | "block" | "unblock";

/** What the assembler needs that does not live on the journey row. */
export interface CockpitFacts {
  ownerUserId: string | null;
  openTasks: number;
  upcomingMeetingAt: string | null;
  linked: CockpitLink[];
  recommendation: string | null;
}
