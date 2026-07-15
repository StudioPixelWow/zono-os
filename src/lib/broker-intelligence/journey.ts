// ============================================================================
// 🧭 ZONO OS 2.0 — Stage 5 · Batch 5.6E · BROKER INTELLIGENCE · Area 5 · Journey
// (PURE). Turns the CANONICAL Journey spine (`journeys` + `journey_events`) into
// the ONE shared recommendation contract every other area already emits — so a
// stalled journey is ranked, deduped, lifecycled, learned-from, explained and
// scheduled by the EXISTING machinery. No second queue, no second recommendation
// model, no new table.
//
// THE EVIDENCE RULE (non-negotiable, and the reason this engine exists):
// `journeys.stage_entered_at` is NOT proof. Backfilled journeys (source
// 'legacy_backfill') carry a `journey_opened` seed whose occurred_at is the
// moment the BACKFILL RAN — not when the subject really entered the stage.
// Claiming "stuck 4 days" from that would measure a script, not a business.
// A stage entry counts as REAL only when a kernel-traceable `stage_change`
// event (source_event_id → domain_events) proves it. Without that proof this
// engine returns insufficientEvidence and recommends NOTHING. An honest zero is
// a valid, correct outcome.
//
// Deliberately NOT used: journeys.progress / health_score / engagement_score /
// conversion_score / risk_score / velocity_score / velocity_state /
// next_best_action. Live-verified as inert column defaults (0 / 50 / "normal" /
// NULL) that no code computes — surfacing them as "evidence" would fabricate a
// signal wearing a database costume.
// ============================================================================
import type { Evidence, Recommendation } from "./types";
import { clamp100, urgencyFromScore, MIN_EVIDENCE } from "./types";
import { machineFor, stageDef, type JourneyType } from "@/lib/journey-canonical";
import { JOURNEY_TYPE_LABEL } from "@/lib/search-projection/journey-document";

/** REAL, evidence-backed journey signals. Every nullable field means "unproven",
 *  never "zero" — the engine must skip rather than assume. */
export interface JourneySignals {
  journeyId: string;
  journeyType: JourneyType;
  /** The subject the journey is about (property/buyer/seller/lead/deal). */
  subjectType: string;
  subjectId: string;
  subjectTitle: string;
  /** Deep-link to the SUBJECT (resolved server-side; the engine stays pure). */
  href: string | null;
  currentStage: string;
  /** journeys.status — 'active' | 'won' | 'lost' | 'paused' | 'inactive'. */
  status: string;
  /**
   * Days in the current stage — ONLY when a kernel-traceable `stage_change`
   * event proves when the stage was entered. NULL when the only trace is a
   * backfill seed → the engine will NOT claim a dwell time it cannot prove.
   */
  daysInStage: number | null;
  /** Kernel-traceable transitions on this journey (backfill seeds excluded). */
  verifiedTransitions: number;
  /** Days since the most recent kernel-traceable transition. NULL = none ever. */
  daysSinceLastTransition: number | null;
}

/** A canonical stage with no proven movement for 3 weeks is stalling. */
export const STALL_DAYS = 21;
/** …and at 45 days it is a critical, revenue-threatening stall. */
export const SEVERE_STALL_DAYS = 45;

/** Why the engine declined — so an honest zero is auditable, never silent. */
export type JourneySkipReason =
  | "unknown_stage"
  | "terminal_stage"
  | "journey_not_active"
  | "stage_entry_unverified"
  | "journey_moving"
  | "thin_evidence";

/** Engine output: the shared-contract recommendation + (when declined) why.
 *  Mirrors Batch 5.6B's `buildJourneySearchDocument → { doc, skipReason? }` so
 *  the diagnostic never leaks into the shared `Recommendation` contract. */
export interface JourneyEvaluation {
  rec: Recommendation;
  skipReason?: JourneySkipReason;
}

function declined(s: JourneySignals, skipReason: JourneySkipReason, why: string): JourneyEvaluation {
  return {
    skipReason,
    rec: {
      id: `journey:${s.journeyId}:stall`,
      area: "journey",
      entityType: s.subjectType,
      entityId: s.subjectId,
      title: `מסע: ${s.subjectTitle}`,
      why,
      evidence: [],
      confidence: 0,
      urgency: "low",
      expectedImpact: "—",
      suggestedAction: "אין פעולה נדרשת",
      href: s.href,
      insufficientEvidence: true,
    },
  };
}

/**
 * Evaluate ONE canonical journey. Pure + deterministic. Recommends only a
 * PROVEN stall on an ACTIVE, non-terminal journey; otherwise declines with a
 * reason.
 */
export function evaluateJourney(s: JourneySignals): JourneyEvaluation {
  const def = stageDef(s.journeyType, s.currentStage);
  if (!def) return declined(s, "unknown_stage", "השלב הנוכחי אינו מוכר במכונת המצבים הקנונית.");
  // A finished journey has nothing to advance — the outcome already happened.
  if (def.terminal) return declined(s, "terminal_stage", `המסע הסתיים בשלב "${def.label}".`);
  if (s.status !== "active") {
    return declined(s, "journey_not_active", `המסע במצב "${s.status}" — אינו ממתין לפעולה.`);
  }
  // THE evidence gate: no kernel-traceable stage entry → no dwell claim, ever.
  if (s.daysInStage == null) {
    return declined(
      s,
      "stage_entry_unverified",
      `אין ראיה מאומתת למועד הכניסה לשלב "${def.label}" — קיים רק זרע היסטורי ללא אירוע מעבר מאומת.`,
    );
  }
  if (s.daysInStage < STALL_DAYS) {
    return declined(s, "journey_moving", `המסע בשלב "${def.label}" ${s.daysInStage} ימים — בטווח התקין.`);
  }

  const totalStages = machineFor(s.journeyType).stages.length;
  const typeLabel = JOURNEY_TYPE_LABEL[s.journeyType] ?? "מסע";

  // Stall magnitude → 40 (just crossed) … 100 (severe). Deterministic, bounded.
  const span = SEVERE_STALL_DAYS - STALL_DAYS;
  const stallScore = clamp100(40 + ((s.daysInStage - STALL_DAYS) / span) * 60);

  const evidence: Evidence[] = [
    {
      label: `המסע ממתין בשלב "${def.label}" כבר ${s.daysInStage} ימים ללא מעבר מאומת`,
      source: "journeys",
      weight: stallScore,
    },
    {
      label: `שלב ${def.position} מתוך ${totalStages} ב${typeLabel}`,
      source: "journeys",
    },
  ];
  // Only claim movement history when it is kernel-traceable.
  if (s.verifiedTransitions > 0) {
    evidence.push({
      label: `${s.verifiedTransitions} מעברי שלב מאומתים נרשמו במסע`,
      source: "journeys",
      weight: Math.min(20, s.verifiedTransitions * 5),
    });
  }
  if (s.daysSinceLastTransition != null && s.daysSinceLastTransition >= STALL_DAYS) {
    evidence.push({
      label: `לא נרשמה כל התקדמות במסע מזה ${s.daysSinceLastTransition} ימים`,
      source: "timeline",
      weight: 15,
    });
  }

  if (evidence.length < MIN_EVIDENCE) {
    return declined(s, "thin_evidence", "אין מספיק ראיות מאומתות כדי להמליץ בביטחון.");
  }

  const confidence = clamp100(45 + evidence.length * 10 + Math.min(15, s.verifiedTransitions * 5));

  return {
    rec: {
      id: `journey:${s.journeyId}:stall`,
      area: "journey",
      // The recommendation is about the SUBJECT — that's what the broker acts
      // on, and it's what lets the shared queue merge it with the other engines.
      entityType: s.subjectType,
      entityId: s.subjectId,
      title: `מסע תקוע: ${s.subjectTitle}`,
      why: `${typeLabel} ממתין בשלב "${def.label}" ${s.daysInStage} ימים ללא התקדמות מאומתת.`,
      evidence,
      confidence,
      urgency: urgencyFromScore(stallScore),
      expectedImpact: "החזרת המסע לתנועה — קיצור זמן המחזור ומניעת נטישה",
      suggestedAction: `בדוק מה חוסם את השלב "${def.label}" וקדם את המסע לשלב הבא`,
      href: s.href,
      insufficientEvidence: false,
    },
  };
}

/** Convenience: the recommendation alone (mirrors scoreBuyer/scoreSeller/…). */
export function scoreJourney(s: JourneySignals): Recommendation {
  return evaluateJourney(s).rec;
}

/** Rank journeys by business impact. Deterministic (stable id tiebreak). */
export function rankJourneys(list: JourneySignals[]): Recommendation[] {
  return list
    .map(scoreJourney)
    .sort((a, b) => {
      if (a.insufficientEvidence !== b.insufficientEvidence) return a.insufficientEvidence ? 1 : -1;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.id.localeCompare(b.id);
    });
}
