// ============================================================================
// 🛒 Buyer Agent — Risk + Opportunity engines (pure). 29.4. Parts 4 + 5.
// Evidence-only: only real buyer signals produce a risk/opportunity.
// ============================================================================
import type { BuyerSignals, BuyerHealth, MatchIntel, BuyerRisk, BuyerOpportunity } from "./types";

export function detectBuyerRisks(sig: BuyerSignals, h: BuyerHealth, mi: MatchIntel): BuyerRisk[] {
  const out: BuyerRisk[] = [];
  const b = sig.behavior;
  const contacted = b.calls + b.meetings + b.messages;
  if (sig.classification.includes("קונה קר") || h.buyingConfidence < 30) out.push({ type: "cold_buyer", severity: "high", title: "קונה קר", evidence: [`הסתברות ${h.buyingConfidence}`] });
  if (sig.recencyScore <= 10 && contacted > 0 && sig.totalActivities > 0) out.push({ type: "ghosting", severity: "high", title: "היעלמות (ghosting)", evidence: [`אין פעילות לאחרונה למרות ${contacted} אינטראקציות`] });
  if (b.rejects >= 3) out.push({ type: "lost_interest", severity: "medium", title: "אובדן עניין", evidence: [`${b.rejects} דחיות`] });
  if (sig.budgetConfidence < 40 || sig.budgetChanged) out.push({ type: "budget_problem", severity: "medium", title: "בעיית תקציב", evidence: [sig.budgetChanged ? "שינוי תקציב זוהה" : `ביטחון תקציב ${sig.budgetConfidence}`] });
  if (sig.timelineChanged || sig.urgency < 30) out.push({ type: "timeline_delay", severity: "low", title: "עיכוב בלוח זמנים", evidence: [sig.timelineChanged ? "שינוי לוח זמנים" : `דחיפות ${sig.urgency}`] });
  if (b.visits >= 2 && b.offers === 0) out.push({ type: "competition", severity: "medium", title: "מתלבט / תחרות", evidence: [`${b.visits} ביקורים ללא הצעה`] });
  if (!sig.matches.length || (!mi.perfect.length && !mi.emerging.length)) out.push({ type: "poor_matching", severity: "medium", title: "התאמה חלשה", evidence: [`${sig.matches.length} התאמות`] });
  if (sig.recencyScore <= 10) out.push({ type: "no_activity", severity: "medium", title: "אין פעילות אחרונה", evidence: [`טריות ${sig.recencyScore}`] });
  if ((b.views >= 8 || b.visits >= 3) && b.offers === 0) out.push({ type: "decision_fatigue", severity: "low", title: "עייפות החלטה", evidence: [`${b.views} צפיות · ${b.visits} ביקורים ללא הצעה`] });
  return out;
}

export function detectBuyerOpportunities(sig: BuyerSignals, h: BuyerHealth, mi: MatchIntel): BuyerOpportunity[] {
  const out: BuyerOpportunity[] = [];
  if (h.buyingReadiness >= 65 || h.buyingConfidence >= 65) out.push({ type: "high_motivation", title: "מוטיבציית קנייה גבוהה", evidence: [`מוכנות ${h.buyingReadiness} · הסתברות ${h.buyingConfidence}`], impact: "high" });
  if (mi.perfect.length) out.push({ type: "market_opportunity", title: "התאמות מצוינות זמינות", evidence: [`${mi.perfect.length} התאמות מושלמות`], impact: "high" });
  if (sig.matches.some((m) => m.ageDays != null && m.ageDays <= 7)) out.push({ type: "new_inventory", title: "מלאי חדש מתאים", evidence: ["התאמות חדשות ב-7 ימים"], impact: "medium" });
  if (mi.hidden.length) out.push({ type: "hidden_match", title: "התאמות נסתרות", evidence: [`${mi.hidden.length} התאמות חלקיות`], impact: "low" });
  if (sig.classification.includes("יוקרה") && (mi.perfect.length || mi.emerging.length)) out.push({ type: "luxury_opportunity", title: "הזדמנות יוקרה", evidence: ["קונה יוקרה עם התאמות"], impact: "medium" });
  if ((sig.investor || sig.classification.includes("משקיע")) && sig.matches.length) out.push({ type: "investment_opportunity", title: "הזדמנות השקעה", evidence: ["פרופיל משקיע עם התאמות"], impact: "medium" });
  return out;
}
