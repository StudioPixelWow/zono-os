// ============================================================================
// 🗣️ Explainability (pure). VAL-QA-10.
// Classifies the honest failure mode and builds the human selection explanation.
// No AI, deterministic.
// ============================================================================
import { MIN_STRONG_COMPARABLES, MIN_TOTAL_COMPARABLES } from "./types";
import type {
  Candidate, DiscoveryFailureMode, DiscoverySubject, SourceScanStat,
} from "./types";

export function classifyFailure(a: { candidates: number; traceable: number; usable: number; selected: number; rawScanned: number }): DiscoveryFailureMode | null {
  if (a.selected > 0) return null;
  if (a.rawScanned === 0 || a.candidates === 0) return "NO_DATA";
  if (a.traceable === 0) return "MISSING_PRICE_OR_SQM";     // rows exist but no id+price+sqm
  if (a.usable === 0) return "OUT_OF_AREA";                 // traceable rows exist but none in area
  return "OUT_OF_AREA";                                     // usable exist but all beyond max radius
}

export const FAILURE_HE: Record<DiscoveryFailureMode, string> = {
  NO_DATA: "אין נתונים כלל באף מקור — נדרש ייבוא עסקאות/מודעות.",
  NO_TRACEABLE_EVIDENCE: "קיימות שורות אך ללא ראיה עקיבה (מזהה+מחיר+שטח).",
  OUT_OF_AREA: "קיימות ראיות עקיבות אך אף אחת אינה בעיר/רדיוס של הנכס.",
  MISSING_PRICE_OR_SQM: "קיימות שורות באזור אך ללא מחיר+שטח — לא ניתן להשוות.",
};

export interface ExplainArgs {
  subject: DiscoverySubject;
  selected: Candidate[];
  maxRadiusUsedM: number;
  expandedBeyondDefault: boolean;
  strong: number;
  externalScanned: boolean;
  externalUsed: boolean;
  onlyOfficial: boolean;
  sourceStats: SourceScanStat[];
  failureMode: DiscoveryFailureMode | null;
}

/** Build the Hebrew explanation of what was scanned and why these were selected. */
export function buildSelectionExplanation(a: ExplainArgs): string {
  if (a.failureMode) return FAILURE_HE[a.failureMode];
  const parts: string[] = [];
  parts.push(`נבחרו ${a.selected.length} השוואות (מתוכן ${a.strong} חזקות ≥ ${MIN_STRONG_COMPARABLES} נדרש; יעד ${MIN_TOTAL_COMPARABLES}).`);
  if (a.expandedBeyondDefault) parts.push(`הרדיוס הורחב ל-${(a.maxRadiusUsedM / 1000).toLocaleString("he-IL")} ק״מ כי לא נמצאו מספיק ראיות קרובות.`);
  else parts.push(`רדיוס מרבי בשימוש: ${(a.maxRadiusUsedM / 1000).toLocaleString("he-IL")} ק״מ.`);

  if (a.onlyOfficial) parts.push("הערכת השווי מבוססת על עסקאות רשמיות בלבד.");
  else if (a.externalUsed) parts.push("הערכת השווי כוללת מודעות חיצוניות אמיתיות שנמצאו במערכת.");

  if (!a.externalScanned) parts.push("לא נמצאו מודעות חיצוניות מיובאות לארגון.");
  else if (a.externalScanned && !a.externalUsed) {
    const ext = a.sourceStats.find((s) => s.source === "external_listings");
    const why = ext ? (ext.rejectionReasons[0]?.reason ?? "מחוץ לעיר/רדיוס") : "מחוץ לעיר/רדיוס";
    parts.push(`נסרקו מודעות חיצוניות אך לא נכללו (${why}).`);
  }
  return parts.join(" ");
}
