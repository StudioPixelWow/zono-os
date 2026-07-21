// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.6G · Executive Journey PROJECTION (PURE).
//
// Executive OS is a projection, never an engine. This file aggregates, labels
// and explains canonical Journey evidence. It does NOT infer Journey state:
// no funnel, no velocity, no health, no conversion — those belong to the
// canonical spine or to nothing at all.
//
// SOURCE SPLIT (deliberate, and the reason this file has two inputs):
//   · Journey Center KPIs → measurable STATE (active/stalled/blocked/stages/
//     dwell/workload/audit). A stalled count is a KPI.
//   · Broker Intelligence queue → ACTIONABLE items. A recommendation is a
//     separate evidence-gated object with its own identity, lifecycle and
//     confidence. We never promote a KPI into an action.
//
// FORBIDDEN INPUTS (Batch 5.6E/5.6G): journeys.progress / health_score /
// engagement_score / conversion_score / risk_score / velocity_score /
// velocity_state / next_best_action. They are schema defaults for backfilled
// rows and engine-written for others — a mixed, indistinguishable population.
// This module cannot read them: they are absent from its input types.
//
// `stageVelocity` is NOT accepted either. It is mean ladder POSITION (see
// journey-center/kpis.ts:51-59), not speed. Rendering it as velocity would be
// precisely the invented metric this batch exists to prevent.
// ============================================================================
import type { JourneyKpis } from "@/lib/journey-center/types";

/** Whether the projection could be computed at all. */
export type ExecJourneyStatus = "available" | "insufficient_evidence" | "unavailable";
/** Why the numbers look the way they do — always reported, never inferred. */
export type ExecJourneyReason = "evaluated" | "no_visible_journeys" | "insufficient_evidence" | "error";
/** How well-supported the dwell measure is. */
export type DwellEvidenceStatus = "verified" | "partial" | "insufficient";

/** One stage bucket. `stage` is the canonical `${journeyType}:${stageKey}` key. */
export interface ExecStageBucket {
  stage: string;
  journeyType: string;
  stageKey: string;
  label: string;
  count: number;
}

/** A manager-only workload row. Present ONLY for authorized managers. */
export interface ExecJourneyWorkloadRow {
  ownerUserId: string;
  name: string | null;
  active: number;
}

/**
 * The single actionable item — sourced from the CANONICAL Broker Intelligence
 * queue, never derived from a KPI. Carries the recommendation's own identity so
 * Executive agrees with every other surface (5.6F identity rule).
 */
export interface ExecJourneyAction {
  recommendationId: string;
  recKey: string;
  subjectType: string;
  subjectId: string;
  title: string;
  why: string;
  /** The RECOMMENDATION's confidence (0..100) — not evidence coverage. */
  confidence: number;
  priority: number;
  urgency: string;
  href: string;
  evidence: { label: string; source: string }[];
  mergedCount: number;
  contributingSources: string[];
}

/**
 * Journey evidence coverage — a DATA-QUALITY measure, deliberately not called
 * "AI confidence". It answers "how much of what we're showing is backed by
 * verified canonical records", and it is scoped to this projection only:
 * `affectsOrganizationScore` is a literal `false` so the type itself forbids
 * wiring it into Chief-of-Staff's organizationScore.confidence.
 */
export interface ExecJourneyCoverage {
  value: number | null;
  basis: "evidence_coverage";
  label: string;
  affectsOrganizationScore: false;
  detail: { canonicalRecords: number; fallbackRecords: number; dwellMeasured: number; dwellTotal: number };
}

export interface ExecJourneyProjection {
  status: ExecJourneyStatus;
  counts: { active: number; stalled: number; blocked: number; eligibleRecommendations: number };
  stageDistribution: ExecStageBucket[];
  dwell: { avgDaysInStage: number | null; evidenceStatus: DwellEvidenceStatus };
  highestPriorityBlocked: ExecJourneyAction | null;
  workload: { visible: boolean; rows: ExecJourneyWorkloadRow[]; hiddenReason: string | null };
  audit: {
    canonicalRecords: number;
    fallbackRecords: number;
    reason: ExecJourneyReason;
    /** Human, auditable trace of where each headline number came from. */
    trace: string[];
  };
  coverage: ExecJourneyCoverage;
  /** The honest sentence the UI shows. Never "everything is healthy". */
  headline: string;
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * ── Batch 5.6H — THE ONE queue→action mapping (pure, shared) ────────────────
 * A journey-area recommendation from the canonical Broker Intelligence queue,
 * as this projection consumes it. Structural on purpose: every consumer
 * (Executive OS, the Home Journey Command section, the Ask-ZONO Copilot) maps
 * queue items through THIS function, so the canonical identity (id, priority,
 * confidence, evidence) can never drift between surfaces (the 5.6F rule).
 */
export interface JourneyQueueItemLike {
  id: string;
  area: string;
  entityType: string;
  entityId: string;
  title: string;
  why: string;
  confidence: number;
  priority: number;
  urgency: string;
  href: string | null;
  evidence: { label: string; source: string }[];
  mergedCount: number;
  contributingSources: readonly string[];
}

/** Journey recommendation routing: the SUBJECT's real cockpit; `/journeys` is
 *  the safe aggregate fallback — never a raw journey UUID, never a legacy
 *  journey-intelligence screen. */
export function journeySubjectHref(kind: string, id: string): string {
  if (kind === "lead") return `/leads/${id}`;
  if (kind === "buyer") return `/buyers/${id}`;
  if (kind === "seller") return `/sellers/${id}`;
  if (kind === "property") return `/properties/${id}`;
  return kind === "deal" ? "/deals" : "/journeys";
}

/** Canonical queue items → ExecJourneyAction[]. Filters to the journey area and
 *  PRESERVES identity — nothing re-scored, nothing re-derived, nothing added. */
export function mapJourneyQueueItems(items: readonly JourneyQueueItemLike[]): ExecJourneyAction[] {
  return items
    .filter((r) => r.area === "journey")
    .map((r) => ({
      recommendationId: r.id,
      recKey: `${r.entityType}:${r.entityId}:journey`,
      subjectType: r.entityType,
      subjectId: r.entityId,
      title: r.title,
      why: r.why,
      confidence: r.confidence,
      priority: r.priority,
      urgency: r.urgency,
      href: r.href ?? journeySubjectHref(r.entityType, r.entityId),
      evidence: r.evidence.map((e) => ({ label: e.label, source: e.source })),
      mergedCount: r.mergedCount,
      contributingSources: [...r.contributingSources],
    }));
}

/** Inputs the projection accepts. Note what is ABSENT: no derived score columns. */
export interface ExecJourneyInput {
  /** Canonical KPIs from Journey Center. `null` = the provider failed. */
  kpis: JourneyKpis | null;
  /** Journey-area items from the canonical Broker Intelligence queue. */
  actions: ExecJourneyAction[];
  /** TRUE only for an authorized manager (checked at the data boundary). */
  isManager: boolean;
  /** ownerUserId → display name, org-scoped. Managers only. */
  ownerNames?: Record<string, string | null>;
  /** Canonical stage labeller (injected to keep this file pure + client-safe). */
  stageLabel?: (journeyType: string, stageKey: string) => string;
  // NOTE (5.6G): there is deliberately NO `verifiedStageEntries` here. The
  // evidence gate lives in the SHARED provider (journey-center/canonical.ts),
  // so `kpis.avgDaysInStage` is already null when dwell is unproven. Re-deriving
  // verification in Executive would create a second definition of dwell — the
  // exact thing this batch forbids. Executive preserves the meaning; it does
  // not recompute it.
}

/**
 * Build the Executive Journey projection. Pure + deterministic.
 *
 * A provider failure yields `unavailable` — NEVER a fabricated zero. "We could
 * not measure" and "we measured zero" are different claims, and a manager acting
 * on the second when the first is true is exactly the failure mode to avoid.
 */
export function buildExecJourneyProjection(input: ExecJourneyInput): ExecJourneyProjection {
  const { kpis, actions, isManager } = input;
  const label = input.stageLabel ?? ((_t: string, s: string) => s);

  const emptyCoverage: ExecJourneyCoverage = {
    value: null, basis: "evidence_coverage", label: "כיסוי ראיות מסעות",
    affectsOrganizationScore: false,
    detail: { canonicalRecords: 0, fallbackRecords: 0, dwellMeasured: 0, dwellTotal: 0 },
  };

  // ── Provider failed → unavailable, explicitly. Not zero. ──────────────────
  if (!kpis) {
    return {
      status: "unavailable",
      counts: { active: 0, stalled: 0, blocked: 0, eligibleRecommendations: 0 },
      stageDistribution: [],
      dwell: { avgDaysInStage: null, evidenceStatus: "insufficient" },
      highestPriorityBlocked: null,
      workload: { visible: false, rows: [], hiddenReason: "provider_unavailable" },
      audit: { canonicalRecords: 0, fallbackRecords: 0, reason: "error", trace: ["מקור המסעות לא נטען — לא ניתן למדוד."] },
      coverage: emptyCoverage,
      headline: "נתוני המסעות אינם זמינים כעת — לא ניתן להסיק מצב.",
    };
  }

  const canonicalRecords = kpis.canonicalRecords ?? 0;
  const fallbackRecords = kpis.fallbackRecords ?? 0;
  const active = kpis.active ?? 0;
  const stalled = kpis.stalled ?? 0;
  const blocked = kpis.blocked ?? 0;

  // ── Stage distribution — canonical `${type}:${stage}` keys, labelled. ─────
  const stageDistribution: ExecStageBucket[] = Object.entries(kpis.byStage ?? {})
    .map(([key, count]) => {
      const [journeyType = "", stageKey = ""] = key.split(":");
      return { stage: key, journeyType, stageKey, label: label(journeyType, stageKey), count };
    })
    .filter((b) => b.count > 0)
    .sort((a, b) => (b.count - a.count) || a.stage.localeCompare(b.stage));

  // ── Dwell — reported ONLY when the canonical KPI measured it. ─────────────
  // journey-center excludes journeys without a real stage_entered_at rather than
  // zero-filling, so a null here means "unmeasurable", never "zero days".
  const dwellTotal = active;
  const avgDaysInStage = kpis.avgDaysInStage ?? null;
  const dwellMeasured = avgDaysInStage == null ? 0 : dwellTotal;
  const dwellEvidence: DwellEvidenceStatus =
    avgDaysInStage == null ? "insufficient" : fallbackRecords > 0 ? "partial" : "verified";

  // ── Evidence coverage — data quality, NOT recommendation confidence. ──────
  const totalRecords = canonicalRecords + fallbackRecords;
  const coverageValue = totalRecords > 0 ? clamp100((canonicalRecords / totalRecords) * 100) : null;
  const coverage: ExecJourneyCoverage = {
    value: coverageValue,
    basis: "evidence_coverage",
    label: "כיסוי ראיות מסעות",
    affectsOrganizationScore: false,
    detail: { canonicalRecords, fallbackRecords, dwellMeasured, dwellTotal },
  };

  // ── Actionable — from the canonical queue only, deterministic pick. ───────
  const sorted = [...actions].sort(
    (a, b) => (b.priority - a.priority) || (b.confidence - a.confidence) || a.recKey.localeCompare(b.recKey),
  );
  const highestPriorityBlocked = sorted[0] ?? null;

  // ── Manager-only workload. Gated at the data boundary, not in the UI. ─────
  const workloadRows: ExecJourneyWorkloadRow[] = isManager
    ? Object.entries(kpis.ownerWorkload ?? {})
        .map(([ownerUserId, count]) => ({ ownerUserId, name: input.ownerNames?.[ownerUserId] ?? null, active: count }))
        .sort((a, b) => (b.active - a.active) || a.ownerUserId.localeCompare(b.ownerUserId))
    : [];

  // ── Status + reason. ─────────────────────────────────────────────────────
  const noRecords = totalRecords === 0;
  const status: ExecJourneyStatus = noRecords
    ? "insufficient_evidence"
    : canonicalRecords === 0
    ? "insufficient_evidence"
    : "available";
  const reason: ExecJourneyReason = noRecords
    ? "no_visible_journeys"
    : canonicalRecords === 0
    ? "insufficient_evidence"
    : "evaluated";

  // ── Auditable trace — every headline number explains its origin. ──────────
  const trace = [
    `פעילים: ${active} (מסעות קנוניים פתוחים · Journey Center)`,
    `תקועים: ${stalled} (שהייה בשלב מעל הסף · ראיה קנונית בלבד)`,
    `חסומים: ${blocked} (חסמים רשומים · ראיה קנונית בלבד)`,
    avgDaysInStage == null
      ? "ממוצע שהייה בשלב: אין ראיה מספקת — מסעות ללא מועד כניסה מאומת אינם נספרים כאפס"
      : `ממוצע שהייה בשלב: ${avgDaysInStage} ימים (מסעות עם מועד כניסה מאומת)`,
    `רשומות: ${canonicalRecords} קנוניות · ${fallbackRecords} גיבוי`,
    `המלצות זמינות: ${actions.length} (תור המודיעין הקנוני · מגודר ראיות)`,
    isManager ? `עומס לפי בעלים: ${workloadRows.length} שורות (מנהל)` : "עומס לפי בעלים: מוסתר (אינו מנהל)",
  ];

  // ── Headline — honest. Zero actionable ≠ healthy. ────────────────────────
  const headline = noRecords
    ? "לא נראים מסעות בארגון."
    : actions.length === 0
    ? "אין כרגע מסע שעומד ברף הראיות להתערבות ניהולית."
    : `${actions.length} מסעות עומדים ברף הראיות להתערבות ניהולית.`;

  return {
    status,
    counts: { active, stalled, blocked, eligibleRecommendations: actions.length },
    stageDistribution,
    dwell: { avgDaysInStage, evidenceStatus: dwellEvidence },
    highestPriorityBlocked,
    workload: {
      visible: isManager,
      rows: workloadRows,
      hiddenReason: isManager ? null : "requires_manager_role",
    },
    audit: { canonicalRecords, fallbackRecords, reason, trace },
    coverage,
    headline,
  };
}
