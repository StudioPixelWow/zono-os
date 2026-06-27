// ============================================================================
// Area Leader & Market Dominance Engine™ — MAI-7 explanation (PURE).
//
// A short, cautious Hebrew summary of an area-leader result. No LLM. It only
// describes OBSERVED market leadership — never an official sale. Always closes
// with the disclaimer that this reflects observed market behaviour only.
// ============================================================================
import type { AreaLeaderResult } from "./types";

const OBSERVED_DISCLAIMER = "המדד מבוסס על התנהגות שוק נצפית בלבד ואינו אישור מכירות רשמי.";

const areaLabel = (r: AreaLeaderResult): string =>
  r.neighborhood ?? r.city ?? "האזור";

const pct = (frac: number | null): string | null =>
  frac == null ? null : `${Math.round(frac * 100)}%`;

/** Deterministic Hebrew explanation grounded in the result's real numbers. */
export function buildAreaLeaderExplanation(r: AreaLeaderResult): string {
  const where = areaLabel(r);

  if (r.sampleSize < 5) {
    return `מדגם קטן מדי באזור ${where} (${r.sampleSize} נכסים נצפים) — לא נקבע מוביל. המערכת תמשיך לעקוב.`;
  }
  if (!r.leaderBrokerId) {
    return `באזור ${where} זוהה תיקו בין מתווכים מובילים — אין כרגע מוביל יציב. ${OBSERVED_DISCLAIMER}`;
  }

  const parts: string[] = [];
  parts.push(`באזור ${where} (חלון ${r.windowDays} ימים) המתווך המוביל מחזיק במדד דומיננטיות ${Math.round(r.marketDominanceIndex ?? 0)}`);
  const als = pct(r.activeListingShare);
  if (als) parts.push(`נתח נכסים פעילים ${als}`);
  const mss = pct(r.marketSuccessShare);
  if (mss) parts.push(`נתח הצלחת שוק אפשרית ${mss}`);
  if (r.runnerUpGap != null) parts.push(`פער של ${Math.round(r.runnerUpGap)} נקודות מהמתחרה הבא`);
  if (r.marketMomentumIndex != null && r.marketMomentumIndex > 0) parts.push(`מומנטום חיובי (${Math.round(r.marketMomentumIndex)})`);
  if (r.leaderConfidence != null) parts.push(`רמת ביטחון ${Math.round(r.leaderConfidence)}%`);

  return `${parts.join(", ")}. ${OBSERVED_DISCLAIMER}`;
}
