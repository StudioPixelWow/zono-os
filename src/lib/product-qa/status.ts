/**
 * Product QA status registry (client-safe). Hand-maintained snapshot of the
 * "Critical Product QA Fixes" pack so the team can see, per issue, what is
 * production-ready vs partial vs pending. Update this as issues are delivered.
 */
export type QaStatus = "pass" | "partial" | "fail";

export interface QaItem {
  id: number;
  title: string;
  status: QaStatus;
  notes: string;
  lastChecked: string; // ISO date
}

const TODAY = "2026-06-22";

export const QA_ITEMS: QaItem[] = [
  { id: 1, title: "העלאת מדיה (גלריית תמונות)", status: "pass", notes: "תוקן באג ה-stale-closure שגרם לכך שרק תמונה אחת נשמרה; תמיכה בריבוי תמונות, גרירה, סדר, תמונה ראשית, התקדמה וניסיון חוזר.", lastChecked: TODAY },
  { id: 2, title: "ערכת שיווק AI", status: "pass", notes: "מחולל ערכת שיווק מלאה (13+ פורמטים, נקודות מכירה, מענה להתנגדויות, SEO) עם בורר טון/אורך/ערוץ, דטרמיניסטי + AI אופציונלי, ללא המצאת מאפיינים.", lastChecked: TODAY },
  { id: 3, title: "בורר קהל יעד מובנה", status: "pass", notes: "רב-בחירה מקובץ + המלצות דטרמיניסטיות + 'קהל נוסף' חופשי, נשמר ב-properties.marketing_audiences (jsonb).", lastChecked: TODAY },
  { id: 4, title: "קישור מוכר באשף הנכס", status: "pass", notes: "צעד 'בעלים/מוכרים': חיפוש/קישור/יצירה inline, סימון מקבל החלטות/מורשה חתימה/ראשי, באנר מוכנות, CTA 'הוסף מוכר עכשיו' לפני פרסום.", lastChecked: TODAY },
  { id: 5, title: "מסמכים וחתימות", status: "pass", notes: "טאב 'מסמך חדש': יצירה ידנית + העלאת קובץ (bucket documents) + סוג/תפוגה/הערות + פריט נדרש ללא קובץ; צפייה/הורדה, הכנת בקשת חתימה, סימון כנחתם, ביטול/ארכוב.", lastChecked: TODAY },
  { id: 6, title: "מחשבוני משכנתא ומימון", status: "pass", notes: "מחשבון החזר חודשי, כושר קנייה, פער הון עצמי, תשואת השקעה + מס רכישה (placeholder), עם disclaimer.", lastChecked: TODAY },
  { id: 7, title: "דשבורד בית — דאטה אמיתית", status: "pass", notes: "כל ווידג'טי הבית נשענים על מודיעין אמיתי דרך containers עם empty-states; נוסף DemoBadge (פיתוח בלבד) על המפה הדקורטיבית כדי שאף הדמיה לא תיראה כנתון אמיתי בפרודקשן.", lastChecked: TODAY },
  { id: 8, title: "ניקוי תפריט צד", status: "pass", notes: "תפריט הצד אורגן ל-7 קטגוריות מתקפלות (ראשי/CRM/מודיעין/שיווק/לקוחות ודיגיטל/ניהול משרד/מערכת) עם פתיחה-סגירה וראות לפי תפקיד — קבוצות ניהול ומערכת גלויות למנהל/בעלים בלבד.", lastChecked: TODAY },
  { id: 9, title: "ניהול סוכנים (בעל משרד)", status: "fail", notes: "מסך ניהול צוות + הזמנות (invite tokens / קישור להעתקה) טרם נבנה.", lastChecked: TODAY },
  { id: 10, title: "ייבוא מודעות חיצוניות בקנה מידה", status: "partial", notes: "סנכרון קיים. מצבי סנכרון (מהיר/רגיל/מלא/מתקדם) עם pagination/cursor/guardrails ממתינים.", lastChecked: TODAY },
  { id: 11, title: "אזורי פעילות מניעים ייבוא ומודיעין", status: "partial", notes: "אזורי הפעילות כבר מזינים חלק מהמודולים; כיסוי מלא ואחיד ממתין.", lastChecked: TODAY },
  { id: 12, title: "עמוד דוח QA", status: "pass", notes: "עמוד זה — מצב כל נושא במבט אחד.", lastChecked: TODAY },
];

export const QA_SUMMARY = {
  pass: QA_ITEMS.filter((i) => i.status === "pass").length,
  partial: QA_ITEMS.filter((i) => i.status === "partial").length,
  fail: QA_ITEMS.filter((i) => i.status === "fail").length,
  total: QA_ITEMS.length,
};
