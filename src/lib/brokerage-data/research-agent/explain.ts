// ============================================================================
// 🗣️ Research Agent — explainability (pure). Phase 26.4.13.
// ============================================================================
import type { ResearchStage } from "./types";

export const STAGE_HE: Record<ResearchStage, string> = {
  city_understanding: "הבנת העיר", franchises: "רשתות זכיינות", independents: "משרדים עצמאיים",
  directories: "מדריכים ציבוריים", portals: "פורטלי מודעות", social: "רשתות חברתיות",
  cross_reference: "הצלבת מקורות",
};

/** Human gap list — what the agent could not confirm this run. */
export function computeGaps(a: {
  searchConfigured: boolean; aiConfigured: boolean;
  candidatesSaved: number; candidatesVerified: number; candidatesWaiting: number;
  emptyStages: ResearchStage[]; timedOut: boolean;
}): string[] {
  const gaps: string[] = [];
  if (!a.searchConfigured) gaps.push("אין ספק חיפוש ציבורי — לא בוצע אימות; המועמדים נשמרו כ״במחקר״.");
  if (!a.aiConfigured) gaps.push("אין מנוע AI — חילוץ שמות הסתמך על זיהוי רשתות בלבד.");
  if (a.candidatesWaiting > 0) gaps.push(`${a.candidatesWaiting} מועמדים ממתינים לאימות ציבורי (הרצה חוזרת תמשיך).`);
  if (a.emptyStages.length) gaps.push(`שלבים ללא תוצאות: ${a.emptyStages.map((s) => STAGE_HE[s]).join(", ")}.`);
  if (a.timedOut) gaps.push("חלק מהשלבים נעצרו עקב תקציב זמן — ניתן להריץ שוב כדי להשלים.");
  if (a.candidatesVerified === 0 && a.candidatesSaved > 0) gaps.push("טרם אומתו משרדים בראיה ציבורית חזקה — נדרשת הרצה נוספת / מקורות נוספים.");
  return gaps;
}
