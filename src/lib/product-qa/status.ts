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
  { id: 9, title: "ניהול סוכנים (בעל משרד)", status: "pass", notes: "/admin/agents (מנהל/בעלים): הזמנה עם קישור, רשימת הזמנות + ביטול, סוכנים עם שינוי תפקיד והפעלה/השבתה, RLS. צירוף אוטומטי הושלם: הרשמה דרך הקישור נושאת את ה-token, ועמוד /join מצרף את הסוכן לארגון המזמין (אימות תאימות אימייל) ומסמן את ההזמנה כנוצלה.", lastChecked: TODAY },
  { id: 10, title: "ייבוא מודעות חיצוניות בקנה מידה", status: "pass", notes: "מצבי סנכרון מדורגים בבורר: מהיר 50/עיר, רגיל 250, מלא 500, מתקדם 1000 (מנהל) — מחליף את התקרה הקבועה של 100. כל מצב חוסם גם מס' מודעות לעיר וגם מס' ערים, לוג מצב, וכשל בעיר אחת לא מפיל את כל הסנכרון. נוסף cursor/resumable: סנכרון מתקדם שנקטע ממשיך מהערים שטרם הושלמו (checkpoint ב-import_jobs.params).", lastChecked: TODAY },
  { id: 11, title: "אזורי פעילות מניעים ייבוא ומודיעין", status: "pass", notes: "הסנכרון נשען על organization_operating_localities (activeLocalities) — הוספת עיר מזינה אוטומטית את הייבוא; market/transactions/recommendations/territories כבר צורכים את אותם אזורים.", lastChecked: TODAY },
  { id: 12, title: "עמוד דוח QA", status: "pass", notes: "עמוד זה — מצב כל נושא במבט אחד.", lastChecked: TODAY },
  // ── QA Pack #2 ──
  { id: 13, title: "P2 · תמונות נכס אחרי פרסום", status: "pass", notes: "שורש: cleanupAbandonedDrafts מחק טיוטות עם מדיה (cascade) — תוקן לדלג על טיוטות עם תמונות. פרסום ממלא תמונה ראשית מהגלריה אם חסרה. + SQL לדלי property-media ציבורי.", lastChecked: TODAY },
  { id: 14, title: "P2 · מוכר חדש מתקשר אוטומטית", status: "pass", notes: "יצירה inline באשף מקשרת ובוחרת את המוכר אוטומטית ללא חיפוש מחדש.", lastChecked: TODAY },
  { id: 15, title: "P2 · חיפוש מוכר (autocomplete)", status: "pass", notes: "חיפוש debounced תוך כדי הקלדה (≥2 תווים) לפי שם/טלפון/אימייל.", lastChecked: TODAY },
  { id: 16, title: "P2 · שם ZONO קריאייטיב", status: "pass", notes: "שונה גלובלית מ'סטודיו שיווק' ל-'ZONO קריאייטיב' (תפריט/כותרות/ניווט) + /creative כניסה ישירה.", lastChecked: TODAY },
  { id: 17, title: "P2 · כניסה ישירה לקריאייטיב (ללא UUID)", status: "pass", notes: "המשגר עבר לבורר ישויות אמיתי (כל אופציה נושאת UUID); אין יותר הקלדת מזהה גולמי.", lastChecked: TODAY },
  { id: 18, title: "P2 · העלאת מדיה ביצירה (ללא URL)", status: "pass", notes: "שדה תמונת הדירה ביצירה המהירה הוחלף בהעלאה מהמחשב (storage) שמייצר URL פנימית.", lastChecked: TODAY },
  { id: 19, title: "P2 · סנכרון פרופיל מותג (אין אזהרות שווא)", status: "pass", notes: "אזהרות 'חסר' מחושבות מהערכים הסופיים אחרי Brand Identity (master) — לא נדלקות כשהמידע קיים בהגדרות.", lastChecked: TODAY },
  { id: 20, title: "P2 · שגיאת UUID בוריאציות", status: "pass", notes: "isUuid() חוסם שם/slug מקודד מלהגיע לעמודות uuid; שאילתות מדלגות על מזהה לא-תקין; עמוד הסטודיו מציג הודעה ידידותית.", lastChecked: TODAY },
];

export const QA_SUMMARY = {
  pass: QA_ITEMS.filter((i) => i.status === "pass").length,
  partial: QA_ITEMS.filter((i) => i.status === "partial").length,
  fail: QA_ITEMS.filter((i) => i.status === "fail").length,
  total: QA_ITEMS.length,
};
