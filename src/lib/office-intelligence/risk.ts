// ============================================================================
// ZONO — Office Risk Center (pure, deterministic). Detects + ranks where the
// business is leaking money/opportunities, from already-aggregated signals.
// ============================================================================
import type { RiskItem, Severity } from "./types";

export interface RiskInput {
  ignoredHotOpportunities: number;     // high exclusive prob, uncontacted
  sellersNotContacted: number;
  perfectMatchesUnhandled: number;
  overdueFollowups: number;
  dealsStuck: number;
  staleListings: number;               // old, no activity
  providerDegraded: boolean;
  creditsRemaining: number;
  creditsBudget: number;
  inactiveAgents: number;
  buyersGoingCold: number;
  sellersLikelyLost: number;
}

const SEV_RANK: Record<Severity, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function detectOfficeRisks(i: RiskInput): RiskItem[] {
  const out: RiskItem[] = [];
  const push = (type: string, severity: Severity, title: string, reason: string, businessImpact: string, recommendedAction: string) =>
    out.push({ id: `risk-${type}`, type, severity, title, reason, businessImpact, owner: null, recommendedAction, status: "open" });

  if (i.ignoredHotOpportunities > 0)
    push("hot_opportunity_ignored", i.ignoredHotOpportunities >= 5 ? "urgent" : "high", `${i.ignoredHotOpportunities} הזדמנויות חמות ללא פנייה`, "הזדמנויות בסבירות בלעדיות גבוהה לא קיבלו פנייה.", "אובדן בלעדיות פוטנציאלית למתחרים.", "להקצות פנייה מיידית להזדמנויות החמות.");
  if (i.sellersNotContacted > 0)
    push("seller_not_contacted", i.sellersNotContacted >= 10 ? "high" : "medium", `${i.sellersNotContacted} מוכרים ללא יצירת קשר`, "מוכרים פוטנציאליים שטרם נוצר איתם קשר.", "פספוס בלעדיות ומלאי.", "לתעדף פנייה למוכרים בעדיפות גבוהה.");
  if (i.perfectMatchesUnhandled > 0)
    push("perfect_match_unhandled", "high", `${i.perfectMatchesUnhandled} התאמות מושלמות לא טופלו`, "קיימים קונים מושלמים שלא קיבלו טיפול.", "אובדן עסקה כמעט-ודאית.", "לתאם צפייה/פנייה לקונים המתאימים.");
  if (i.overdueFollowups > 0)
    push("overdue_followup", i.overdueFollowups >= 15 ? "high" : "medium", `${i.overdueFollowups} מעקבים באיחור`, "משימות מעקב שעבר זמנן.", "התקררות לידים.", "לסגור מעקבים באיחור היום.");
  if (i.dealsStuck > 0)
    push("deal_stuck", "medium", `${i.dealsStuck} עסקאות תקועות`, "עסקאות ללא התקדמות.", "האטה בצנרת ההכנסות.", "לבדוק חסמים מול הסוכנים.");
  if (i.staleListings > 0)
    push("stale_listing", "low", `${i.staleListings} נכסים ללא פעילות`, "נכסים ותיקים ללא עדכון.", "מלאי לא פעיל.", "לרענן או לתעדף מחדש.");
  if (i.providerDegraded)
    push("provider_degraded", "high", "ספק נתונים במצב ירוד", "איכות נתוני הספק ירדה מתחת לסף.", "פגיעה באמינות הסריקה והזיהוי.", "לבדוק את בריאות הספקים במסך ה‑QA.");
  if (i.creditsBudget > 0 && i.creditsRemaining / i.creditsBudget < 0.15)
    push("credit_budget", "medium", "תקציב קרדיטים מתקרב לסוף", "נותרו פחות מ‑15% מהקרדיטים היומיים.", "סיכון לעצירת סריקות.", "להגדיל תקציב או לצמצם אזורי סריקה.");
  if (i.inactiveAgents > 0)
    push("agent_inactivity", "medium", `${i.inactiveAgents} סוכנים לא פעילים`, "סוכנים ללא פעילות תקשורת.", "תפוקת משרד נמוכה.", "לבדוק זמינות ועומסים.");
  if (i.buyersGoingCold > 0)
    push("buyer_cold", "low", `${i.buyersGoingCold} קונים מתקררים`, "קונים ללא מגע לאחרונה.", "אובדן ביקוש.", "לחדש קשר עם הקונים.");
  if (i.sellersLikelyLost > 0)
    push("seller_likely_lost", "high", `${i.sellersLikelyLost} מוכרים בסיכון אובדן`, "מוכרים שסירבו/לא הגיבו לאורך זמן.", "אובדן בלעדיות.", "ניסיון אחרון או סגירת ההזדמנות.");

  return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}
