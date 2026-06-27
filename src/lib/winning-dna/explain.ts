// ============================================================================
// Broker Winning DNA™ — MAI-9 explanation (PURE).
//
// A short, cautious Hebrew description of a segment's observed winning DNA. No
// LLM, no advice. It only describes the OBSERVED behaviour of the segment's
// leaders — never "you should", never a per-broker comparison. Always closes
// with the observed-behaviour disclaimer.
// ============================================================================
import type { WinningDNAResult } from "./types";

const OBSERVED_DISCLAIMER = "התיאור מבוסס על התנהגות נצפית של המובילים באזור בלבד, אינו המלצה ואינו אישור מכירות רשמי.";

const ACTIVITY_HE: Record<string, string> = { HIGH: "גבוהה", MEDIUM: "בינונית", LOW: "נמוכה" };
const MOMENTUM_HE: Record<string, string> = { POSITIVE: "חיובי", STABLE: "יציב", NEGATIVE: "יורד" };

const areaLabel = (r: WinningDNAResult): string =>
  [r.city, r.neighborhood, r.propertyType, r.rooms != null ? `${r.rooms} חד׳` : null, r.priceBucket].filter(Boolean).join(" / ") || "האזור";

/** Deterministic Hebrew explanation grounded in the DNA's real numbers. */
export function buildWinningDNAExplanation(r: WinningDNAResult): string {
  const where = areaLabel(r);
  const p = r.winningProfile;

  if (p.weak) {
    return `שוק מפוצל ב${where} — לא זוהה דפוס מנצח יציב (DNA חלש, ביטחון ${Math.round(r.confidence)}%). ${OBSERVED_DISCLAIMER}`;
  }

  const parts: string[] = [];
  parts.push(`DNA מנצח ב${where} (חלון ${r.windowDays} ימים), מבוסס על ${p.leaderCount} מובילים נצפים`);
  if (r.medianDaysOnMarket != null) parts.push(`חציון ימים בשוק ${Math.round(r.medianDaysOnMarket)}`);
  if (r.marketSuccessRate != null) parts.push(`שיעור הצלחת שוק ${Math.round(r.marketSuccessRate * 100)}%`);
  if (r.medianPriceReductionPct != null) parts.push(`חציון הורדת מחיר ${Math.round(r.medianPriceReductionPct * 100)}%`);
  parts.push(`רמת פעילות ${ACTIVITY_HE[p.activityLevel] ?? p.activityLevel}`);
  parts.push(`מומנטום ${MOMENTUM_HE[p.momentum] ?? p.momentum}`);
  if (r.confidence > 0) parts.push(`רמת ביטחון ${Math.round(r.confidence)}%`);

  return `${parts.join(", ")}. ${OBSERVED_DISCLAIMER}`;
}
