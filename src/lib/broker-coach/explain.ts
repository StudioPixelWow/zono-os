// ============================================================================
// Evidence-Based Broker Coach™ — MAI-11 explanation (PURE).
//
// A short, structured Hebrew headline for the coaching record (used in
// metadata). No advice beyond what the evidence supports; always grounded in
// the computed recommendations. No LLM.
// ============================================================================
import type { BrokerCoachResult } from "./types";

const PRIORITY_HE: Record<string, string> = { HIGH: "גבוהה", MEDIUM: "בינונית", LOW: "נמוכה", NONE: "ללא" };

/** Deterministic Hebrew one-line summary of the coaching record. */
export function buildCoachHeadline(r: BrokerCoachResult): string {
  if (r.metadata.notEnoughEvidence) {
    return "Not enough evidence — אין מספיק עדויות שוק נצפות לאימון מבוסס-ראיות.";
  }
  const top = r.recommendations[0];
  const parts: string[] = [];
  parts.push(`עדיפות כוללת ${PRIORITY_HE[r.overallPriority] ?? r.overallPriority}`);
  if (top) parts.push(`מומלץ להתמקד ב: ${top.title} (עדיפות ${Math.round(top.priority)})`);
  if (r.opportunities.length) parts.push(`${r.opportunities.length} הזדמנויות`);
  if (r.warnings.length) parts.push(`${r.warnings.length} סיכונים`);
  parts.push(`רמת ביטחון כוללת ${Math.round(r.overallConfidence)}%`);
  return `${parts.join(" · ")}. כל המלצה מבוססת על ראיות שוק נצפות בלבד.`;
}
