// ============================================================================
// Autonomous Growth Strategy™ — MAI-12 explanation (PURE).
//
// A short, structured Hebrew headline for the strategy record (metadata). No
// advice beyond the computed actions; the Zone Dominance figure is always
// presented as a SIMULATION. No LLM.
// ============================================================================
import type { BrokerStrategyResult } from "./types";

const PRIORITY_HE: Record<string, string> = { HIGH: "גבוהה", MEDIUM: "בינונית", LOW: "נמוכה", NONE: "ללא" };

/** Deterministic Hebrew one-line summary of the growth strategy. */
export function buildStrategyHeadline(r: BrokerStrategyResult): string {
  if (r.metadata.notEnoughEvidence) {
    return "Not enough evidence — אין כרגע מספיק ראיות שוק לבניית אסטרטגיית צמיחה.";
  }
  const active = (r.metadata.activeCount as number | undefined) ?? 0;
  const parts: string[] = [];
  parts.push(`עדיפות כוללת ${PRIORITY_HE[r.overallPriority] ?? r.overallPriority}`);
  parts.push(`${active} פעולות מבוססות-ראיות`);
  parts.push(`${r.quickWins.length} ניצחונות מהירים`);
  if (r.expectedImprovement != null) parts.push(`שיפור שליטה צפוי (סימולציה) +${Math.round(r.expectedImprovement)}`);
  if (r.blockedActions.length) parts.push(`${r.blockedActions.length} חסומות`);
  parts.push(`ביטחון כולל ${Math.round(r.overallConfidence)}%`);
  return `${parts.join(" · ")}. כל פעולה מבוססת ראיות; הערכות מסומנות כסימולציה.`;
}
