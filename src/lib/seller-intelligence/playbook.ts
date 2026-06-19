/**
 * Seller Intelligence — deterministic playbook (no server imports).
 * Default missions, live risk detection, ranked next-best-actions, and the
 * trust/engagement impact of each touchpoint type.
 */
import type { SellerScoreContext } from "./scoring";

const DAY = 86_400_000;
export const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

export interface SellerMissionSeed {
  title: string;
  description: string;
  targetMetric: string;
  targetValue: number;
  dueInDays: number;
  priority: string;
}

export function defaultSellerMissions(): SellerMissionSeed[] {
  return [
    { title: "לשמור על קשר שוטף עם המוכר", description: "עדכון יזום לפחות אחת לשבוע.", targetMetric: "touchpoints", targetValue: 4, dueInDays: 30, priority: "high" },
    { title: "לשמר בלעדיות", description: "לחזק את אמון המוכר ולמנוע נטישה.", targetMetric: "trust", targetValue: 75, dueInDays: 30, priority: "high" },
    { title: "לשפר אמון מוכר", description: "לעמוד בהתחייבויות ולשלוח דוחות.", targetMetric: "trust", targetValue: 80, dueInDays: 45, priority: "medium" },
    { title: "להגדיל מעורבות", description: "להגדיל פתיחת דוחות והשתתפות בפגישות.", targetMetric: "engagement", targetValue: 70, dueInDays: 30, priority: "medium" },
  ];
}

export interface SellerRiskSeed {
  riskType: string;
  severity: string;
  title: string;
  description: string;
  recommendedAction: string;
}

export function detectSellerRisks(c: SellerScoreContext): SellerRiskSeed[] {
  const r: SellerRiskSeed[] = [];
  if (c.daysSinceContact == null || c.daysSinceContact >= 21)
    r.push({ riskType: "no_contact", severity: "high", title: "אין קשר", description: "לא נוצר קשר עם המוכר זמן רב.", recommendedAction: "לקבוע שיחת עדכון" });
  if (c.recentTouchpoints === 0)
    r.push({ riskType: "low_engagement", severity: "medium", title: "מעורבות נמוכה", description: "אין נקודות מגע אחרונות.", recommendedAction: "ליזום עדכון יזום" });
  if (c.reportsSent > 0 && c.reportsOpened === 0)
    r.push({ riskType: "low_report_open_rate", severity: "medium", title: "דוחות לא נפתחים", description: "המוכר אינו פותח את הדוחות.", recommendedAction: "לשנות ערוץ/פורמט עדכון" });
  if (c.meetingsCount === 0)
    r.push({ riskType: "no_meetings", severity: "low", title: "אין פגישות", description: "לא התקיימו פגישות עם המוכר.", recommendedAction: "לקבוע פגישת אסטרטגיה" });
  if (c.hasPricingConflict)
    r.push({ riskType: "pricing_conflict", severity: "high", title: "מחלוקת על מחיר", description: "קיים פער ציפיות במחיר.", recommendedAction: "לקבוע שיחת מחיר עם נתוני שוק" });
  if (c.brokenCommitments > 0)
    r.push({ riskType: "communication_gap", severity: "high", title: "התחייבויות שלא קוימו", description: `${c.brokenCommitments} התחייבויות לא מולאו.`, recommendedAction: "להשלים התחייבויות פתוחות מיד" });
  if (c.negativeResponses >= 2)
    r.push({ riskType: "dissatisfaction", severity: "high", title: "חוסר שביעות רצון", description: "התקבלו תגובות שליליות מהמוכר.", recommendedAction: "לקבוע פגישת יישור קו" });
  if ((c.daysSinceContact ?? 99) >= 30)
    r.push({ riskType: "exclusivity_risk", severity: "critical", title: "סיכון לבלעדיות", description: "ניתוק ממושך מסכן את הבלעדיות.", recommendedAction: "ליצור קשר דחוף ולחדש ערך" });
  if (c.activePropertiesCount === 0 && c.propertiesCount > 0)
    r.push({ riskType: "inactive_seller", severity: "medium", title: "מוכר לא פעיל", description: "אין נכסים פעילים למוכר זה.", recommendedAction: "לבחון חידוש שיתוף פעולה" });
  return r;
}

export interface SellerActionSeed {
  actionType: string;
  title: string;
  trustImpact: number;
  engagementImpact: number;
  urgency: number;
  confidence: number;
  effort: number;
}

const ALL_ACTIONS: SellerActionSeed[] = [
  { actionType: "send_report", title: "שליחת דוח מוכר", trustImpact: 18, engagementImpact: 15, urgency: 80, confidence: 85, effort: 25 },
  { actionType: "update_call", title: "שיחת עדכון", trustImpact: 15, engagementImpact: 20, urgency: 75, confidence: 80, effort: 20 },
  { actionType: "pricing_review", title: "שיחת בחינת מחיר", trustImpact: 20, engagementImpact: 10, urgency: 70, confidence: 70, effort: 35 },
  { actionType: "strategy_meeting", title: "פגישת אסטרטגיה", trustImpact: 22, engagementImpact: 18, urgency: 60, confidence: 75, effort: 45 },
  { actionType: "marketing_summary", title: "סיכום ביצועי שיווק", trustImpact: 12, engagementImpact: 14, urgency: 55, confidence: 80, effort: 30 },
  { actionType: "market_positioning", title: "סקירת מיצוב שוק", trustImpact: 14, engagementImpact: 10, urgency: 50, confidence: 65, effort: 40 },
];

/** Rank actions by what would help this seller most right now. */
export function nextBestSellerActions(c: SellerScoreContext): SellerActionSeed[] {
  const boosted = ALL_ACTIONS.map((a) => {
    let urgency = a.urgency;
    if (a.actionType === "send_report" && c.reportsSent === 0) urgency += 15;
    if (a.actionType === "update_call" && (c.daysSinceContact ?? 99) >= 14) urgency += 20;
    if (a.actionType === "pricing_review" && c.hasPricingConflict) urgency += 25;
    if (a.actionType === "strategy_meeting" && c.meetingsCount === 0) urgency += 10;
    return { ...a, urgency: Math.min(100, urgency) };
  });
  return boosted.sort((x, y) => y.urgency - x.urgency);
}

/** Trust/engagement impact applied when a touchpoint of a given type is logged. */
export const TOUCHPOINT_IMPACTS: Record<string, { trust: number; engagement: number }> = {
  phone_call: { trust: 4, engagement: 6 },
  whatsapp: { trust: 2, engagement: 4 },
  meeting: { trust: 8, engagement: 8 },
  report_sent: { trust: 5, engagement: 3 },
  report_opened: { trust: 3, engagement: 8 },
  property_update: { trust: 4, engagement: 4 },
  valuation_review: { trust: 6, engagement: 4 },
  pricing_discussion: { trust: 5, engagement: 3 },
  strategy_session: { trust: 8, engagement: 7 },
};

export const TOUCHPOINT_LABELS: Record<string, string> = {
  phone_call: "שיחת טלפון",
  whatsapp: "וואטסאפ",
  meeting: "פגישה",
  report_sent: "נשלח דוח",
  report_opened: "נפתח דוח",
  property_update: "עדכון נכס",
  valuation_review: "סקירת הערכת שווי",
  pricing_discussion: "שיחת מחיר",
  strategy_session: "פגישת אסטרטגיה",
};
