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
/**
 * STALLED — Batch 5.6G: evidence-gated. `stageAgeDays` is a number ONLY when a
 * verified canonical transition (source_event_id → domain_events) proves the
 * stage entry (see canonical.ts). `null` means INSUFFICIENT EVIDENCE — such a
 * journey is never stalled, never "0 days old", never healthy-by-default. The
 * strict `typeof` check (not `?? 0`) keeps the three dwell states distinct.
 */
export const isStalled = (j: UnifiedJourney) =>
  !isTerminal(j) && typeof j.stageAgeDays === "number" && j.stageAgeDays >= STALL_DAYS;
/**
 * BLOCKED — Batch 5.6G product decision, documented so it is not mistaken for a
 * general blocker model: there is NO independent canonical blocker source today.
 * `blockers` (canonical.ts) contains only OBSERVED facts:
 *   · the synthetic stall blocker — produced ONLY from verified dwell ≥ STALL_DAYS,
 *     so for active journeys `blocked` is currently COUPLED to verified `stalled`;
 *   · `status === "paused"` — a real row flag;
 *   · a non-canonical current stage — a real vocabulary violation.
 * Unverified dwell produces NO blocker (stalled=false ⇒ blocked=false).
 * Independent real blockers (e.g. a broker-recorded obstacle) are a FUTURE
 * Journey model enhancement — not invented here.
 */
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

  // Average days in the CURRENT stage — open canonical journeys whose stage
  // entry is VERIFIED by a canonical transition (5.6G: source_event_id-backed;
  // `stage_entered_at` alone is NOT dwell evidence — on backfilled rows it
  // records when the backfill ran). Unverified journeys are EXCLUDED from the
  // mean, not zero-filled; zero verified entries ⇒ null, never a number.
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
    // 5.6G: `stalled` admits ONLY verified-dwell stalls (isStalled is the one
    // evidence-gated definition — unverified dwell is never stalled). `blocked`
    // follows the documented synthetic-blocker semantics above. A provider
    // failure never reaches this code path (the service returns kpis=null
    // upstream), and a journey with missing dwell is simply "not stalled" —
    // it is NOT thereby claimed healthy (it stays visible in the active list).
    if (f.stalled === true && !isStalled(j)) return false;
    if (f.blocked === true && !isBlocked(j)) return false;
    if (f.fromDate && (!j.stageEnteredAt || j.stageEnteredAt < f.fromDate)) return false;
    if (f.toDate && (!j.stageEnteredAt || j.stageEnteredAt > f.toDate)) return false;
    return true;
  });
}

/**
 * Default order is BUSINESS PRIORITY, never alphabetical — and, since Batch
 * 5.6G, EVIDENCE-AWARE. `stageAgeDays ?? -1` is gone: null is not "negative
 * dwell", not "young", not "healthy", not "low priority" — it is a different
 * claim ("insufficient canonical evidence") and gets its own explicit tier.
 *
 * Tiers (ascending rank = earlier in the list):
 *   0 · verified stalled / blocked journeys (real, observed risk first)
 *   1 · open journeys with VERIFIED dwell — descending stageAgeDays
 *   2 · open journeys with INSUFFICIENT dwell evidence
 *   3 · terminal journeys (nothing to act on — they sink)
 * Within a tier: priority score → verified dwell (a number always outranks a
 * null — evidence beats absence, comparing null as a sentinel is forbidden) →
 * most recent activity → canonical journey id (deterministic, stable).
 */
export function sortByBusinessPriority(journeys: UnifiedJourney[]): UnifiedJourney[] {
  const tierOf = (j: UnifiedJourney): number => {
    if (isTerminal(j)) return 3;
    if (isBlocked(j) || isStalled(j)) return 0;
    return typeof j.stageAgeDays === "number" ? 1 : 2;
  };
  return [...journeys].sort((a, b) => {
    const ta = tierOf(a), tb = tierOf(b);
    if (ta !== tb) return ta - tb;
    if (b.priority !== a.priority) return b.priority - a.priority;
    const na = typeof a.stageAgeDays === "number", nb = typeof b.stageAgeDays === "number";
    if (na && nb && a.stageAgeDays !== b.stageAgeDays) return (b.stageAgeDays as number) - (a.stageAgeDays as number);
    if (na !== nb) return na ? -1 : 1;              // verified dwell outranks unverified — explicitly, not via a sentinel
    const la = Date.parse(a.lastActivityAt ?? "") || 0, lb = Date.parse(b.lastActivityAt ?? "") || 0;
    if (la !== lb) return lb - la;
    return a.journeyId < b.journeyId ? -1 : a.journeyId > b.journeyId ? 1 : 0;   // stable, canonical-id tie-breaker
  });
}
