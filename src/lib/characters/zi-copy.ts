// ============================================================================
// ZONO — ZI Character System · COPY (pure, client-safe).
// ALL ZI wording lives here (never inline in components) so it can later vary by
// user type (agent vs office manager), gender, or language WITHOUT touching a
// single component. ZI speaks like a smart assistant: short, clear, human,
// practical — never childish, never over-punctuated, never a promise that isn't
// backed by real data.
// ============================================================================
import type { ZIState } from "./zi-registry";

export interface ZICopyLine { title?: string; message?: string; cta?: string }

/** Empty-state copy, keyed by the entity that is empty. Each has a clear title,
 *  a short why-it's-fine line, and the real primary action label. */
export const ZI_EMPTY_COPY: Record<string, ZICopyLine> = {
  properties: { title: "עוד לא הוספתם נכס", message: "הוסיפו את הנכס הראשון והתחילו לנהל את כל תהליך השיווק במקום אחד.", cta: "הוספת נכס" },
  buyers: { title: "מאגר הקונים עדיין ריק", message: "הוסיפו קונה או ייבאו אנשי קשר כדי להתחיל לייצר התאמות.", cta: "הוספת קונה" },
  sellers: { title: "אין עדיין מוכרים", message: "הוסיפו מוכר כדי לעקוב אחרי הזדמנויות בלעדיות ולפעול בזמן.", cta: "הוספת מוכר" },
  leads: { title: "אין לידים חדשים כרגע", message: "כשליד חדש ייכנס — הוא יופיע כאן עם הפעולה המומלצת.", cta: "הוספת ליד" },
  matches: { title: "עוד לא נמצאה התאמה מדויקת", message: "ZI תמשיך לבדוק ותעדכן כשנכס מתאים ייכנס למאגר.", cta: "עדכון דרישות הקונה" },
  documents: { title: "אין עדיין מסמכים", message: "העלו מסמך או צרו אחד מתבנית כדי לרכז הכול במקום אחד.", cta: "העלאת מסמך" },
  campaigns: { title: "אין קמפיינים פעילים", message: "צרו קמפיין ראשון והתחילו להביא פניות לנכסים שלכם.", cta: "יצירת קמפיין" },
  generic: { title: "אין כאן עדיין נתונים", message: "כשיהיה מה להציג — זה יופיע כאן.", cta: "" },
};

/** Short status lines for the working / scanning / thinking moments (AI actions). */
export const ZI_STATUS_COPY: Partial<Record<ZIState, string>> = {
  thinking: "ZI מנתחת את הנתונים…",
  scanning: "ZI סורקת את המאגר…",
  working: "ZI מכינה עבורך את התוצאה…",
};

/** Success moments — kept quiet and specific; used by toasts/cards, not confetti. */
export const ZI_SUCCESS_COPY: Record<string, ZICopyLine> = {
  published: { title: "הנכס פורסם בהצלחה", message: "אפשר להתחיל להביא פניות." },
  campaign: { title: "הקמפיין שלך באוויר", message: "נעקוב ונעדכן על הביצועים." },
  saved: { title: "נשמר בהצלחה", message: "" },
  generic: { title: "הכול מוכן. אפשר להתחיל לעבוד", message: "" },
};

/** Alert moments — serious but never alarming; ONLY when a real action is needed. */
export const ZI_ALERT_COPY: Record<string, ZICopyLine> = {
  lead: { title: "הליד הזה ממתין למענה", message: "כדאי ליצור קשר לפני שההתעניינות מתקררת.", cta: "יצירת קשר" },
  document: { title: "נדרש מסמך כדי להמשיך", message: "השלימו את המסמך החסר כדי לא לעכב את התהליך.", cta: "השלמת מסמך" },
  publishFailed: { title: "הפרסום לא הושלם", message: "בואו נתקן את זה ונפרסם מחדש.", cta: "לבדיקה" },
};

/** Celebrate moments — reserved for real milestones only. */
export const ZI_CELEBRATE_COPY: Record<string, ZICopyLine> = {
  deal: { title: "עסקה נסגרה! יש סיבה לחגוג", message: "" },
  monthlyGoal: { title: "הגעתם ליעד החודשי", message: "" },
  onboarding: { title: "המשרד מוכן לצאת לדרך", message: "" },
};

/** Welcome / dashboard greeting — data-driven; the count comes from real state. */
export function ziGreeting(name: string | null, actionCount: number): ZICopyLine {
  const who = name ? `בוקר טוב ${name}` : "בוקר טוב";
  return {
    title: actionCount > 0 ? `${who}, הכנתי לך ${actionCount} פעולות חשובות` : `${who}, הכול מסודר כרגע`,
    message: actionCount > 0 ? "אלו הדברים שדורשים את תשומת הלב שלך היום." : "כשיצוץ משהו חשוב — אעדכן אותך כאן.",
  };
}
