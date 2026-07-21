// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.7 · CANONICAL JOURNEY AI COACH (PURE).
//
// The first evidence-NATIVE reasoning layer. The Coach is NOT another analytics
// engine and NOT another recommendation engine: it consumes canonical facts the
// existing providers already proved (Journey Center state, evidence-gated queue
// recommendations) and turns them into an explained briefing. It computes NO
// new state — no dwell, no stall, no score, no prediction.
//
// THE CONTRACT (each rule is QA-locked in qa.ts):
//   · Facts come ONLY from the inputs. Every sentence is assembled from a fact
//     that carries an evidence reference. No free-form reasoning.
//   · The Coach never says "נראה ש", "כנראה", "סביר להניח", "I think",
//     "probably". It says "בהתבסס על…", "האירוע המאומת האחרון…",
//     "אין ראיה מאומתת המצביעה על…".
//   · Insufficient evidence NEVER becomes advice — it becomes an explicit
//     insufficient-evidence statement.
//   · Confidence is NEVER invented: a numeric confidence exists ONLY when a
//     canonical queue recommendation carries it (its own identity + number).
//     Everything else is a basis label, not a number.
//   · SHORT / NORMAL / DETAILED change WORDING VOLUME only — the underlying
//     facts object is byte-identical across modes (QA asserts it).
//   · Personalization (manager/broker/member) adapts wording and which OVERVIEW
//     sections render — never the facts of a journey.
// ============================================================================
import { STALL_DAYS } from "@/lib/journey-center/canonical";
import { isBlocked, isStalled } from "@/lib/journey-center/kpis";
import type { UnifiedJourney } from "@/lib/journey-center/types";
import type { ExecJourneyAction, ExecJourneyProjection } from "@/lib/executive-os/journey-projection";

export type CoachMode = "SHORT" | "NORMAL" | "DETAILED";
export type CoachAudience = "manager" | "broker" | "member";

/** One traceable evidence reference. Every briefing statement points at these. */
export interface CoachEvidenceRef {
  /** What kind of canonical object proves the statement. */
  kind: "verified_transition" | "queue_recommendation" | "journey_record" | "recommendation_evidence";
  journeyId: string;
  /** Human line, verbatim from the canonical provider (never rephrased). */
  label: string;
  /** Where the evidence lives (journeys / journey_events / queue engine …). */
  source: string;
  /** The verified stage-entry timestamp when the ref is a transition. */
  occurredAt?: string | null;
  /** The canonical recommendation identity when the ref is queue-backed. */
  recommendationId?: string;
}

/** The IMMUTABLE fact set a briefing is rendered from. Identical across modes. */
export interface CoachFacts {
  journeyId: string;
  journeyType: string;
  entityName: string;
  href: string;
  stageKey: string;
  stageLabel: string;
  status: string;
  canonical: boolean;
  /** Canonical dwell contract, untouched: number=verified, null=insufficient.
   *  The Coach never exposes the raw row timestamp — the day count is the
   *  provider-verified measure, and that is what the evidence cites. */
  stageAgeDays: number | null;
  stalled: boolean;
  blocked: boolean;
  blockers: string[];
  /** Canonical queue recommendation for this journey's subject — or null. */
  recommendation: {
    id: string;
    title: string;
    why: string;
    confidence: number;
    priority: number;
    urgency: string;
    href: string;
    evidence: { label: string; source: string }[];
  } | null;
  evidenceRefs: CoachEvidenceRef[];
}

/** Confidence is a claim about EVIDENCE, never a mood. */
export interface CoachConfidence {
  /** Numeric ONLY when a queue recommendation supplies its own confidence. */
  value: number | null;
  basis: "queue_recommendation" | "verified_evidence" | "insufficient_evidence";
  label: string;
}

export interface CoachBriefing {
  facts: CoachFacts;
  needsAttention: boolean;
  situation: string;
  evidenceSummary: string;
  whyThisMatters: string;
  recommendedNextStep: string;
  expectedOutcome: string;
  confidence: CoachConfidence;
  /** The rendered explanation for the requested mode. Conclusions never change. */
  text: string;
  mode: CoachMode;
}

// ── Fact extraction — no computation, only selection from canonical inputs ───
export function buildCoachFacts(j: UnifiedJourney, rec: ExecJourneyAction | null): CoachFacts {
  const refs: CoachEvidenceRef[] = [];

  // The journey record itself (org-scoped canonical spine row).
  refs.push({
    kind: "journey_record",
    journeyId: j.journeyId,
    label: `מסע קנוני ${j.journeyId} · שלב "${j.stageLabel}" · סטטוס ${j.status ?? "active"}`,
    source: "journeys",
  });

  // Verified dwell → the transition that proves it (5.6G gate upstream).
  // NOTE: the provider exposes the verified dwell in DAYS; the raw row
  // timestamp (journeys.stage_entered_at) is NOT verified evidence and the
  // Coach deliberately never touches it — so the ref carries the day count,
  // not a timestamp the gate did not prove.
  if (typeof j.stageAgeDays === "number") {
    refs.push({
      kind: "verified_transition",
      journeyId: j.journeyId,
      label: `כניסה מאומתת לשלב "${j.stageLabel}" לפני ${j.stageAgeDays} ימים`,
      source: "journey_events (source_event_id → domain_events)",
      occurredAt: null,
    });
  }

  // Provider-carried evidence lines, verbatim (e.g. "מעבר אחרון: x → y").
  for (const e of j.evidence ?? []) {
    refs.push({ kind: "journey_record", journeyId: j.journeyId, label: e, source: "journey-center" });
  }

  if (rec) {
    refs.push({
      kind: "queue_recommendation",
      journeyId: j.journeyId,
      label: rec.title,
      source: "broker-intelligence queue",
      recommendationId: rec.recommendationId,
    });
    for (const e of rec.evidence) {
      refs.push({
        kind: "recommendation_evidence",
        journeyId: j.journeyId,
        label: e.label,
        source: e.source,
        recommendationId: rec.recommendationId,
      });
    }
  }

  return {
    journeyId: j.journeyId,
    journeyType: String(j.journeyType ?? j.entityType),
    entityName: j.entityName,
    href: j.href,
    stageKey: j.currentStage,
    stageLabel: j.stageLabel,
    status: j.status ?? "active",
    canonical: j.canonical === true,
    stageAgeDays: typeof j.stageAgeDays === "number" ? j.stageAgeDays : null,
    stalled: isStalled(j),
    blocked: isBlocked(j),
    blockers: [...(j.blockers ?? [])],
    recommendation: rec
      ? {
          id: rec.recommendationId, title: rec.title, why: rec.why, confidence: rec.confidence,
          priority: rec.priority, urgency: rec.urgency, href: rec.href,
          evidence: rec.evidence.map((e) => ({ label: e.label, source: e.source })),
        }
      : null,
    evidenceRefs: refs,
  };
}

// ── Rendering — wording only. Facts and conclusions are fixed above. ─────────
const dwellSentence = (f: CoachFacts): string =>
  f.stageAgeDays === null
    ? `אין ראיה מאומתת למועד הכניסה לשלב "${f.stageLabel}" — משך השהייה אינו מדיד ואינו נספר כאפס.`
    : `האירוע המאומת האחרון מתעד כניסה לשלב "${f.stageLabel}" לפני ${f.stageAgeDays} ימים.`;

export function buildCoachBriefing(
  j: UnifiedJourney,
  rec: ExecJourneyAction | null,
  mode: CoachMode = "NORMAL",
): CoachBriefing {
  const f = buildCoachFacts(j, rec);

  // needsAttention is NOT computed here — it is the conjunction of upstream
  // canonical judgments: an evidence-gated queue recommendation, a verified
  // stall, or a recorded blocker.
  const needsAttention = f.recommendation !== null || f.stalled || f.blocked;

  // 1 · Current situation — only proven state.
  const situation =
    `בהתבסס על הרשומה הקנונית: המסע של ${f.entityName} (${f.journeyType}) נמצא בשלב "${f.stageLabel}", סטטוס ${f.status}. ` +
    dwellSentence(f);

  // 2 · Evidence summary — counts what EXISTS, names what does not.
  const verifiedRefs = f.evidenceRefs.filter((r) => r.kind === "verified_transition").length;
  const recRefs = f.evidenceRefs.filter((r) => r.kind === "queue_recommendation" || r.kind === "recommendation_evidence").length;
  const evidenceSummary =
    `בסיס הראיות: ${f.evidenceRefs.length} הפניות קנוניות — ` +
    `${verifiedRefs} מעברים מאומתים, ${recRefs} הפניות המלצה, והשאר רשומת המסע עצמה. ` +
    (f.stageAgeDays === null ? "אין ראיה מאומתת לשהייה בשלב הנוכחי. " : "") +
    (f.blockers.length ? `חסמים רשומים: ${f.blockers.join(" · ")}.` : "אין חסמים רשומים.");

  // 3 · Why this matters — strictly evidence-conditioned.
  const whyThisMatters = f.recommendation
    ? `בהתבסס על תור המודיעין הקנוני: ${f.recommendation.why}`
    : f.stalled
      ? `בהתבסס על הראיה המאומתת, המסע שוהה בשלב "${f.stageLabel}" ${f.stageAgeDays} ימים — מעל סף ה-${STALL_DAYS} ימים שמוגדר כתקיעה מאומתת.`
      : f.blocked
        ? `בהתבסס על החסמים הרשומים: ${f.blockers.join(" · ")}.`
        : f.stageAgeDays === null
          ? `אין ראיה מאומתת המצביעה על בעיה — אך גם לא על תקינות: משך השהייה בשלב אינו ניתן למדידה ללא אירוע כניסה מאומת.`
          : `בהתבסס על הראיה המאומתת, המסע בטווח התקין (${f.stageAgeDays} ימים בשלב, מתחת לסף ${STALL_DAYS}).`;

  // 4 · Recommended next step — ONLY from a canonical recommendation.
  //     Insufficient evidence NEVER becomes advice.
  const recommendedNextStep = f.recommendation
    ? `בהתבסס על ההמלצה הקנונית (${f.recommendation.id}): ${f.recommendation.title} — פתח את ${f.recommendation.href}.`
    : needsAttention
      ? `אין המלצת תור העומדת ברף הראיות עבור המסע הזה כרגע — הטיפול מתועד דרך החסם הרשום, לא דרך עצה מומצאת.`
      : f.stageAgeDays === null
        ? `אין ראיה מספקת להמלצת פעולה. הצעד היחיד המבוסס-ראיות: תיעוד האירוע העסקי הבא במערכת ייצור כניסת שלב מאומתת.`
        : `אין פעולה נדרשת על בסיס הראיות הקיימות.`;

  // 5 · Expected outcome — from the recommendation, or explicitly none.
  const expectedOutcome = f.recommendation
    ? `בהתבסס על ההמלצה: קידום המסע משלב "${f.stageLabel}" — ההמלצה נושאת עדיפות ${f.recommendation.priority} ודחיפות ${f.recommendation.urgency}.`
    : `לא נטענת תוצאה צפויה — אין המלצה קנונית פעילה למסע זה.`;

  // 6 · Confidence — never invented.
  const confidence: CoachConfidence = f.recommendation
    ? { value: f.recommendation.confidence, basis: "queue_recommendation", label: `ביטחון ההמלצה הקנונית: ${f.recommendation.confidence}% (זהות ${f.recommendation.id})` }
    : f.stageAgeDays !== null
      ? { value: null, basis: "verified_evidence", label: "מבוסס ראיה מאומתת — ללא ציון ביטחון (אין המלצה קנונית שנושאת אחד)" }
      : { value: null, basis: "insufficient_evidence", label: "אין ראיה מספקת — לא מוצג ציון ביטחון" };

  // 7 · Rendered text per mode. WORDING VOLUME ONLY — conclusions identical.
  const refLines = f.evidenceRefs.map((r) => `· [${r.kind}] ${r.label} (${r.source}${r.recommendationId ? ` · ${r.recommendationId}` : ""})`);
  const text =
    mode === "SHORT"
      ? `${situation} ${recommendedNextStep}`
      : mode === "NORMAL"
        ? [situation, whyThisMatters, recommendedNextStep, confidence.label].join("\n")
        : [situation, evidenceSummary, whyThisMatters, recommendedNextStep, expectedOutcome, confidence.label, "הפניות ראיה:", ...refLines].join("\n");

  return {
    facts: f, needsAttention, situation, evidenceSummary, whyThisMatters,
    recommendedNextStep, expectedOutcome, confidence, text, mode,
  };
}

// ── The org-level coach view (audience adapts WORDING + overview only) ───────
export interface CoachOverview {
  /** Present ONLY for managers — org-level counts from the shared projection. */
  headline: string | null;
  briefings: CoachBriefing[];
  /** Journeys needing attention first (queue-backed → stalled/blocked → rest). */
  attentionCount: number;
  audience: CoachAudience;
  mode: CoachMode;
  /** The SHARED projection the Coach was built against (member-safe: built with
   *  isManager=false, so it never carries workload). Consumers reuse its
   *  audited counts/dwell instead of re-counting. */
  projection: ExecJourneyProjection | null;
}

export function buildCoachOverview(
  journeys: UnifiedJourney[],
  actions: ExecJourneyAction[],
  projection: ExecJourneyProjection | null,
  audience: CoachAudience,
  mode: CoachMode = "NORMAL",
): CoachOverview {
  const byKey = new Map(actions.map((a) => [`${a.subjectType}:${a.subjectId}`, a]));
  const canonical = journeys.filter((j) => j.canonical === true);
  const briefings = canonical
    .map((j) => buildCoachBriefing(j, byKey.get(`${j.entityType}:${j.entityId}`) ?? null, mode))
    .sort((a, b) => {
      const ta = a.facts.recommendation ? 0 : a.needsAttention ? 1 : 2;
      const tb = b.facts.recommendation ? 0 : b.needsAttention ? 1 : 2;
      if (ta !== tb) return ta - tb;
      const pa = a.facts.recommendation?.priority ?? -1, pb = b.facts.recommendation?.priority ?? -1;
      if (pa !== pb) return pb - pa;
      return a.facts.journeyId < b.facts.journeyId ? -1 : a.facts.journeyId > b.facts.journeyId ? 1 : 0;
    });

  // Manager overview reuses the SHARED projection's audited numbers verbatim —
  // the Coach adds no counting of its own. Members get no org overview line
  // (wording/visibility adaptation — the per-journey facts are identical).
  const headline =
    audience === "manager" && projection
      ? `סקירת ארגון (מנהל): ${projection.counts.active} מסעות פעילים · ${projection.counts.stalled} תקועים · ${projection.counts.blocked} חסומים · ${projection.counts.eligibleRecommendations} המלצות ברף הראיות.`
      : null;

  return {
    headline,
    briefings,
    attentionCount: briefings.filter((b) => b.needsAttention).length,
    audience,
    mode,
    projection,
  };
}
