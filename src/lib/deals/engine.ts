/**
 * Deal Execution Engine — deterministic, client-safe, NO LLM, no server imports.
 * Scores deal twins (health/risk/velocity/probability), maps match→deal stages,
 * computes negotiation gaps, objection severity and the next-best deal action.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type DealStage =
  | "new_opportunity" | "contacted" | "meeting_scheduled" | "property_visit"
  | "negotiation" | "offer_sent" | "offer_received" | "agreement_draft"
  | "legal_review" | "signed" | "closed" | "lost";

export const DEAL_STAGE_ORDER: DealStage[] = [
  "new_opportunity", "contacted", "meeting_scheduled", "property_visit", "negotiation",
  "offer_sent", "offer_received", "agreement_draft", "legal_review", "signed", "closed",
];
export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  new_opportunity: "הזדמנות חדשה", contacted: "יצירת קשר", meeting_scheduled: "פגישה נקבעה", property_visit: "ביקור בנכס",
  negotiation: "משא ומתן", offer_sent: "הצעה נשלחה", offer_received: "הצעה התקבלה", agreement_draft: "טיוטת הסכם",
  legal_review: "בדיקה משפטית", signed: "נחתם", closed: "נסגר", lost: "אבוד",
};
const STAGE_BASE_PROB: Record<DealStage, number> = {
  new_opportunity: 30, contacted: 40, meeting_scheduled: 50, property_visit: 58,
  negotiation: 70, offer_sent: 78, offer_received: 82, agreement_draft: 88,
  legal_review: 92, signed: 97, closed: 100, lost: 3,
};
const STAGE_DAYS: Record<DealStage, number> = {
  new_opportunity: 70, contacted: 55, meeting_scheduled: 45, property_visit: 38,
  negotiation: 24, offer_sent: 16, offer_received: 12, agreement_draft: 9, legal_review: 6, signed: 3, closed: 0, lost: 0,
};

export function matchStageToDealStage(matchStage: string): DealStage {
  switch (matchStage) {
    case "candidate": return "new_opportunity";
    case "presented": return "contacted";
    case "viewing_scheduled": return "meeting_scheduled";
    case "viewed": return "property_visit";
    case "negotiation": return "negotiation";
    case "offer_submitted": case "offer_made": return "offer_sent";
    case "accepted": return "agreement_draft";
    case "closed": return "closed";
    case "lost": return "lost";
    default: return "new_opportunity";
  }
}

export interface DealScoreInput {
  stage: DealStage;
  matchClosingProbability: number;
  matchRisk: number;
  matchUrgency: number;
  matchMomentum: number;
  daysInStage: number | null;
  openObjections: number;
  highObjections: number;
}

export interface DealScores { deal_probability: number; deal_health: number; deal_risk: number; deal_velocity: number }

export function computeDealScores(i: DealScoreInput): DealScores {
  const base = STAGE_BASE_PROB[i.stage];
  let prob = base * 0.45 + i.matchClosingProbability * 0.35 + i.matchMomentum * 0.1 + (100 - i.matchRisk) * 0.1;
  if (i.highObjections > 0) prob -= i.highObjections * 8;
  if (i.daysInStage != null && i.daysInStage > (STAGE_DAYS[i.stage] || 30) * 1.5) prob -= 10;
  const probability = clamp(prob);

  let risk = i.matchRisk * 0.5 + i.openObjections * 6 + i.highObjections * 10;
  if (i.daysInStage != null && i.daysInStage > (STAGE_DAYS[i.stage] || 30)) risk += 12;
  const dealRisk = clamp(risk);

  const health = clamp(probability * 0.45 + (100 - dealRisk) * 0.3 + i.matchMomentum * 0.15 + i.matchUrgency * 0.1);

  // Velocity: how fast vs the expected pace for the stage. On/under pace = high.
  let velocity = 70;
  if (i.daysInStage != null) {
    const expected = STAGE_DAYS[i.stage] || 30;
    const ratio = i.daysInStage / Math.max(1, expected);
    velocity = ratio <= 0.5 ? 95 : ratio <= 1 ? 80 : ratio <= 1.5 ? 55 : ratio <= 2.5 ? 35 : 18;
  }
  return { deal_probability: probability, deal_health: health, deal_risk: dealRisk, deal_velocity: clamp(velocity) };
}

// ── Negotiation ──────────────────────────────────────────────────────────────
export function negotiationGap(asking: number | null, buyerOffer: number | null, sellerCounter: number | null): { gap: number; agreementProbability: number } {
  const high = sellerCounter ?? asking ?? 0;
  const low = buyerOffer ?? 0;
  if (!high || !low) return { gap: 0, agreementProbability: 50 };
  const gap = Math.max(0, high - low);
  const pct = high > 0 ? gap / high : 0;
  const agreementProbability = clamp(pct <= 0.01 ? 95 : pct <= 0.03 ? 82 : pct <= 0.06 ? 65 : pct <= 0.1 ? 45 : pct <= 0.15 ? 28 : 12);
  return { gap, agreementProbability };
}

// ── Objections ───────────────────────────────────────────────────────────────
export const OBJECTION_LABEL: Record<string, string> = {
  price: "מחיר", financing: "מימון", location: "מיקום", timing: "תזמון",
  competition: "תחרות", seller_concern: "חשש מוכר", legal: "משפטי", other: "אחר",
};

// ── Next deal action ─────────────────────────────────────────────────────────
export interface DealAction { title: string; priority: "low" | "medium" | "high"; impact: number; reason: string; deadlineDays: number }

export function nextDealAction(stage: DealStage, risk: number, openObjections: number, daysInStage: number | null): DealAction {
  if (openObjections > 0) return { title: "טפל בהתנגדות פתוחה", priority: "high", impact: 80, reason: "התנגדות לא פתורה חוסמת התקדמות", deadlineDays: 2 };
  if (risk >= 65) return { title: "התערבות לשמירת העסקה", priority: "high", impact: 85, reason: `סיכון גבוה (${risk})`, deadlineDays: 1 };
  const stale = daysInStage != null && daysInStage > (STAGE_DAYS[stage] || 30);
  switch (stage) {
    case "new_opportunity": case "contacted": return { title: "צור קשר ותאם פגישה", priority: stale ? "high" : "medium", impact: 60, reason: "האץ את העסקה לשלב הבא", deadlineDays: 2 };
    case "meeting_scheduled": case "property_visit": return { title: "בצע ביקור והכן הצעה", priority: "medium", impact: 65, reason: "קדם להגשת הצעה", deadlineDays: 3 };
    case "negotiation": return { title: "צמצם פערים והנע להצעה", priority: "high", impact: 78, reason: "שלב משא ומתן קריטי", deadlineDays: 2 };
    case "offer_sent": case "offer_received": return { title: "קדם לסגירת ההסכם", priority: "high", impact: 82, reason: "הצעה פעילה — סגור מהר", deadlineDays: 2 };
    case "agreement_draft": case "legal_review": return { title: "השלם בדיקה משפטית וחתימה", priority: "high", impact: 88, reason: "קרוב לסגירה", deadlineDays: 3 };
    case "signed": return { title: "השלם תהליך הסגירה", priority: "medium", impact: 90, reason: "סגירה סופית", deadlineDays: 5 };
    default: return { title: "המשך קידום העסקה", priority: "medium", impact: 55, reason: "שמור על מומנטום", deadlineDays: 3 };
  }
}

export function buildDealAi(stage: DealStage, s: DealScores, action: DealAction): string {
  return `${DEAL_STAGE_LABEL[stage]} · סיכוי ${s.deal_probability}% · בריאות ${s.deal_health} · סיכון ${s.deal_risk} · מהירות ${s.deal_velocity}. פעולה: ${action.title}.`;
}

export function expectedCloseDate(stage: DealStage, fromIso = new Date().toISOString()): string {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + (STAGE_DAYS[stage] || 30));
  return d.toISOString().slice(0, 10);
}
