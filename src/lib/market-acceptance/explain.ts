// ============================================================================
// Market Acceptance Intelligence™ — MAI-3 explanation (PURE, deterministic).
//
// Builds a short, cautious Hebrew explanation from the score + evidence. No LLM.
// Exit/Accepted explanations always end with the disclaimer that this is NOT an
// official sale confirmation ("זה אינו אישור מכירה רשמי.").
// ============================================================================
import type { MarketAcceptanceScore, SignalSet } from "./types";

const SALE_DISCLAIMER = "זה אינו אישור מכירה רשמי.";

const snum = (s: SignalSet, n: string): number | null => { const v = s[n]?.value; return typeof v === "number" && Number.isFinite(v) ? v : null; };

/**
 * Compose a deterministic Hebrew explanation for a listing's classification.
 * Pulls real numbers (days missing, price-change count, days on market) from the
 * signals so the sentence is grounded, never generic.
 */
export function buildAcceptanceExplanation(score: MarketAcceptanceScore, signals: SignalSet): string {
  const lastSeen = snum(signals, "LastSeenDaysAgo");
  const dom = snum(signals, "DaysOnMarket") ?? snum(signals, "ListingAge");
  const priceChanges = snum(signals, "PriceChangesCount") ?? 0;
  const dealsNearby = snum(signals, "RecentOfficialDealsNearby") ?? 0;
  const exit = score.marketExitConfidence;
  const rej = score.marketRejectionConfidence;
  const level = (c: number) => (c >= 80 ? "גבוהה" : c >= 60 ? "בינונית-גבוהה" : "בינונית");
  const drops = priceChanges > 0 ? `לפני ההיעלמות זוהו ${priceChanges} שינויי מחיר. ` : "";

  switch (score.classification) {
    case "LIKELY_ACCEPTED":
      return `הנכס אינו מוצג יותר במקור החיצוני${lastSeen != null ? ` כבר ${lastSeen} ימים` : ""}. ${drops}` +
        `${dealsNearby > 0 ? "עסקאות רשמיות באזור תומכות בטווח המחיר, ו" : ""}` +
        `המערכת מסמנת קבלה אפשרית של הנכס על ידי השוק ברמת ביטחון ${level(exit)}. ${SALE_DISCLAIMER}`;
    case "LIKELY_MARKET_EXIT":
      return `הנכס אינו מוצג יותר במקור החיצוני${lastSeen != null ? ` כבר ${lastSeen} ימים` : ""}. ${drops}` +
        `לכן המערכת מסמנת יציאה אפשרית מהשוק ברמת ביטחון ${level(exit)}. ${SALE_DISCLAIMER}`;
    case "LIKELY_REJECTED":
      return `הנכס עדיין פעיל${dom != null ? ` לאחר ${dom} ימים` : ""}` +
        `${priceChanges > 0 ? ` ועם ${priceChanges} הורדות מחיר` : ""}. ` +
        `לכן המערכת מזהה סימן אפשרי לדחיית מחיר מצד השוק ברמת ביטחון ${level(rej)}.`;
    case "RETURNED":
      return "הנכס חזר להופיע במקור החיצוני לאחר היעלמות קודמת, ולכן אינו מסווג כיציאה מהשוק. המערכת ממשיכה לעקוב.";
    case "OFFICIAL_TRANSACTION_FOUND":
      return "נמצאה התאמה לעסקה רשמית עבור נכס זה.";
    case "ACTIVE":
      return `הנכס עדיין פעיל במקור החיצוני${dom != null ? ` (${dom} ימים)` : ""} ללא סימני יציאה או דחייה ברורים.`;
    case "UNCERTAIN":
    default:
      return "אין כרגע מספיק עדויות חד-משמעיות לסיווג מצב הנכס. המערכת ממשיכה לאסוף נתונים מסנכרונים הבאים.";
  }
}
