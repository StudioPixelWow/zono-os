// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.4 · Journey Center KPI integrity (PURE).
//
// The rules, enforced here rather than trusted:
//   · KPIs are computed from CANONICAL journeys. Fallback records are counted in
//     exactly ONE place — `fallbackRecords` — and nowhere else.
//   · No double counting: a canonical journey and a fallback record can never
//     coexist for the same entity (the service guarantees it; QA proves it).
//   · No fake funnel, no hardcoded counts. Every number is derived from a real row.
//   · Anything unmeasurable is `null`, not zero. A zero means "we measured zero".
// ============================================================================
import { stageDef, type JourneyType } from "@/lib/journey-canonical";
import { STALL_DAYS } from "./canonical";
import type { JourneyFilters, JourneyKpis, UnifiedJourney } from "./types";

const isCanonical = (j: UnifiedJourney) => j.canonical === true;
const isTerminal = (j: UnifiedJourney) => {
  const d = stageDef((j.journeyType ?? j.entityType) as JourneyType, j.currentStage);
  return !!d?.terminal;
};
const isWon = (j: UnifiedJourney) => stageDef((j.journeyType ?? j.entityType) as JourneyType, j.currentStage)?.kind === "won";
const isNegativeTerminal = (j: UnifiedJourney) => {
  const k = stageDef((j.journeyType ?? j.entityType) as JourneyType, j.currentStage)?.kind;
  return k === "lost" || k === "inactive";
};
export const isStalled = (j: UnifiedJourney) =>
  !isTerminal(j) && (j.stageAgeDays ?? 0) >= STALL_DAYS;
export const isBlocked = (j: UnifiedJourney) => (j.blockers?.length ?? 0) > 0;

export function computeJourneyKpis(all: UnifiedJourney[]): JourneyKpis {
  const canonical = all.filter(isCanonical);
  const fallback = all.filter((j) => !isCanonical(j));
  const open = canonical.filter((j) => !isTerminal(j));

  const byType: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const ownerWorkload: Record<string, number> = {};
  for (const j of canonical) {
    const t = j.journeyType ?? j.entityType;
    byType[t] = (byType[t] ?? 0) + 1;
    const sk = `${t}:${j.currentStage}`;
    byStage[sk] = (byStage[sk] ?? 0) + 1;
    if (j.ownerUserId) ownerWorkload[j.ownerUserId] = (ownerWorkload[j.ownerUserId] ?? 0) + 1;
  }

  // Average days in the CURRENT stage — open canonical journeys with a real
  // stage_entered_at. Journeys without one are excluded, not zero-filled.
  const ages = open.map((j) => j.stageAgeDays).filter((n): n is number => typeof n === "number");
  const avgDaysInStage = ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null;

  // Stage velocity — mean fraction of the ladder each open journey has covered.
  // It is a position measure, not a speed: we do not have per-stage durations for
  // backfilled rows, and we will not invent them.
  const positions = open
    .map((j) => (j.stageTotal > 1 ? j.stageIndex / (j.stageTotal - 1) : null))
    .filter((n): n is number => n !== null);
  const stageVelocity = positions.length
    ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 100) / 100
    : null;

  return {
    // legacy KPI block (kept — the view renders it)
    active: open.length,
    atRisk: canonical.filter(isStalled).length,
    waiting: canonical.filter((j) => j.openTasks > 0).length,
    advancing: canonical.filter((j) => (j.daysSinceActivity ?? 99) <= 2 && !isTerminal(j)).length,
    noActivity: canonical.filter((j) => (j.daysSinceActivity ?? 0) > 30 && !isTerminal(j)).length,
    upcomingMeetings: canonical.filter((j) => !!j.upcomingMeetingAt).length,

    // 5.4D
    byType,
    byStage,
    avgDaysInStage,
    stalled: canonical.filter(isStalled).length,
    blocked: canonical.filter(isBlocked).length,
    won: canonical.filter(isWon).length,
    lostOrInactive: canonical.filter(isNegativeTerminal).length,
    ownerWorkload,
    stageVelocity,
    canonicalRecords: canonical.length,
    fallbackRecords: fallback.length,
  };
}

// ── 5.4E — filters + business-priority sort ─────────────────────────────────
export function applyFilters(journeys: UnifiedJourney[], f: JourneyFilters): UnifiedJourney[] {
  return journeys.filter((j) => {
    if (f.journeyType && (j.journeyType ?? j.entityType) !== f.journeyType) return false;
    if (f.entityType && j.entityType !== f.entityType) return false;
    if (f.stage && j.currentStage !== f.stage) return false;
    if (f.owner && j.ownerUserId !== f.owner) return false;
    if (f.status && j.status !== f.status) return false;
    if (f.source && (j.source ?? "canonical") !== f.source) return false;
    if (f.stalled === true && !isStalled(j)) return false;
    if (f.blocked === true && !isBlocked(j)) return false;
    if (f.fromDate && (!j.stageEnteredAt || j.stageEnteredAt < f.fromDate)) return false;
    if (f.toDate && (!j.stageEnteredAt || j.stageEnteredAt > f.toDate)) return false;
    return true;
  });
}

/**
 * Default order is BUSINESS PRIORITY, never alphabetical:
 *   blocked → stalled → priority score → stage age → most recent activity.
 */
export function sortByBusinessPriority(journeys: UnifiedJourney[]): UnifiedJourney[] {
  return [...journeys].sort((a, b) => {
    const ba = isBlocked(a) ? 1 : 0, bb = isBlocked(b) ? 1 : 0;
    if (ba !== bb) return bb - ba;
    const sa = isStalled(a) ? 1 : 0, sb = isStalled(b) ? 1 : 0;
    if (sa !== sb) return sb - sa;
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aa = a.stageAgeDays ?? -1, ab = b.stageAgeDays ?? -1;
    if (ab !== aa) return ab - aa;
    return Date.parse(b.lastActivityAt ?? "0") - Date.parse(a.lastActivityAt ?? "0");
  });
}
