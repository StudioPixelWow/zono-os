// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5B · COCKPIT JOURNEY ASSEMBLER (PURE).
//
// Turns the canonical spine (`journeys` + `journey_events`) into the ONE record
// every entity cockpit renders (5.5A · CockpitJourney). No I/O, no server imports,
// no Supabase — so every rule below is testable offline (qa.ts) and the same code
// can run in a Client Component.
//
// THE RULES THIS FILE ENFORCES (each one exists because a surface broke it):
//
//  1. The ladder, the labels and the progress come from the canonical machine.
//     A cockpit never owns a stage vocabulary. (Five vocabularies is how we got here.)
//  2. History is REAL journey_events. If there are no events, history is empty —
//     we never synthesise "moved to X" from the journey row's current stage.
//  3. Unknown stays null. stageAgeDays null ⇒ unmeasurable, never 0. actorUserId
//     null ⇒ the kernel did it, never "System". reason null ⇒ the event carried
//     none, never invented.
//  4. Blockers are OBSERVED facts (stalled / paused / non-canonical stage / no owner).
//     No heuristics, no "probably".
//  5. A command absent from `allowedCommands` is NOT RENDERED. Not disabled — absent.
//     A fallback record has NO canonical journey, therefore NO legal commands: the
//     cure for "the UI wrote to the legacy table" is not a prettier legacy writer.
//  6. Lateral and paused stages hold their last REAL ladder position (walked out of
//     journey_events), so a paused seller does not read as "0% done".
// ============================================================================
import {
  isValidStage, ladder, stageDef, stageLabel, stageProgress,
  type JourneyType,
} from "@/lib/journey-canonical";
import type { CanonicalJourneyRow } from "@/lib/journey-center/canonical";
import type {
  CockpitBlocker, CockpitCommand, CockpitEntityType, CockpitFacts,
  CockpitJourney, CockpitStage, CockpitTransition,
} from "./types";

/**
 * One `journey_events` row as the cockpit needs it. Richer than journey-center's
 * CanonicalTransition (which carries only the LAST transition and drops the id):
 * the cockpit renders the whole history, so it needs the row identity and the
 * evidence blob that tells us where the transition came from.
 */
export interface CockpitEventRow {
  id: string;
  journeyId: string;
  eventType: string;                       // 'journey_opened' | 'stage_change' | …
  fromStage: string | null;
  toStage: string | null;
  occurredAt: string | null;
  reason: string | null;
  actorUserId: string | null;
  evidence: Record<string, unknown> | null;
}

export interface AssembleCanonicalInput {
  journey: CanonicalJourneyRow;
  /** journey_events for THIS journey. Any order — the assembler sorts. */
  events: CockpitEventRow[];
  facts: CockpitFacts;
  nowMs: number;
}

export interface AssembleFallbackInput {
  entityType: CockpitEntityType;
  entityId: string;
  /** Why there is no canonical journey. Always shown to the broker. */
  reason: string;
  /** A legacy/derived stage ALREADY resolved to the canonical vocabulary, or null. */
  canonicalStage: string | null;
  facts: CockpitFacts;
  nowMs: number;
}

const DAY = 86_400_000;

/** A journey nobody has moved in this long is STALLED. Same threshold as 5.4. */
export const STALL_DAYS = 14;

/** Max history rows a cockpit renders. Older transitions stay in journey_events. */
export const HISTORY_LIMIT = 50;

const daysSince = (iso: string | null | undefined, nowMs: number): number | null => {
  if (!iso) return null;                                   // unmeasurable ⇒ null, NOT 0
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / DAY));
};

const eventTime = (e: CockpitEventRow): number => {
  const t = e.occurredAt ? Date.parse(e.occurredAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Where a transition came from. `journey_events` has no `source` column — the
 * writers put it in `evidence`, so that is where we read it from, and when it
 * is not there we say null rather than guessing.
 *   · backfill (5.3)  → evidence.source = 'legacy_backfill' | 'compat'
 *   · kernel   (5.2)  → evidence.sourceEvent = '<domain event type>'  ⇒ 'event'
 */
export function transitionSource(e: CockpitEventRow): string | null {
  const ev = e.evidence;
  if (ev && typeof ev.source === "string" && ev.source) return ev.source;
  if (ev && typeof ev.sourceEvent === "string" && ev.sourceEvent) return "event";
  return null;
}

/** journey_events → cockpit history. Newest first. Nothing fabricated. */
export function buildHistory(jt: JourneyType, events: CockpitEventRow[]): CockpitTransition[] {
  return [...events]
    .filter((e) => !!e.toStage)                           // a transition with no destination is not a transition
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, HISTORY_LIMIT)
    .map((e) => {
      const to = e.toStage as string;
      return {
        id: e.id,
        fromStage: e.fromStage,
        fromLabel: e.fromStage ? stageLabel(jt, e.fromStage) : null,
        toStage: to,
        toLabel: stageLabel(jt, to),
        occurredAt: e.occurredAt,
        reason: e.reason,                                  // null stays null
        actorUserId: e.actorUserId,                        // null = the kernel, honestly
        source: transitionSource(e),
      };
    });
}

/**
 * The rendered ladder. `ladder()` returns the OPEN, non-lateral rungs — the linear
 * spine of the machine. When the journey is sitting on a terminal or lateral stage
 * (won / lost / churn_risk / paused) that stage is NOT a rung, so we append it as a
 * final one and mark it current: the cockpit must be able to draw where the journey
 * actually is, without pretending it is somewhere on the ladder it is not.
 */
export function buildLadder(jt: JourneyType, currentStage: string): CockpitStage[] {
  const rungs = ladder(jt);
  const def = stageDef(jt, currentStage);
  const idx = rungs.findIndex((s) => s.key === currentStage);
  const won = def?.kind === "won";
  const offLadder = !!def && idx < 0;                      // terminal or lateral

  const out: CockpitStage[] = rungs.map((s, i) => ({
    key: s.key,
    label: s.label,
    index: i,
    // Won ⇒ the whole ladder was completed. Otherwise only the rungs BEHIND us.
    // Off-ladder-and-not-won (lost / paused / churn_risk): we do not know from the
    // stage alone how far it got, so nothing is claimed done — walkBack() below
    // recovers the real position from journey_events when it exists.
    done: won ? true : idx >= 0 && i < idx,
    current: idx >= 0 && i === idx,
    terminal: s.terminal,
  }));

  if (offLadder && def) {
    out.push({
      key: def.key, label: def.label, index: out.length,
      done: false, current: true, terminal: def.terminal,
    });
  }

  // An unknown (non-canonical) stage: no rung is current. The blocker says why.
  return out;
}

/**
 * The last stage on the LINEAR ladder this journey actually reached, walked out of
 * real history. Used only when the current stage is off-ladder (paused / lateral),
 * where the canonical `stageProgress()` deliberately returns 0 and tells the caller
 * to supply the last known ladder stage. Returns null when history proves nothing.
 */
export function lastLadderStage(jt: JourneyType, history: CockpitTransition[]): string | null {
  const rungs = new Set(ladder(jt).map((s) => s.key));
  for (const h of history) {                               // newest → oldest
    if (rungs.has(h.toStage)) return h.toStage;
    if (h.fromStage && rungs.has(h.fromStage)) return h.fromStage;
  }
  return null;
}

/** Progress that survives pause and lateral stages. Never re-derives the scale. */
export function progressFor(jt: JourneyType, currentStage: string, history: CockpitTransition[]): number {
  const def = stageDef(jt, currentStage);
  if (!def) return 0;                                      // non-canonical ⇒ claim nothing
  if (def.kind === "won") return 100;
  if (def.kind === "lost" || def.kind === "inactive") return 0;
  if (def.lateral || def.kind === "paused") {
    const back = lastLadderStage(jt, history);
    return back ? stageProgress(jt, back) : 0;
  }
  return stageProgress(jt, currentStage);
}

/** The next rung, if the ladder has one. Terminal / off-ladder ⇒ null, not a guess. */
export function nextMilestoneFor(jt: JourneyType, currentStage: string): { key: string; label: string } | null {
  const rungs = ladder(jt);
  const idx = rungs.findIndex((s) => s.key === currentStage);
  if (idx < 0) return null;                                // terminal, lateral or unknown
  const next = rungs[idx + 1];
  return next ? { key: next.key, label: next.label } : null;
}

/** True when the journey is explicitly blocked. A flag on the row, not a mood. */
export function isBlocked(j: Pick<CanonicalJourneyRow, "metadata">): boolean {
  return j.metadata?.blocked === true;
}

/** OBSERVED blockers only. Every one of these is a fact we can point at. */
export function buildBlockers(
  jt: JourneyType,
  j: CanonicalJourneyRow,
  stageAgeDays: number | null,
  terminal: boolean,
  nowMs: number,
): CockpitBlocker[] {
  const out: CockpitBlocker[] = [];
  const stalled = !terminal && stageAgeDays !== null && stageAgeDays >= STALL_DAYS;

  if (stalled) {
    out.push({
      kind: "stalled",
      message: `תקוע ${stageAgeDays} ימים בשלב "${stageLabel(jt, j.currentStage)}"`,
    });
  }
  if (j.status === "paused") {
    const since = daysSince(j.stageEnteredAt, nowMs);
    out.push({
      kind: "paused",
      message: since === null ? "המסע מושהה" : `המסע מושהה (${since} ימים)`,
    });
  }
  if (!isValidStage(jt, j.currentStage)) {
    out.push({
      kind: "non_canonical_stage",
      message: `שלב לא-קנוני "${j.currentStage}" — לא קיים במכונת ה-${jt}`,
    });
  }
  if (!terminal && !j.ownerUserId) {
    out.push({ kind: "no_owner", message: "אין בעלים למסע" });
  }
  return out;
}

/**
 * 5.5G — WHICH COMMANDS ARE LEGAL RIGHT NOW.
 *
 * Anything not returned here is not rendered at all. The rules:
 *   · no canonical journey (fallback) ⇒ NOTHING. There is no journey to command,
 *     and the old answer — write the legacy table from the UI — is the defect 5.5
 *     exists to kill.
 *   · non-canonical current stage      ⇒ only `override`. You cannot advance from a
 *     stage the machine does not know; you can only correct it.
 *   · terminal (won/lost/inactive)     ⇒ only `override`. A closed journey is not
 *     paused, advanced or blocked — it is reopened by correcting its stage.
 *   · paused                           ⇒ `resume` + `override`. Not advance: resume first.
 *   · blocked                          ⇒ `unblock` + `override`. Same reason.
 *   · active                           ⇒ `advance` (only if a next rung EXISTS),
 *                                        `pause`, `block`, `override`.
 */
export function allowedCommandsFor(
  jt: JourneyType,
  j: CanonicalJourneyRow | null,
  terminal: boolean,
): CockpitCommand[] {
  if (!j) return [];                                       // fallback ⇒ no canonical journey ⇒ no commands
  if (!isValidStage(jt, j.currentStage)) return ["override"];
  if (terminal) return ["override"];
  if (j.status === "paused") return ["resume", "override"];
  if (isBlocked(j)) return ["unblock", "override"];

  const cmds: CockpitCommand[] = [];
  if (nextMilestoneFor(jt, j.currentStage)) cmds.push("advance");  // no next rung ⇒ no advance button
  cmds.push("pause", "block", "override");
  return cmds;
}

// ── THE ASSEMBLER ───────────────────────────────────────────────────────────

/** Canonical journey → the ONE cockpit record. */
export function assembleCockpitJourney(input: AssembleCanonicalInput): CockpitJourney {
  const { journey: j, events, facts, nowMs } = input;
  const jt = j.journeyType;
  const def = stageDef(jt, j.currentStage);
  const terminal = !!def?.terminal;

  const history = buildHistory(jt, events.filter((e) => e.journeyId === j.id));
  const stageEnteredAt = j.stageEnteredAt ?? j.startedAt ?? null;
  const stageAgeDays = daysSince(stageEnteredAt, nowMs);

  return {
    journeyId: j.id,                                       // the REAL spine id
    journeyType: jt,
    entityType: j.entityType as CockpitEntityType,
    entityId: j.entityId,

    currentStage: j.currentStage,
    stageLabel: stageLabel(jt, j.currentStage),            // falls back to the raw key if unknown
    ladder: buildLadder(jt, j.currentStage),
    progress: progressFor(jt, j.currentStage, history),
    status: j.status,
    terminal,

    stageEnteredAt,
    stageAgeDays,
    lastActivityAt: j.lastActivityAt,

    source: "canonical",
    canonicalSource: j.source,                             // 'event' | 'compat' | 'legacy_backfill'
    fallback: false,
    fallbackReason: null,

    history,
    blockers: buildBlockers(jt, j, stageAgeDays, terminal, nowMs),
    nextMilestone: nextMilestoneFor(jt, j.currentStage),
    recommendation: facts.recommendation,                  // null unless a real engine produced one

    ownerUserId: j.ownerUserId,
    openTasks: facts.openTasks,
    upcomingMeetingAt: facts.upcomingMeetingAt,
    linked: facts.linked,

    allowedCommands: allowedCommandsFor(jt, j, terminal),
  };
}

/**
 * No canonical journey yet. The cockpit still renders — but it renders the TRUTH:
 * a marked compatibility record with an empty history and no commands. It does not
 * borrow a stage from a legacy table and pretend the spine agrees.
 */
export function fallbackCockpitJourney(input: AssembleFallbackInput): CockpitJourney {
  const { entityType, entityId, reason, canonicalStage, facts } = input;
  const jt = entityType as JourneyType;
  const stage = canonicalStage && isValidStage(jt, canonicalStage) ? canonicalStage : "";
  const def = stage ? stageDef(jt, stage) : undefined;
  const terminal = !!def?.terminal;

  return {
    journeyId: null,                                       // null ⇒ fallback. The whole contract.
    journeyType: jt,
    entityType,
    entityId,

    currentStage: stage,
    stageLabel: stage ? stageLabel(jt, stage) : "—",       // unknown stays "—", never a made-up stage
    ladder: stage ? buildLadder(jt, stage) : [],
    progress: stage ? progressFor(jt, stage, []) : 0,
    status: "unknown",
    terminal,

    stageEnteredAt: null,
    stageAgeDays: null,                                    // unmeasurable ⇒ null, NOT 0
    lastActivityAt: null,

    source: "fallback",
    canonicalSource: null,
    fallback: true,
    fallbackReason: reason,

    history: [],                                           // there are no real events. So: none.
    blockers: [{ kind: "non_canonical_stage", message: `אין מסע קנוני — ${reason}` }],
    nextMilestone: stage ? nextMilestoneFor(jt, stage) : null,
    recommendation: facts.recommendation,

    ownerUserId: facts.ownerUserId,
    openTasks: facts.openTasks,
    upcomingMeetingAt: facts.upcomingMeetingAt,
    linked: facts.linked,

    allowedCommands: [],                                   // 5.5G: nothing to command. Render nothing.
  };
}

/** Empty facts — for callers that have no context to add yet. Never invents any. */
export const NO_FACTS: CockpitFacts = {
  ownerUserId: null,
  openTasks: 0,
  upcomingMeetingAt: null,
  linked: [],
  recommendation: null,
};
