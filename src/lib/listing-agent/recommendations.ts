// ============================================================================
// 🏠 Listing Agent — Recommendation engine (pure). 29.3. Part 4.
// Turns health + risks + opportunities into ranked, evidence-backed actions with
// priority / ROI / confidence / impact / deadline. Recommendation-only.
// ============================================================================
import { clamp } from "./health";
import type { ListingSignals, PropertyHealth, PropertyRisk, PropertyOpportunity, ListingRecommendation } from "./types";

export function buildRecommendations(sig: ListingSignals, h: PropertyHealth, risks: PropertyRisk[], opps: PropertyOpportunity[]): ListingRecommendation[] {
  const out: ListingRecommendation[] = [];
  const baseConf = clamp(40 + h.confidence * 0.5);
  const mk = (action: string, missionType: string, priority: number, roi: string, impact: ListingRecommendation["impact"], deadlineDays: number | null, evidence: string[], reason: string) =>
    out.push({ action, missionType, priority: clamp(priority), roi, confidence: baseConf, impact, deadlineDays, evidence, reason });

  const hasRisk = (t: string) => risks.find((r) => r.type === t);
  const hasOpp = (t: string) => opps.find((o) => o.type === t);
  const tom = sig.timeOnMarketDays ?? 0;

  if (hasRisk("overpriced")) mk("הורד מחיר מבוקש", "PRICE_REVIEW", 88, "קיצור זמן מכירה + הגדלת פניות", "high", 7, hasRisk("overpriced")!.evidence, "תמחור גבוה מדי לפי תגובת השוק");
  if (hasRisk("stale")) { mk("רענן את המודעה", "MARKETING_REFRESH", 72, "החזרת המודעה לראש התוצאות", "medium", 5, hasRisk("stale")!.evidence, "מודעה מתיישנת"); mk("החלף תמונות", "PHOTOGRAPHY", 60, "העלאת שיעור הקלקה", "medium", 10, ["מודעה ותיקה"], "רענון ויזואלי"); }
  if (hasRisk("weak_exposure") || hasRisk("missing_marketing")) mk("השק קמפיין / הגבר חשיפה", "CAMPAIGN_LAUNCH", 75, "יותר צפיות ולידים", "high", 7, [(hasRisk("weak_exposure") ?? hasRisk("missing_marketing"))!.evidence[0] ?? ""], "חשיפה חלשה");
  if (hasRisk("seller_frustration")) mk("התקשר למוכר", "SELLER_FOLLOWUP", 82, "שימור בלעדיות ואמון", "high", 2, hasRisk("seller_frustration")!.evidence, "סיכון תסכול מוכר");
  if (hasRisk("missing_valuation")) mk("קבע עדכון הערכת שווי", "VALUATION_REVIEW", 55, "דיוק תמחור + אמון מוכר", "medium", 14, ["אין הערכה מקושרת"], "חסרה הערכת שווי");
  if (hasRisk("no_activity")) mk("חזור למתעניינים קודמים", "BUYER_FOLLOWUP", 58, "החייאת עניין", "medium", 5, ["אין פעילות אחרונה"], "אין פעילות");
  if (hasRisk("competition_pressure")) mk("חזק בידול/חשיפה מול מתחרים", "CAMPAIGN_LAUNCH", 62, "שמירת נתח תשומת-לב", "medium", 10, [`לחץ תחרות ${h.competitionPressure}`], "לחץ תחרותי");

  if (hasOpp("high_demand")) { mk("צור בית פתוח", "OPEN_HOUSE", 70, "ריכוז מתעניינים והאצת סגירה", "high", 7, hasOpp("high_demand")!.evidence, "ביקוש גבוה"); mk("חזור למתעניינים", "BUYER_FOLLOWUP", 66, "המרת ביקוש לעסקה", "high", 3, [`${sig.matchCount} התאמות`], "ביקוש גבוה"); }
  if (hasOpp("underpriced") || hasOpp("price_opportunity")) mk("בחן העלאת מחיר", "PRICE_REVIEW", 58, "מקסום ערך", "medium", 7, ["תגובת שוק חזקה"], "אינדיקציה לתמחור נמוך");
  if (hasOpp("market_shift")) mk("עדכן אסטרטגיית תמחור לשוק מתחזק", "PRICE_REVIEW", 52, "ניצול מגמת שוק", "medium", 14, hasOpp("market_shift")!.evidence, "שוק מתחזק");

  if (h.confidence < 55) mk("אסוף מידע חסר על הנכס", "COLLECT_INFO", 50, "שיפור דיוק ההמלצות", "low", 7, [`ביטחון נתונים ${h.confidence}`], "נתונים חסרים");
  if (tom <= 7 && !out.length) mk("עקוב אחר ביצועי המודעה", "MARKETING_REFRESH", 30, "זיהוי מוקדם של תת-ביצוע", "low", 14, ["מודעה חדשה"], "מודעה חדשה — ניטור");

  return out.sort((a, b) => b.priority - a.priority);
}
