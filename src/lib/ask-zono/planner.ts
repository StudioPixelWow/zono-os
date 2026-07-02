// ============================================================================
// 💬 Ask ZONO — Context Planner (pure). 30.1. Part 2.
// Maps a detected intent to the MINIMAL set of engines that must answer it.
// Never loads unnecessary engines. Evidence-only routing.
// ============================================================================
import type { QueryUnderstanding, ContextPlan, EngineId } from "./types";

const PLAN: Record<string, EngineId[]> = {
  DAILY_PRIORITIES: ["chief_of_staff", "orchestrator"],
  SELLERS_AT_RISK: ["seller"],
  BUYERS_CLOSING: ["buyer"],
  LISTINGS_PRICE_REDUCTION: ["listing"],
  RECRUIT_LOCATION: ["office"],
  COMPETITION: ["office"],           // office scorecard carries reused Competitive Intelligence findings
  VALUATION: ["listing"],            // valuation is surfaced via the Listing Agent's valuation view
  MISSIONS: ["chief_of_staff"],
  LEADS: ["lead"],
  OPPORTUNITIES: ["orchestrator"],
  OFFICE_STATUS: ["office"],
  GENERAL_STATUS: ["chief_of_staff"],
  UNKNOWN: [],
};

const REASON: Record<string, string> = {
  DAILY_PRIORITIES: "עדיפויות יומיות מגיעות מהצ׳יף אוף סטאף + תור העדיפויות של מנצח הסוכנים.",
  SELLERS_AT_RISK: "סיכון נטישת מוכרים מגיע מסוכן המוכרים.",
  BUYERS_CLOSING: "קרבה לסגירה מגיעה מסוכן הקונים.",
  LISTINGS_PRICE_REDUCTION: "המלצות תמחור מגיעות מסוכן המודעות.",
  RECRUIT_LOCATION: "צורכי גיוס מגיעים מסוכן צמיחת המשרד.",
  COMPETITION: "מודיעין תחרותי מגיע מסוכן צמיחת המשרד (משתמש במודיעין התחרותי).",
  VALUATION: "הערכות שווי מוצגות דרך סוכן המודעות.",
  MISSIONS: "מצב משימות מגיע מהצ׳יף אוף סטאף (מרכז הפעולות).",
  LEADS: "שאלות לידים מגיעות מסוכן הלידים.",
  OPPORTUNITIES: "שרשראות הזדמנות מגיעות ממנצח הסוכנים.",
  OFFICE_STATUS: "מצב העסק מגיע מסוכן צמיחת המשרד.",
  GENERAL_STATUS: "סקירה כללית מגיעה מהצ׳יף אוף סטאף.",
  UNKNOWN: "לא זוהתה כוונה ברורה — נדרש חידוד.",
};

export function planContext(u: QueryUnderstanding): ContextPlan {
  const engines = [...(PLAN[u.intent] ?? [])];
  // Timeframe "today" on a status question adds the daily coordinator once.
  if (u.timeframe === "today" && u.intent !== "DAILY_PRIORITIES" && u.intent !== "UNKNOWN" && !engines.includes("chief_of_staff")) engines.push("chief_of_staff");
  return { engines, reason: REASON[u.intent] ?? REASON.UNKNOWN };
}
