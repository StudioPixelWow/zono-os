// ============================================================================
// Broker Gap Analysis™ — MAI-10 explanation (PURE).
//
// A short, cautious Hebrew summary of a broker's gap profile vs the segment's
// Winning DNA. No LLM, no advice — it only states observed, measurable gaps and
// strengths, and always closes with the observed-behaviour disclaimer.
// ============================================================================
import type { GapResult } from "./types";

const DISCLAIMER = "המדדים מבוססים על התנהגות שוק נצפית בלבד ואינם אישור מכירה רשמי.";

const LEVEL_HE: Record<string, string> = {
  LOW: "נמוכה", EMERGING: "מתפתחת", COMPETITIVE: "תחרותית",
  STRONG: "חזקה", LEADER_LIKE: "ברמת מובילה", INSUFFICIENT_DATA: "נתונים לא מספיקים",
};

const areaLabel = (r: GapResult): string =>
  [r.city, r.neighborhood, r.propertyType, r.rooms != null ? `${r.rooms} חד׳` : null, r.priceBucket].filter(Boolean).join(" / ") || "האזור";

/** Deterministic Hebrew explanation grounded in the gap profile's real numbers. */
export function buildGapExplanation(r: GapResult): string {
  const where = areaLabel(r);

  if (r.zoneDominanceLevel === "INSUFFICIENT_DATA") {
    return `אין מספיק נתונים לחישוב ציון שליטה ב${where} (ביטחון ${Math.round(r.confidence)}%). ${DISCLAIMER}`;
  }

  const parts: string[] = [];
  parts.push(`ציון שליטה באזור ${where}: ${Math.round(r.zoneDominanceScore ?? 0)} (${LEVEL_HE[r.zoneDominanceLevel] ?? r.zoneDominanceLevel})`);
  if (r.leaderGap != null && r.leaderGap > 0) parts.push(`פער של ${Math.round(r.leaderGap)} נקודות מהמובילה`);
  if (r.strengths.length) parts.push(`חוזקות נצפות: ${r.strengths.map((x) => x.label).slice(0, 2).join(", ")}`);
  if (r.gaps.length) parts.push(`פערים מדידים: ${r.gaps.map((x) => x.label).slice(0, 3).join("; ")}`);
  if (r.winningDnaMatchScore != null) parts.push(`התאמה לדפוס המנצח ${Math.round(r.winningDnaMatchScore)}%`);

  return `${parts.join(". ")}. ${DISCLAIMER}`;
}
