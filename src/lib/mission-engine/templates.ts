// ============================================================================
// 🧩 Mission templates + Task Generator (pure). Phase 27.5 · Part 3/4.
// Maps a mission type → its title, default task plan and expected ROI. Unknown
// mission types fall back to a generic plan (extensible without code changes).
// Deterministic. No DB, no AI.
// ============================================================================
import type { Impact, MissionTask, MissionType, ExecStatus } from "./types";

interface Template { title: string; goal: string; roi: string; tasks: { title: string; effort: Impact }[] }

const T: Record<string, Template> = {
  RECRUIT_BROKER: { title: "גיוס מתווך", goal: "להגדיל כיסוי וכוח מכירה", roi: "מתווך פעיל = מודעות + עסקאות נוספות", tasks: [
    { title: "חקור מועמד מתווך", effort: "medium" }, { title: "אסוף פרטי קשר", effort: "low" }, { title: "הכן מצגת גיוס", effort: "medium" }, { title: "קבע פגישה", effort: "low" }, { title: "מעקב", effort: "low" } ] },
  EXPAND_TERRITORY: { title: "הרחבת טריטוריה", goal: "לתפוס נתח שוק באזור חדש", roi: "נוכחות באזור צומח = מלאי ולידים", tasks: [
    { title: "נתח שכונה", effort: "medium" }, { title: "אתר הזדמנויות", effort: "medium" }, { title: "הכן קמפיין", effort: "medium" }, { title: "שייך מתווך", effort: "low" }, { title: "מדוד תוצאות", effort: "low" } ] },
  RECOVER_LISTINGS: { title: "שחזור מלאי", goal: "להחזיר מודעות תקועות למכירה", roi: "מודעות פעילות = יותר עסקאות", tasks: [
    { title: "סקור מודעות תקועות", effort: "low" }, { title: "תמחר/רענן", effort: "medium" }, { title: "צור קשר עם בעלים", effort: "medium" }, { title: "פרסם מחדש", effort: "low" }, { title: "מדוד", effort: "low" } ] },
  SELLER_OPPORTUNITY: { title: "הזדמנות מוכר", goal: "לזכות בבלעדיות/עסקה", roi: "בלעדיות = הכנסה ישירה", tasks: [
    { title: "התקשר למוכר", effort: "low" }, { title: "הכן הערכת שווי", effort: "medium" }, { title: "שלח וואטסאפ", effort: "low" }, { title: "קבע ביקור", effort: "low" }, { title: "מעקב", effort: "low" } ] },
  BUYER_OPPORTUNITY: { title: "הזדמנות קונה", goal: "להתאים נכס ולסגור", roi: "עסקת קנייה", tasks: [
    { title: "צור קשר עם הקונה", effort: "low" }, { title: "התאם נכסים", effort: "medium" }, { title: "קבע צפייה", effort: "low" }, { title: "מעקב", effort: "low" } ] },
  LEAD_FOLLOWUP: { title: "מעקב ליד", goal: "להסמיך ליד לעסקה", roi: "המרת ליד", tasks: [
    { title: "התקשר לליד", effort: "low" }, { title: "הסמכה", effort: "low" }, { title: "קבע פגישה", effort: "low" }, { title: "מעקב", effort: "low" } ] },
  MARKETING_CAMPAIGN: { title: "קמפיין שיווקי", goal: "לייצר לידים/חשיפה", roi: "לידים חדשים", tasks: [
    { title: "הגדר קהל", effort: "low" }, { title: "הכן קריאייטיב", effort: "medium" }, { title: "השק", effort: "low" }, { title: "מדוד", effort: "low" } ] },
  BROKER_FOLLOWUP: { title: "מעקב מתווך", goal: "להעלות ביצועי מתווך", roi: "יותר פעילות למתווך", tasks: [
    { title: "סקור פעילות מתווך", effort: "low" }, { title: "צור קשר עם המתווך", effort: "low" }, { title: "קבע יעדים", effort: "low" }, { title: "מעקב", effort: "low" } ] },
  PROPERTY_FOLLOWUP: { title: "מעקב נכס", goal: "לקדם נכס למכירה", roi: "עסקה", tasks: [
    { title: "סקור נכס", effort: "low" }, { title: "רענן מודעה", effort: "low" }, { title: "צור קשר עם בעלים", effort: "medium" }, { title: "מעקב", effort: "low" } ] },
  COMPETITIVE_RESPONSE: { title: "מענה תחרותי", goal: "להגן/להשיב נתח שוק", roi: "שמירת נתח שוק", tasks: [
    { title: "נתח מתחרה", effort: "medium" }, { title: "זהה חולשה", effort: "low" }, { title: "בנה אסטרטגיית מענה", effort: "medium" }, { title: "בצע", effort: "medium" }, { title: "מדוד", effort: "low" } ] },
  OFFICE_CLEANUP: { title: "ניקוי נתוני משרד", goal: "לשפר דיוק מלאי/שיוך", roi: "דיוק מודיעין", tasks: [
    { title: "סקור התנגשויות", effort: "low" }, { title: "פתור שיוכים", effort: "medium" }, { title: "אמת נתונים", effort: "low" }, { title: "אשר", effort: "low" } ] },
  VALUATION_REVIEW: { title: "סקירת הערכת שווי", goal: "לוודא איכות הערכה (סקירה בלבד)", roi: "אמון הלקוח", tasks: [
    { title: "אסוף השוואות", effort: "medium" }, { title: "סקור הערכה", effort: "medium" }, { title: "אשר/סמן לבדיקה", effort: "low" }, { title: "דווח", effort: "low" } ] },
  MARKET_RESEARCH: { title: "מחקר שוק", goal: "להבין מגמות ואזורים", roi: "החלטות טובות יותר", tasks: [
    { title: "הגדר היקף", effort: "low" }, { title: "אסוף נתונים", effort: "medium" }, { title: "נתח", effort: "medium" }, { title: "דווח", effort: "low" } ] },
  PORTFOLIO_REVIEW: { title: "סקירת תיק", goal: "לתעדף ולפעול על המלאי", roi: "אופטימיזציית מלאי", tasks: [
    { title: "רשום מלאי", effort: "low" }, { title: "העריך ביצועים", effort: "medium" }, { title: "תעדף", effort: "low" }, { title: "פעל", effort: "medium" } ] },
};
const GENERIC: Template = { title: "משימה כללית", goal: "להשלים פעולה עסקית", roi: "השפעה עסקית", tasks: [{ title: "תכנן", effort: "low" }, { title: "בצע", effort: "medium" }, { title: "סקור", effort: "low" }] };

export function templateFor(missionType: MissionType): Template { return T[missionType] ?? GENERIC; }
export function missionTitle(missionType: MissionType): string { return templateFor(missionType).title; }
export function expectedRoi(missionType: MissionType): string { return templateFor(missionType).roi; }
export function defaultGoal(missionType: MissionType): string { return templateFor(missionType).goal; }

/** Generate the task plan for a mission (Part 4). Tasks start READY once the
 *  mission is approved; the mission itself gates execution. */
export function generateTasks(missionType: MissionType, startStatus: ExecStatus = "READY"): MissionTask[] {
  return templateFor(missionType).tasks.map((t, i) => ({ id: `task-${i + 1}`, title: t.title, order: i + 1, status: startStatus, effort: t.effort, note: null }));
}
