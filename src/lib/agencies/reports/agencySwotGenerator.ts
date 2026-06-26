// ============================================================================
// ZONO — Agency SWOT generator (Phase 26.7, PURE, client-safe).
// Builds Strengths / Weaknesses / Opportunities / Threats strictly from the real
// snapshot. Each item is gated on data — nothing is invented. Opportunities and
// threats are derived from the agency's stored signals (already evidence-backed).
// ============================================================================
import { OPPORTUNITY_SIGNALS, THREAT_SIGNALS } from "./agencyReportTypes";
import type { AgencyReportSnapshot, SwotItem } from "./agencyReportTypes";

const dedupe = (xs: SwotItem[]): SwotItem[] => {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
};

export interface AgencySwot { strengths: SwotItem[]; weaknesses: SwotItem[]; opportunities: SwotItem[]; threats: SwotItem[] }

export function generateAgencySwot(s: AgencyReportSnapshot): AgencySwot {
  const sc = s.scores, t = s.territory, g = s.graph;
  const strengths: SwotItem[] = [];
  const weaknesses: SwotItem[] = [];

  // ── Strengths (only when data supports) ─────────────────────────────────────
  const dom = t.topDominant.filter((d) => d.dominance >= 60);
  if (dom.length) strengths.push({ key: "dominance", label: "שליטה חזקה באזורי פעילות", detail: `דומיננטיות גבוהה ב${dom.slice(0, 3).map((d) => d.label).join(", ")}.`, evidence: "agency_territory_stats" });
  if ((sc.growth ?? 0) >= 65) strengths.push({ key: "growth", label: "צמיחה גבוהה", detail: "מגמת צמיחה חזקה בתקופה האחרונה.", evidence: "agency_scores.growth" });
  if ((sc.inventory ?? 0) >= 65 || t.activeListings >= 10) strengths.push({ key: "inventory", label: "מלאי פעיל חזק", detail: `${t.activeListings} נכסים פעילים.`, evidence: "agency_territory_stats" });
  if ((t.luxuryShare ?? 0) >= 0.2 || (sc.luxury ?? 0) >= 60) strengths.push({ key: "luxury", label: "התמחות ביוקרה", detail: "נתח גבוה של נכסי יוקרה.", evidence: "agency_territory_stats.luxury_share" });
  if (g.projectCount + g.developerCount >= 2) strengths.push({ key: "projects", label: "קשרים לפרויקטים/יזמים", detail: `${g.projectCount} פרויקטים, ${g.developerCount} יזמים.`, evidence: "agency_knowledge_graph" });
  if ((sc.coverage ?? 0) >= 60) strengths.push({ key: "coverage", label: "כיסוי גאוגרפי רחב", detail: `פעילות ב‑${t.cities.length} ערים ו‑${t.neighborhoods.length} שכונות.`, evidence: "agency_territory_stats" });
  if ((sc.momentum ?? 0) >= 65) strengths.push({ key: "momentum", label: "מומנטום גבוה", detail: "עלייה בפעילות לאחרונה.", evidence: "agency_territory_stats.momentum" });

  // ── Weaknesses ──────────────────────────────────────────────────────────────
  if ((sc.dataConfidence ?? 0) < 40) weaknesses.push({ key: "low_confidence", label: "רמת ביטחון נתונים נמוכה", detail: "חסרים נתונים מאומתים לתמונה מלאה.", evidence: "agency_scores.data_confidence" });
  if (!s.hasDigital) weaknesses.push({ key: "weak_digital", label: "נוכחות דיגיטלית חלשה", detail: "לא נמצאו אתר/רשתות/פרופיל Google.", evidence: "agency profile" });
  else if ((sc.digital ?? 0) < 40) weaknesses.push({ key: "weak_digital", label: "נוכחות דיגיטלית חלקית", detail: "נוכחות דיגיטלית מוגבלת ביחס לפוטנציאל.", evidence: "agency_scores.digital" });
  if (t.activeListings > 0 && t.soldCount === 0) weaknesses.push({ key: "low_sales", label: "מהירות מכירות נמוכה", detail: "מלאי פעיל אך ללא עסקאות סגורות מתועדות.", evidence: "agency_territory_stats" });
  if ((sc.coverage ?? 100) < 30 && (t.cities.length + t.neighborhoods.length) <= 1) weaknesses.push({ key: "weak_coverage", label: "כיסוי גאוגרפי מצומצם", detail: "פעילות מרוכזת באזור בודד.", evidence: "agency_territory_stats" });
  if (s.signals.some((x) => x.signalType === "agency_inventory_loss")) weaknesses.push({ key: "inventory_loss", label: "ירידה במלאי", detail: "זוהתה ירידה במספר הנכסים הפעילים.", evidence: "agency_signals" });

  // ── Opportunities + threats from real, stored signals ───────────────────────
  const opportunities: SwotItem[] = s.signals.filter((x) => OPPORTUNITY_SIGNALS.has(x.signalType)).map((x) => ({
    key: `opp_${x.signalType}_${x.territoryLabel ?? ""}`, label: x.title,
    detail: x.territoryLabel ? `אזור: ${x.territoryLabel}` : "", evidence: "agency_signals",
  }));
  const threats: SwotItem[] = s.signals.filter((x) => THREAT_SIGNALS.has(x.signalType)).map((x) => ({
    key: `threat_${x.signalType}_${x.territoryLabel ?? ""}`, label: x.title,
    detail: x.territoryLabel ? `אזור: ${x.territoryLabel}` : "", evidence: "agency_signals",
  }));

  return {
    strengths: dedupe(strengths),
    weaknesses: dedupe(weaknesses),
    opportunities: dedupe(opportunities),
    threats: dedupe(threats),
  };
}
