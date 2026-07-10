// ============================================================================
// 🤝 ZONO — BROKER INTELLIGENCE · Area 4 · Deal (PURE).
// Detects MEANINGFUL deal risk from REAL persisted signals (deal_profiles +
// open objections) and emits ONE next best action per at-risk deal: stalled
// negotiation, overdue close, slipping probability, unresolved objections.
// Escalates ONLY when real evidence crosses a threshold — a healthy deal returns
// insufficientEvidence (nothing to nag about). Unknown stays unknown, never zero.
// Offline-testable, deterministic.
// ============================================================================
import {
  type Recommendation, type Evidence, clamp100, urgencyFromScore, MIN_EVIDENCE,
} from "./types";

/** REAL signals for one deal (deal_profiles + objections). Null = unknown. */
export interface DealSignals {
  dealId: string;           // canonical public.deals id (for links)
  title: string;
  stage: string | null;
  status: string | null;    // open | won | lost
  dealRisk: number | null;         // 0..100 (high = at risk)
  dealHealth: number | null;       // 0..100 (low = trouble)
  dealVelocity: number | null;     // 0..100 (low = stalled)
  dealProbability: number | null;  // 0..100 closing probability
  daysToExpectedClose: number | null; // negative = overdue
  openObjections: number;          // unresolved objections
}

type Action = { title: string; action: string; impact: string };

/** Score a deal's risk + choose the escalation action. Pure. Only won/lost are
 *  excluded upstream; here a low-risk open deal simply yields insufficient. */
export function scoreDeal(s: DealSignals): Recommendation {
  const evidence: Evidence[] = [];
  let score = 0;

  if (s.dealRisk != null && s.dealRisk >= 55) {
    const w = s.dealRisk >= 70 ? 30 : 18;
    score += w;
    evidence.push({ label: `סיכון עסקה גבוה (${s.dealRisk})`, source: "deals", weight: w });
  }
  if (s.dealVelocity != null && s.dealVelocity <= 35) {
    score += 16;
    evidence.push({ label: `העסקה תקועה — מהירות נמוכה (${s.dealVelocity})`, source: "deals", weight: 16 });
  }
  if (s.dealHealth != null && s.dealHealth <= 40) {
    score += 12;
    evidence.push({ label: `בריאות עסקה נמוכה (${s.dealHealth})`, source: "deals", weight: 12 });
  }
  if (s.daysToExpectedClose != null && s.daysToExpectedClose < 0) {
    const w = s.daysToExpectedClose <= -14 ? 16 : 9;
    score += w;
    evidence.push({ label: `מועד סגירה עבר ב-${Math.abs(s.daysToExpectedClose)} יום`, source: "deals", weight: w });
  }
  if (s.dealProbability != null && s.dealProbability <= 35) {
    score += 10;
    evidence.push({ label: `הסתברות סגירה נמוכה (${s.dealProbability}%)`, source: "deals", weight: 10 });
  }
  if (s.openObjections > 0) {
    const w = Math.min(14, 6 + s.openObjections * 3);
    score += w;
    evidence.push({ label: `${s.openObjections} התנגדויות פתוחות`, source: "deals", weight: w });
  }

  const confidence = clamp100(score);
  const scored = evidence.filter((e) => (e.weight ?? 0) > 0).length;
  // Escalate only meaningful risk: needs ≥2 real signals AND a real risk floor.
  const insufficient = scored < MIN_EVIDENCE || confidence < 25;

  const act = pickAction(s, insufficient);
  const why = insufficient
    ? "העסקה אינה מציגה סיכון משמעותי מבוסס-ראיות כרגע — אין צורך בהסלמה."
    : evidence.filter((e) => (e.weight ?? 0) > 0).slice(0, 3).map((e) => e.label).join(" · ");

  return {
    id: `deal_${s.dealId}`,
    area: "deal",
    entityType: "deal",
    entityId: s.dealId,
    title: `${s.title} — ${act.title}`,
    why,
    evidence,
    confidence,
    urgency: urgencyFromScore(confidence),
    expectedImpact: insufficient ? "אין סיכון מהותי — לא נדרשת פעולה." : act.impact,
    suggestedAction: act.action,
    href: `/deals`,
    insufficientEvidence: insufficient,
  };
}

function pickAction(s: DealSignals, insufficient: boolean): Action {
  if (insufficient) return { title: "העסקה מתקדמת", action: "המשך ניהול שוטף; אין סיכון מהותי כרגע.", impact: "—" };
  if (s.openObjections > 0) {
    return { title: "טפל בהתנגדויות פתוחות", action: "פנה לצדדים, תעד ופתור את ההתנגדויות שחוסמות התקדמות.", impact: "הסרת חסמים לסגירה." };
  }
  if (s.daysToExpectedClose != null && s.daysToExpectedClose < 0) {
    return { title: "העסקה עברה מועד — דחוף לסגירה", action: "עדכן צדדים, ודא מסמכים ומימון וקבע מועד סגירה חדש.", impact: "מניעת גלישה/אובדן העסקה." };
  }
  if (s.dealVelocity != null && s.dealVelocity <= 35) {
    return { title: "העסקה תקועה — האץ", action: "בדוק היכן נתקע התהליך (מו״מ/מסמכים/מימון) ופעל לשחרור.", impact: "החזרת תנועה לעסקה." };
  }
  return { title: "עסקה בסיכון — בדוק", action: "בצע שיחת סטטוס עם הצדדים וזהה את הסיכון המרכזי.", impact: "צמצום סיכון לאובדן העסקה." };
}

/** Rank deals by business impact: sufficient first, then confidence, then risk. */
export function rankDeals(list: DealSignals[]): Recommendation[] {
  const risk = new Map(list.map((s) => [s.dealId, s.dealRisk ?? 0]));
  return list
    .map(scoreDeal)
    .sort((a, b) => {
      if (a.insufficientEvidence !== b.insufficientEvidence) return a.insufficientEvidence ? 1 : -1;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (risk.get(b.entityId) ?? 0) - (risk.get(a.entityId) ?? 0);
    });
}
