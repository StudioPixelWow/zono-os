// ============================================================================
// ZONO — Agency executive summary generator (Phase 26.7, PURE, client-safe).
// Produces a grounded, business-oriented Hebrew summary. Mentions confidence
// when low and discloses missing data. No dramatic claims, no invented facts,
// no "secret intelligence" wording.
// ============================================================================
import { confidenceWord } from "./agencyReportTypes";
import type { AgencyReportSnapshot } from "./agencyReportTypes";

export function generateAgencyExecutiveSummary(s: AgencyReportSnapshot): string {
  const t = s.territory, sc = s.scores;
  const parts: string[] = [];

  // 1) Activity / presence — only from real territory data.
  const areas = [...t.cities].slice(0, 3);
  if (t.activeListings > 0 || areas.length) {
    const where = areas.length ? `ב${areas.join(", ")}` : "באזורי הפעילות";
    const activity = t.activeListings >= 8 ? "פעילות חזקה" : t.activeListings > 0 ? "פעילות מתונה" : "פעילות מוגבלת";
    parts.push(`המשרד מציג ${activity} ${where}, עם ${t.activeListings} נכסים פעילים${t.soldCount > 0 ? ` ו‑${t.soldCount} עסקאות מתועדות` : ""}.`);
  } else {
    parts.push("טרם נאספו מספיק נתוני פעילות עבור המשרד.");
  }

  // 2) Momentum / dominance — only if measured.
  if ((sc.momentum ?? 0) >= 60) parts.push("נרשמה עלייה במומנטום בתקופה האחרונה.");
  const dom = t.topDominant.filter((d) => d.dominance >= 60).slice(0, 2);
  if (dom.length) parts.push(`נוכחות דומיננטית ב${dom.map((d) => d.label).join(" ו")}.`);

  // 3) Confidence disclosure (always when not high).
  const cw = confidenceWord(sc.dataConfidence);
  if (cw !== "גבוהה") {
    const why = s.missing.length ? ` משום שחסרים ${s.missing.slice(0, 2).join(" ו")}` : "";
    parts.push(`יחד עם זאת, רמת הביטחון בדאטה ${cw}${why}.`);
  }

  // 4) Headline opportunity / threat — grounded in real signals.
  const opp = s.signals.find((x) => x.signalType === "territory_opportunity" || x.signalType === "low_competition_area");
  const threat = s.signals.find((x) => x.signalType === "high_competition_threat" || x.signalType === "competitor_dominance");
  if (opp) parts.push(`עיקר ההזדמנות נמצאת ב${opp.territoryLabel ?? "אזורים שבהם נוכחות המתחרים גבוהה אך הנוכחות שלך עדיין נמוכה"}.`);
  if (threat) parts.push(`יש לשים לב לאיום תחרותי${threat.territoryLabel ? ` ב${threat.territoryLabel}` : ""}.`);

  return parts.join(" ");
}
