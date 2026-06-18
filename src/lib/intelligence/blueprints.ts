/**
 * Property Intelligence — blueprint engine (deterministic content, no server
 * imports). Picks a system blueprint for a property and provides the default
 * Hebrew missions / levers / tasks / calendar / risk candidates the service
 * materialises into rows. Blueprint JSON in the DB can override later.
 */
import type { ScoreContext } from "./scoring";

export interface PropertyShape {
  type: string;
  listingKind: string; // 'sale' | 'rent'
  hasExclusivity: boolean;
}

/** Name of the seeded system blueprint that best fits a property. */
export function selectBlueprintName(p: PropertyShape): string {
  if (p.listingKind === "rent") return "השכרה";
  if (p.type === "penthouse") return "פנטהאוז / יוקרה";
  if (p.hasExclusivity) return "נכס בבלעדיות";
  if (p.type === "garden_apartment") return "דירת גן";
  if (p.type === "commercial" || p.type === "office") return "נכס מסחרי";
  if (p.type === "land") return "מגרש / קרקע";
  return "דירת יד שנייה רגילה";
}

export function isExclusive(p: PropertyShape): boolean {
  return p.hasExclusivity;
}

const DAY = 86_400_000;
export const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

export interface MissionSeed {
  title: string;
  description: string;
  targetMetric: string;
  targetValue: number;
  dueInDays: number;
  priority: string;
}

export function defaultMissions(p: PropertyShape): MissionSeed[] {
  const base: MissionSeed[] = [
    { title: "להשלים מוכנות שיווק תוך 72 שעות", description: "השלמת תמונות, תיאור שיווקי ותיק נכס.", targetMetric: "readiness", targetValue: 100, dueInDays: 3, priority: "high" },
    { title: "לייצר 10 פניות איכותיות ב־14 יום", description: "פניות רלוונטיות מערוצי השיווק.", targetMetric: "leads", targetValue: 10, dueInDays: 14, priority: "high" },
    { title: "לקבוע 5 ביקורים עד סוף החודש", description: "תיאום ביקורים עם קונים פוטנציאליים.", targetMetric: "visits", targetValue: 5, dueInDays: 30, priority: "medium" },
    { title: "לקבל הצעה ראשונה תוך 21 יום", description: "הצעת רכישה ראשונה מקונה.", targetMetric: "offers", targetValue: 1, dueInDays: 21, priority: "medium" },
  ];
  if (isExclusive(p)) {
    base.push({ title: "לשלוח דוח מוכר כל 7 ימים", description: "עדכון שבועי שוטף למוכר על התקדמות.", targetMetric: "reports", targetValue: 4, dueInDays: 30, priority: "high" });
  }
  return base;
}

export interface LeverSeed {
  leverType: string;
  title: string;
  expectedImpact: string;
  impact: number;
  effort: number;
  urgency: number;
  confidence: number;
}

export const defaultLevers: LeverSeed[] = [
  { leverType: "photography", title: "צילום מקצועי", expectedImpact: "עד +35% פניות", impact: 85, effort: 40, urgency: 80, confidence: 90 },
  { leverType: "video", title: "סרטון וידאו", expectedImpact: "עד +20% צפיות", impact: 70, effort: 55, urgency: 55, confidence: 75 },
  { leverType: "virtual_tour", title: "סיור וירטואלי", expectedImpact: "סינון קונים איכותי", impact: 60, effort: 60, urgency: 45, confidence: 70 },
  { leverType: "price_drop", title: "בחינת התאמת מחיר", expectedImpact: "האצת קצב הפניות", impact: 75, effort: 30, urgency: 60, confidence: 65 },
  { leverType: "seller_report", title: "דוח מוכר", expectedImpact: "חיזוק אמון המוכר", impact: 55, effort: 35, urgency: 70, confidence: 80 },
  { leverType: "paid_campaign", title: "קמפיין ממומן", expectedImpact: "הגדלת חשיפה", impact: 65, effort: 50, urgency: 55, confidence: 60 },
  { leverType: "agent_distribution", title: "הפצה לסוכנים", expectedImpact: "הרחבת רשת קונים", impact: 60, effort: 40, urgency: 55, confidence: 70 },
  { leverType: "buyer_blast", title: "שליחה לקונים קיימים", expectedImpact: "פניות מהירות", impact: 55, effort: 25, urgency: 65, confidence: 75 },
  { leverType: "facebook_groups", title: "פוסט קבוצות פייסבוק", expectedImpact: "חשיפה אורגנית", impact: 45, effort: 30, urgency: 50, confidence: 65 },
  { leverType: "description_update", title: "עדכון תיאור נכס", expectedImpact: "שיפור המרה", impact: 40, effort: 20, urgency: 60, confidence: 80 },
];

export interface TaskSeed {
  title: string;
  priority: string;
  dueInDays: number;
}

export function defaultTasks(p: PropertyShape): TaskSeed[] {
  const base: TaskSeed[] = [
    { title: "אמת פרטי בעלים", priority: "high", dueInDays: 1 },
    { title: "בדוק מחיר מול השוק", priority: "high", dueInDays: 2 },
    { title: "קבע יום צילום", priority: "high", dueInDays: 2 },
    { title: "הכן תיאור שיווקי", priority: "medium", dueInDays: 3 },
    { title: "בנה תיק נכס", priority: "medium", dueInDays: 3 },
    { title: "פרסם בערוצי שיווק", priority: "high", dueInDays: 3 },
    { title: "צור קשר עם קונים רלוונטיים", priority: "medium", dueInDays: 5 },
  ];
  if (isExclusive(p)) {
    base.push({ title: "שלח דוח מוכר", priority: "medium", dueInDays: 7 });
    base.push({ title: "הפץ לסוכנים חיצוניים", priority: "medium", dueInDays: 5 });
  }
  return base;
}

export interface CalendarSeed {
  planType: string;
  title: string;
  withinDays: number;
  priority: string;
  reason: string;
}

export function defaultCalendar(p: PropertyShape): CalendarSeed[] {
  const base: CalendarSeed[] = [
    { planType: "photoshoot", title: "יום צילום", withinDays: 2, priority: "high", reason: "מומלץ לצלם תוך 48 שעות מהעלאת הנכס" },
    { planType: "seller_call", title: "שיחת עדכון מוכר", withinDays: 7, priority: "medium", reason: "שיחת עדכון שבועית עם המוכר" },
    { planType: "price_review", title: "בדיקת מחיר", withinDays: 21, priority: "medium", reason: "בחינת מיצוב המחיר מול השוק" },
    { planType: "buyer_tour", title: "סיור קונים", withinDays: 10, priority: "medium", reason: "ארגון סיור לקונים רלוונטיים" },
    { planType: "strategy_meeting", title: "פגישת אסטרטגיה", withinDays: 30, priority: "low", reason: "פגישת אסטרטגיה חודשית" },
  ];
  if (isExclusive(p)) {
    base.unshift({ planType: "weekly_report", title: "דוח שבועי", withinDays: 7, priority: "high", reason: "שליחת דוח שבועי למוכר (בלעדיות)" });
  }
  return base;
}

// Exposure channels every property should track (status starts not_published).
export const exposureChannels = [
  "אתר משרד",
  "יד2",
  "מדלן",
  "פייסבוק",
  "אינסטגרם",
  "וואטסאפ",
  "דיוור",
  "סוכנים חיצוניים",
  "קמפיין ממומן",
];

export interface RiskSeed {
  riskType: string;
  severity: string;
  title: string;
  description: string;
  recommendedAction: string;
}

/** Live risk detection from the current property context (deterministic). */
export function detectRiskCandidates(c: ScoreContext): RiskSeed[] {
  const risks: RiskSeed[] = [];
  if (!c.hasPrimaryImage && c.mediaCount === 0)
    risks.push({ riskType: "no_images", severity: "high", title: "אין תמונות", description: "לנכס אין תמונות — פגיעה משמעותית בפניות.", recommendedAction: "להעלות תמונות / לקבוע צילום" });
  if (!c.hasVideo)
    risks.push({ riskType: "no_video", severity: "low", title: "אין וידאו", description: "סרטון וידאו מגדיל צפיות ואמון.", recommendedAction: "להוסיף סרטון וידאו" });
  if (!c.hasMarketingDescription)
    risks.push({ riskType: "no_marketing_desc", severity: "medium", title: "חסר תיאור שיווקי", description: "אין תיאור שיווקי שמושך קונים.", recommendedAction: "להכין תיאור שיווקי" });
  if (c.documentCount === 0)
    risks.push({ riskType: "missing_document", severity: "medium", title: "חסר מסמך", description: "אין מסמכים מצורפים (נסח, ארנונה).", recommendedAction: "להעלות מסמכי נכס" });
  if (c.activeChannels === 0)
    risks.push({ riskType: "not_published", severity: "high", title: "לא פורסם", description: "הנכס אינו מפורסם באף ערוץ.", recommendedAction: "לפרסם בערוצי שיווק" });
  if (c.daysSinceSellerUpdate != null && c.daysSinceSellerUpdate >= 14)
    risks.push({ riskType: "seller_stale", severity: "medium", title: "מוכר לא עודכן 14 יום", description: "המוכר לא קיבל עדכון זמן רב.", recommendedAction: "לשלוח עדכון / דוח למוכר" });
  if (c.totalLeads === 0 && c.daysSinceActivity >= 7)
    risks.push({ riskType: "no_leads", severity: "medium", title: "אין פניות 7 ימים", description: "לא התקבלו פניות בשבוע האחרון.", recommendedAction: "להגביר חשיפה / לבחון מחיר" });
  if (c.recentVisits === 0 && c.daysSinceActivity >= 14)
    risks.push({ riskType: "no_visits", severity: "medium", title: "אין ביקורים 14 יום", description: "לא נקבעו ביקורים זמן רב.", recommendedAction: "ליזום סיור קונים" });
  if (c.stalled)
    risks.push({ riskType: "stalled", severity: "high", title: "נכס תקוע", description: "אין פעילות לאורך זמן — הנכס תקוע.", recommendedAction: "לקדם שלב / לבצע מנוף צמיחה" });
  return risks;
}
