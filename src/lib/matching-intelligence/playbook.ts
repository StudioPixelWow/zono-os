/**
 * Matching Intelligence — deterministic playbook (no server imports).
 */
import type { MatchInput } from "./scoring";

export const MATCH_STAGES = [
  "candidate",
  "recommended",
  "file_sent",
  "viewed",
  "visit_scheduled",
  "visit_completed",
  "feedback_received",
  "negotiation",
  "offer_submitted",
  "contract",
  "closed",
  "lost",
] as const;
export type MatchStage = (typeof MATCH_STAGES)[number];

export const STAGE_LABELS: Record<MatchStage, string> = {
  candidate: "מועמד",
  recommended: "מומלץ",
  file_sent: "נשלח תיק",
  viewed: "נצפה",
  visit_scheduled: "ביקור מתוזמן",
  visit_completed: "ביקור בוצע",
  feedback_received: "התקבל משוב",
  negotiation: "משא ומתן",
  offer_submitted: "הוגשה הצעה",
  contract: "חוזה",
  closed: "נסגר",
  lost: "אבוד",
};

export function matchStageIndex(stage: string): number {
  const i = (MATCH_STAGES as readonly string[]).indexOf(stage);
  return i < 0 ? 0 : i;
}
export function nextMatchStage(stage: string): MatchStage | null {
  const i = matchStageIndex(stage);
  if (i >= 9) return null; // contract → manual close
  return MATCH_STAGES[i + 1];
}

const COMMISSION_RATE = 0.02;
export function dealValue(price: number | null): number {
  return price ?? 0;
}
export function estimatedCommission(price: number | null): number {
  return Math.round((price ?? 0) * COMMISSION_RATE);
}

// ── Risks ────────────────────────────────────────────────────────────────────
export interface MatchRiskSeed { riskType: string; severity: string; title: string; description: string; recommendedAction: string }
export function detectMatchRisks(m: MatchInput): MatchRiskSeed[] {
  const r: MatchRiskSeed[] = [];
  if (m.buyerDaysSinceActivity != null && m.buyerDaysSinceActivity >= 14)
    r.push({ riskType: "buyer_inactive", severity: "high", title: "הקונה לא פעיל", description: "אין פעילות מצד הקונה זמן רב.", recommendedAction: "שיחת מעקב עם הקונה" });
  if (m.sellerTrust != null && m.sellerTrust < 45)
    r.push({ riskType: "seller_trust_low", severity: "medium", title: "אמון מוכר נמוך", description: "אמון המוכר עלול לסכן את העסקה.", recommendedAction: "חיזוק הקשר עם המוכר" });
  if (m.buyerFinancing < 45)
    r.push({ riskType: "financing_risk", severity: "high", title: "סיכון מימון", description: "מימון הקונה אינו ודאי.", recommendedAction: "לתאם ייעוץ מימון" });
  if (m.openObjections > 0)
    r.push({ riskType: "objection_unresolved", severity: "medium", title: "התנגדות פתוחה", description: "קיימת התנגדות שלא טופלה.", recommendedAction: "פגישת טיפול בהתנגדות" });
  if (m.visits === 0 && m.matchStageIndex >= 2)
    r.push({ riskType: "no_visit", severity: "medium", title: "אין ביקור מתוזמן", description: "התיק נשלח אך אין ביקור.", recommendedAction: "לתאם ביקור" });
  if (m.sellerChurn != null && m.sellerChurn >= 60)
    r.push({ riskType: "pricing_gap", severity: "high", title: "סיכון מצד המוכר", description: "סיכון נטישת המוכר גבוה.", recommendedAction: "שיחת מחיר/עדכון מול המוכר" });
  return r;
}

// ── Next best actions ────────────────────────────────────────────────────────
export interface MatchActionSeed { actionType: string; title: string; urgency: number; impact: number; confidence: number; closingGain: number }

export function nextBestMatchActions(m: MatchInput, stage: string): MatchActionSeed[] {
  const idx = matchStageIndex(stage);
  const all: MatchActionSeed[] = [
    { actionType: "send_file", title: "שליחת תיק נכס לקונה", urgency: 80, impact: 70, confidence: 85, closingGain: 12 },
    { actionType: "schedule_visit", title: "תיאום ביקור בנכס", urgency: 85, impact: 85, confidence: 80, closingGain: 20 },
    { actionType: "financing_call", title: "שיחת מימון", urgency: 70, impact: 75, confidence: 75, closingGain: 15 },
    { actionType: "seller_pricing", title: "בחינת מחיר מול המוכר", urgency: 65, impact: 70, confidence: 65, closingGain: 14 },
    { actionType: "objection_meeting", title: "פגישת טיפול בהתנגדויות", urgency: 68, impact: 72, confidence: 70, closingGain: 16 },
    { actionType: "offer_prep", title: "הכנת הצעה", urgency: 75, impact: 90, confidence: 70, closingGain: 22 },
  ];
  return all
    .map((a) => {
      let u = a.urgency;
      if (a.actionType === "send_file" && idx < 2) u += 20;
      if (a.actionType === "schedule_visit" && idx >= 2 && m.visits === 0) u += 22;
      if (a.actionType === "financing_call" && m.buyerFinancing < 45) u += 18;
      if (a.actionType === "objection_meeting" && m.openObjections > 0) u += 20;
      if (a.actionType === "seller_pricing" && m.sellerChurn != null && m.sellerChurn >= 60) u += 15;
      if (a.actionType === "offer_prep" && idx >= 6) u += 25;
      return { ...a, urgency: Math.min(100, u) };
    })
    .sort((x, y) => y.urgency - x.urgency);
}
