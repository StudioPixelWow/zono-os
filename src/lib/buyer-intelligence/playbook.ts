/**
 * Buyer Intelligence — deterministic playbook (no server imports).
 * Journey stages, default missions, risk detection, objection ranking,
 * next-best-actions and touchpoint impacts.
 */
import type { BuyerScoreContext } from "./scoring";

const DAY = 86_400_000;
export const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

// ── Journey ──────────────────────────────────────────────────────────────────
export const BUYER_STAGES = [
  "new_lead",
  "qualified",
  "discovery",
  "active_search",
  "active_visits",
  "financing",
  "negotiation",
  "offer_submitted",
  "contract",
  "closed",
  "lost",
] as const;
export type BuyerStage = (typeof BUYER_STAGES)[number];

export const STAGE_LABELS: Record<BuyerStage, string> = {
  new_lead: "ליד חדש",
  qualified: "מוסמך",
  discovery: "אפיון צרכים",
  active_search: "חיפוש פעיל",
  active_visits: "ביקורים פעילים",
  financing: "מימון",
  negotiation: "משא ומתן",
  offer_submitted: "הוגשה הצעה",
  contract: "חוזה",
  closed: "נסגר",
  lost: "אבוד",
};

export function stageIndex(stage: string): number {
  const i = (BUYER_STAGES as readonly string[]).indexOf(stage);
  return i < 0 ? 0 : i;
}
export function nextStage(stage: string): BuyerStage | null {
  const i = stageIndex(stage);
  // don't auto-advance into closed/lost (terminal, manual)
  if (i >= 8) return null;
  return BUYER_STAGES[i + 1];
}

// ── Missions ─────────────────────────────────────────────────────────────────
export interface BuyerMissionSeed {
  title: string;
  description: string;
  targetMetric: string;
  targetValue: number;
  dueInDays: number;
  priority: string;
}
export function defaultBuyerMissions(): BuyerMissionSeed[] {
  return [
    { title: "להסמיך את הקונה (תקציב + העדפות)", description: "השלמת תקציב, אזורים מועדפים וסוגי נכס.", targetMetric: "qualification", targetValue: 80, dueInDays: 3, priority: "high" },
    { title: "לקבוע פגישת היכרות ראשונה", description: "פגישה להבנת צרכים ובניית אמון.", targetMetric: "meetings", targetValue: 1, dueInDays: 5, priority: "high" },
    { title: "להשלים בדיקת מימון", description: "אישור עקרוני / יכולת מימון.", targetMetric: "financing", targetValue: 70, dueInDays: 14, priority: "medium" },
    { title: "להציג 5 נכסים מתאימים", description: "שליחת תיקי נכס מותאמים להעדפות.", targetMetric: "viewed", targetValue: 5, dueInDays: 14, priority: "medium" },
    { title: "לתאם 3 ביקורים", description: "ביקורים בנכסים רלוונטיים.", targetMetric: "visits", targetValue: 3, dueInDays: 30, priority: "medium" },
  ];
}

// ── Risks ────────────────────────────────────────────────────────────────────
export interface BuyerRiskSeed {
  riskType: string;
  severity: string;
  title: string;
  description: string;
  recommendedAction: string;
}
export function detectBuyerRisks(c: BuyerScoreContext): BuyerRiskSeed[] {
  const r: BuyerRiskSeed[] = [];
  if (c.daysSinceActivity == null || c.daysSinceActivity >= 14)
    r.push({ riskType: "no_activity", severity: "high", title: "אין פעילות", description: "הקונה לא היה פעיל זמן רב.", recommendedAction: "שיחת מעקב" });
  if (!c.hasPreapproval)
    r.push({ riskType: "financing_uncertainty", severity: "medium", title: "מימון לא ודאי", description: "אין אישור עקרוני / יכולת מימון לא ברורה.", recommendedAction: "לקבוע ייעוץ מימון" });
  if (c.recentTouchpoints === 0)
    r.push({ riskType: "low_engagement", severity: "medium", title: "מעורבות נמוכה", description: "אין נקודות מגע אחרונות.", recommendedAction: "ליזום קשר" });
  if (c.visitsCount === 0 && c.viewedCount >= 3)
    r.push({ riskType: "no_visits", severity: "medium", title: "אין ביקורים", description: "ראה נכסים אך לא ביקר.", recommendedAction: "לתאם ביקור" });
  if (c.viewedCount === 0 && c.recentTouchpoints > 0)
    r.push({ riskType: "no_property_interest", severity: "low", title: "אין התעניינות בנכסים", description: "לא הביע עניין בנכס ספציפי.", recommendedAction: "להציג נכסים מותאמים" });
  if (!c.hasBudget)
    r.push({ riskType: "budget_mismatch", severity: "medium", title: "תקציב לא מוגדר", description: "אין תקציב מוגדר — קושי בהתאמה.", recommendedAction: "לברר תקציב ויכולת" });
  if (c.openObjections >= 2)
    r.push({ riskType: "unrealistic_expectations", severity: "high", title: "ריבוי התנגדויות", description: "מספר התנגדויות פתוחות מעכבות התקדמות.", recommendedAction: "פגישת טיפול בהתנגדויות" });
  if (c.daysSinceActivity != null && c.daysSinceActivity >= 45)
    r.push({ riskType: "long_decision_cycle", severity: "high", title: "מחזור החלטה ארוך", description: "תהליך ההחלטה מתארך מאוד.", recommendedAction: "לבחון רצינות ולחדד צרכים" });
  return r;
}

// ── Objections ───────────────────────────────────────────────────────────────
export const OBJECTION_LABELS: Record<string, string> = {
  price: "מחיר גבוה",
  location: "מיקום",
  financing: "מימון",
  waiting: "ממתין",
  comparing: "משווה אפשרויות",
  family: "שיקולי משפחה",
  timing: "תזמון",
};
const OBJECTION_ACTIONS: Record<string, string> = {
  price: "להציג נתוני שוק / נכס חלופי בתקציב",
  location: "להציג אזורים חלופיים מתאימים",
  financing: "לקבוע ייעוץ מימון",
  waiting: "ליצור תחושת דחיפות עם הזדמנות",
  comparing: "להבליט יתרונות והשוואה ממוקדת",
  family: "לערב את מקבלי ההחלטה בפגישה",
  timing: "לתאם לוח זמנים ולשמור על קשר",
};
export function objectionAction(type: string | null): string {
  return type ? (OBJECTION_ACTIONS[type] ?? "פגישת טיפול בהתנגדות") : "פגישת טיפול בהתנגדות";
}

// ── Next best actions ────────────────────────────────────────────────────────
export interface BuyerActionSeed {
  actionType: string;
  title: string;
  urgency: number;
  impact: number;
  confidence: number;
  conversionGain: number;
}
const ALL_ACTIONS: BuyerActionSeed[] = [
  { actionType: "schedule_visit", title: "תיאום ביקור בנכס", urgency: 80, impact: 85, confidence: 80, conversionGain: 18 },
  { actionType: "send_property_file", title: "שליחת תיק נכס מותאם", urgency: 75, impact: 70, confidence: 85, conversionGain: 12 },
  { actionType: "financing_consultation", title: "ייעוץ מימון", urgency: 70, impact: 75, confidence: 75, conversionGain: 15 },
  { actionType: "follow_up_call", title: "שיחת מעקב", urgency: 72, impact: 55, confidence: 85, conversionGain: 8 },
  { actionType: "objection_meeting", title: "פגישת טיפול בהתנגדויות", urgency: 65, impact: 70, confidence: 70, conversionGain: 14 },
  { actionType: "present_alternative", title: "הצגת נכס חלופי", urgency: 60, impact: 65, confidence: 70, conversionGain: 10 },
];
export function nextBestBuyerActions(c: BuyerScoreContext): BuyerActionSeed[] {
  const boosted = ALL_ACTIONS.map((a) => {
    let urgency = a.urgency;
    if (a.actionType === "follow_up_call" && (c.daysSinceActivity ?? 99) >= 14) urgency += 20;
    if (a.actionType === "financing_consultation" && !c.hasPreapproval) urgency += 18;
    if (a.actionType === "schedule_visit" && c.visitsCount === 0 && c.viewedCount >= 1) urgency += 15;
    if (a.actionType === "send_property_file" && c.viewedCount === 0) urgency += 15;
    if (a.actionType === "objection_meeting" && c.openObjections >= 1) urgency += 20;
    return { ...a, urgency: Math.min(100, urgency) };
  });
  return boosted.sort((x, y) => y.urgency - x.urgency);
}

// ── Touchpoints ──────────────────────────────────────────────────────────────
export const TOUCHPOINT_IMPACTS: Record<string, { trust: number; engagement: number }> = {
  phone_call: { trust: 4, engagement: 6 },
  whatsapp: { trust: 2, engagement: 4 },
  meeting: { trust: 8, engagement: 8 },
  property_file_sent: { trust: 3, engagement: 6 },
  property_viewed: { trust: 1, engagement: 8 },
  property_visit: { trust: 6, engagement: 12 },
  financing_discussion: { trust: 6, engagement: 5 },
  feedback_session: { trust: 5, engagement: 7 },
};
export const TOUCHPOINT_LABELS: Record<string, string> = {
  phone_call: "שיחת טלפון",
  whatsapp: "וואטסאפ",
  meeting: "פגישה",
  property_file_sent: "נשלח תיק נכס",
  property_viewed: "צפייה בנכס",
  property_visit: "ביקור בנכס",
  financing_discussion: "שיחת מימון",
  feedback_session: "שיחת משוב",
};
