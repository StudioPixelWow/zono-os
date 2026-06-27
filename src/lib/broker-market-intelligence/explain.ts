// ============================================================================
// Broker Market Intelligence™ — MAI-6 explanation (PURE, deterministic).
//
// A short, cautious Hebrew summary of a broker's market profile. No LLM. It
// only ever describes OBSERVED market behaviour — never an official sale. The
// words "מכר" / "עסקה" / "סגירה" / "עמלה" are deliberately avoided; the
// summary always closes with the disclaimer that these are observed market
// signals, not confirmed sales.
// ============================================================================
import type { BrokerMarketProfile } from "./types";

const OBSERVED_DISCLAIMER = "המדדים מבוססים על התנהגות שוק נצפית בלבד ואינם אישור מכירה רשמי.";

const pct = (frac: number | null): string | null =>
  frac == null ? null : `${Math.round(frac * 100)}%`;

/** Compose a deterministic Hebrew explanation grounded in the profile's real numbers. */
export function buildBrokerMarketExplanation(p: BrokerMarketProfile): string {
  if (p.totalObservedListings === 0) {
    return "אין כרגע נכסים נצפים המשויכים למתווך זה. הפרופיל יתעדכן עם נתונים מסנכרונים הבאים.";
  }

  const parts: string[] = [];
  parts.push(`זוהו ${p.totalObservedListings} נכסים נצפים המשויכים למתווך`);

  const sr = pct(p.marketSuccessRate);
  if (p.likelyMarketSuccessCount > 0) {
    parts.push(
      `מתוכם ${p.likelyMarketSuccessCount} מסומנים כהצלחת שוק אפשרית` +
      (sr ? ` (שיעור הצלחת שוק נצפה ${sr})` : ""),
    );
  }
  if (p.medianDaysOnMarket != null) {
    parts.push(`חציון הזמן בשוק עומד על ${Math.round(p.medianDaysOnMarket)} ימים`);
  }
  const where = p.dominantNeighborhood ?? p.dominantCity;
  if (where) parts.push(`עיקר הפעילות הנצפית באזור ${where}`);
  if (p.confidence > 0) parts.push(`רמת ביטחון ${Math.round(p.confidence)}%`);

  return `${parts.join(". ")}. ${OBSERVED_DISCLAIMER}`;
}
