// ============================================================================
// Broker Competitive Intelligence™ — MAI-8 explanation (PURE).
//
// A short, cautious Hebrew summary of a competitive profile. No LLM, no advice.
// It only describes OBSERVED competitive position + differences — never "this
// broker is better" and never an official sale. Always closes with the
// observed-behaviour disclaimer.
// ============================================================================
import type { CompetitiveProfile } from "./types";

const OBSERVED_DISCLAIMER = "המדדים מבוססים על התנהגות שוק נצפית בלבד, אינם דירוג ואינם אישור מכירות רשמי.";

const POSITION_HE: Record<string, string> = {
  LEADER: "מובילה", RUNNER_UP: "מתחרה מובילה", CONTENDER: "מתמודדת",
  TRAILING: "מפגרת", SOLE: "ללא מתחרים", INSUFFICIENT: "נתונים לא מספיקים",
};

/** Deterministic Hebrew explanation grounded in the profile's real numbers. */
export function buildCompetitiveExplanation(p: CompetitiveProfile): string {
  if (p.marketPosition === "INSUFFICIENT") {
    return `מדגם קטן מדי בפלח זה (${p.sampleSize} נכסים נצפים) — לא נקבעה תמונה תחרותית. המערכת תמשיך לעקוב.`;
  }
  if (p.marketPosition === "SOLE") {
    return `המתווך פועל בפלח זה ללא מתחרים נצפים. ${OBSERVED_DISCLAIMER}`;
  }

  const parts: string[] = [];
  parts.push(`עמדה תחרותית נצפית: ${POSITION_HE[p.marketPosition] ?? p.marketPosition}`);
  if (p.leaderGap != null && p.marketPosition !== "LEADER") parts.push(`פער של ${Math.round(p.leaderGap)} נקודות מהמובילה`);
  if (p.competitiveStrengths.length) parts.push(`חוזקות נצפות: ${p.competitiveStrengths.map((x) => x.label).slice(0, 3).join(", ")}`);
  if (p.competitiveWeaknesses.length) parts.push(`חולשות נצפות: ${p.competitiveWeaknesses.map((x) => x.label).slice(0, 3).join(", ")}`);
  if (p.competitiveRisks.length) parts.push(`סיכונים נצפים: ${p.competitiveRisks.map((x) => x.label).slice(0, 2).join(", ")}`);
  if (p.confidence > 0) parts.push(`רמת ביטחון ${Math.round(p.confidence)}%`);

  return `${parts.join(". ")}. ${OBSERVED_DISCLAIMER}`;
}
