// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.4 · Journey Center CANONICAL layer (PURE).
//
// Batch 5.3 left the Journey Center reading a DERIVED model: it composed a
// lifecycle out of the digital twins and never looked at `journeys`. That made
// sense when `journeys` was empty. It no longer is — 5.2 fills it from events and
// 5.3 backfilled the 9 real property journeys. Reading the twins now means the
// page can disagree with the canonical spine, which is exactly the "two Journey
// systems" problem this Stage exists to end.
//
// 5.4 inverts the read order:
//     1. CANONICAL   — journeys + journey_events (the spine)
//     2. FALLBACK    — the derived twin model, ONLY for entities with no canonical
//                      journey yet, and always MARKED as such
//     3. never both for the same entity
//     4. never let a stale fallback outrank a newer canonical stage
//
// This file is pure so every one of those rules is testable without a database.
// ============================================================================
import {
  isValidStage, ladder, machineFor, resolveLegacyStage, stageDef, stageLabel, stageProgress,
  type JourneyType,
} from "@/lib/journey-canonical";
import type { JourneyEntityType, JourneyFlag, JourneyLinked, UnifiedJourney } from "./types";

/** A canonical `journeys` row, as read from the spine. */
export interface CanonicalJourneyRow {
  id: string;
  orgId: string;
  journeyType: JourneyType;
  entityType: string;
  entityId: string;
  currentStage: string;
  status: string;
  ownerUserId: string | null;
  stageEnteredAt: string | null;
  lastActivityAt: string | null;
  startedAt: string | null;
  source: string | null;        // 'event' | 'compat' | 'legacy_backfill'
  metadata: Record<string, unknown> | null;
}

/** The last transition on a journey (from journey_events). */
export interface CanonicalTransition {
  journeyId: string;
  fromStage: string | null;
  toStage: string;
  occurredAt: string | null;
  reason: string | null;
  actorUserId: string | null;
}

/** Everything the assembler needs that does not live on the journey row. */
export interface EntityFacts {
  title: string | null;          // null when unknown — NEVER invented
  href: string | null;
  ownerName: string | null;
  openTasks: number;
  upcomingMeetingAt: string | null;
  linked: JourneyLinked[];
}

const DAY = 86_400_000;
const daysBetween = (iso: string | null, nowMs: number): number | null =>
  iso ? Math.max(0, Math.floor((nowMs - Date.parse(iso)) / DAY)) : null;

/** A journey nobody has moved in this long is STALLED. Evidence, not vibes. */
export const STALL_DAYS = 14;

/**
 * The ONE canonical journey → UI record mapping. Stage label, ladder position and
 * progress all come from the canonical machine — never from a private vocabulary.
 */
export function fromCanonicalJourney(
  j: CanonicalJourneyRow,
  last: CanonicalTransition | null,
  facts: EntityFacts,
  nowMs: number,
): UnifiedJourney {
  const jt = j.journeyType;
  const stages = ladder(jt);
  const def = stageDef(jt, j.currentStage);
  const idx = stages.findIndex((s) => s.key === j.currentStage);

  const stageAgeDays = daysBetween(j.stageEnteredAt ?? j.startedAt, nowMs);
  const daysSinceActivity = daysBetween(j.lastActivityAt ?? j.stageEnteredAt ?? j.startedAt, nowMs);

  const terminal = !!def?.terminal;
  const won = def?.kind === "won";
  const stalled = !terminal && stageAgeDays !== null && stageAgeDays >= STALL_DAYS;

  // BLOCKERS are only ever real, observed facts. We do not invent them.
  const blockers: string[] = [];
  if (stalled) blockers.push(`תקוע ${stageAgeDays} ימים בשלב "${stageLabel(jt, j.currentStage)}"`);
  if (!isValidStage(jt, j.currentStage)) {
    blockers.push(`שלב לא-קנוני "${j.currentStage}" — דורש השלמה (backfill) של 5.3`);
  }
  if (j.status === "paused") blockers.push("המסע מושהה");

  const flags: JourneyFlag[] = [];
  if (terminal) flags.push("closed");
  else flags.push("active");
  if (stalled) flags.push("at_risk");
  if (!stalled && daysSinceActivity !== null && daysSinceActivity <= 2) flags.push("advancing");
  if (daysSinceActivity !== null && daysSinceActivity > 30) flags.push("no_activity");
  if (facts.openTasks > 0) flags.push("waiting");

  // Priority: real risk first. Terminal journeys sink; stalled open ones rise.
  const priority = terminal ? 0
    : Math.min(100,
      (stalled ? 60 : 0) +
      (facts.openTasks > 0 ? 15 : 0) +
      (facts.upcomingMeetingAt ? 10 : 0) +
      Math.round((idx >= 0 ? idx / Math.max(1, stages.length - 1) : 0) * 15));

  const evidence: string[] = [];
  if (j.source) evidence.push(`מקור: ${j.source}`);
  if (last) evidence.push(last.fromStage ? `מעבר אחרון: ${last.fromStage} → ${last.toStage}` : `נפתח בשלב ${last.toStage}`);
  if (last?.reason) evidence.push(last.reason);

  return {
    journeyId: j.id,                                  // the REAL canonical id, not a synthetic key
    journeyType: jt,
    entityType: j.entityType as JourneyEntityType,
    entityId: j.entityId,
    entityName: facts.title ?? "—",                   // unknown stays unknown
    href: facts.href ?? "#",
    currentStage: j.currentStage,
    stageLabel: stageLabel(jt, j.currentStage),
    stageIndex: idx < 0 ? 0 : idx,
    stageTotal: stages.length,
    progress: stageProgress(jt, j.currentStage),
    status: j.status,
    ownerUserId: j.ownerUserId,
    ownerName: facts.ownerName,
    stageEnteredAt: j.stageEnteredAt,
    stageAgeDays,
    healthScore: terminal ? (won ? 100 : 0) : Math.max(0, 100 - (stalled ? 50 : 0) - Math.min(30, (daysSinceActivity ?? 0))),
    healthLabel: terminal ? (won ? "הושלם" : "סגור") : stalled ? "תקוע" : "תקין",
    risk: stalled ? 70 : 0,
    priority,
    flags,
    blockers,
    lastActivityAt: j.lastActivityAt,
    daysSinceActivity,
    nextAction: null,           // 5.5 wires the recommendation engine; NOT faked here
    nextActionReason: null,
    openTasks: facts.openTasks,
    upcomingMeetingAt: facts.upcomingMeetingAt,
    linked: facts.linked,
    evidence,
    source: "canonical",
    canonical: true,
  };
}

// ── FALLBACK vocabulary → canonical ─────────────────────────────────────────
// The derived model invented its OWN stage keys (types.ts STAGE_ORDER — a SIXTH
// vocabulary). A fallback row is only shown with a canonical stage if its key maps.
// Anything that does not map is reported, never guessed onto a stage.
export const FALLBACK_STAGE_MAP: Record<JourneyEntityType, Record<string, string>> = {
  buyer: {
    new: "new", qualification: "qualification", matching: "matching",
    viewing: "viewing_completed", negotiation: "negotiation", deal: "deal", inactive: "inactive",
  },
  seller: {
    new: "new", valuation: "valuation", pricing: "pricing", signing: "representation",
    marketing: "marketing", negotiation: "negotiation", deal: "deal", churn_risk: "churn_risk",
  },
  lead: {
    new: "new", contacted: "contacted", qualified: "qualified", nurturing: "nurturing",
    converted: "converted", lost: "lost",
    // `disqualified` deliberately absent — 5.3 established it has no canonical peer
    // and must NOT be collapsed into `lost`.
  },
  property: {
    draft: "draft", preparation: "preparation", ready: "ready_to_publish",
    marketed: "marketing", active: "active", under_offer: "offers",
    negotiation: "negotiation", sold: "sold",
    // `stale` is a HEALTH flag the derived model modelled as a stage. It is not a
    // lifecycle position and has no canonical peer.
  },
  // Deals have NO derived model — they exist only canonically. Nothing to map.
  deal: {},
};

export interface FallbackResolution {
  canonicalStage: string | null;
  reason?: string;
}

/** Map one derived stage onto the canonical vocabulary. Never guesses. */
export function resolveFallbackStage(entityType: JourneyEntityType, derivedStage: string): FallbackResolution {
  const jt = entityType as JourneyType;
  const direct = FALLBACK_STAGE_MAP[entityType]?.[derivedStage];
  if (direct && isValidStage(jt, direct)) return { canonicalStage: direct };
  // Second chance: the value may already be a real legacy key the 5.3 resolver knows.
  const vocab = entityType === "seller" ? "journey_stages_seller" as const
    : entityType === "buyer" ? "journey_stages_buyer" as const
      : entityType === "lead" ? "leads_stage" as const
        : "journey_stage_enum" as const;
  const r = resolveLegacyStage(jt, vocab, derivedStage);
  if (r.canonical && r.quality !== "unmappable" && r.quality !== "ambiguous") {
    return { canonicalStage: r.canonical };
  }
  return { canonicalStage: null, reason: `derived stage '${derivedStage}' has no canonical peer for ${entityType}` };
}

/**
 * Re-express a DERIVED (fallback) journey in the canonical vocabulary and mark it.
 * Returns null when the stage cannot be mapped — the caller reports it rather than
 * showing a record whose stage means nothing in the canonical world.
 */
export function markFallback(u: UnifiedJourney): UnifiedJourney | null {
  const res = resolveFallbackStage(u.entityType, u.currentStage);
  if (!res.canonicalStage) return null;
  const jt = u.entityType as JourneyType;
  const stages = ladder(jt);
  const idx = stages.findIndex((s) => s.key === res.canonicalStage);
  return {
    ...u,
    journeyType: jt,
    currentStage: res.canonicalStage,
    stageLabel: stageLabel(jt, res.canonicalStage),
    stageIndex: idx < 0 ? 0 : idx,
    stageTotal: stages.length,
    progress: stageProgress(jt, res.canonicalStage),
    status: u.status ?? "active",
    blockers: u.blockers ?? [],
    stageEnteredAt: u.stageEnteredAt ?? null,
    stageAgeDays: u.stageAgeDays ?? null,
    ownerUserId: u.ownerUserId ?? null,
    ownerName: u.ownerName ?? null,
    source: "fallback",
    canonical: false,
    evidence: [...(u.evidence ?? []), "רשומת תאימות — טרם נוצר מסע קנוני"],
  };
}

/** The machine's own initial stage — used only to describe an empty ladder. */
export const initialFor = (t: JourneyType) => machineFor(t).initial;
