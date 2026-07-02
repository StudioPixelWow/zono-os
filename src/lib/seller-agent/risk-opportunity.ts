// ============================================================================
// 🏷️ Seller Agent — Risk + Opportunity engines (pure). 29.5. Parts 4 + 5.
// Evidence-only: only real seller/property signals produce a risk/opportunity.
// ============================================================================
import type { SellerSignals, SellerRisk, SellerOpportunity } from "./types";

export function detectSellerRisks(sig: SellerSignals): SellerRisk[] {
  const out: SellerRisk[] = [];
  const p = sig.property;
  const flex = sig.priceFlexibility;
  if (sig.churnRisk >= 60) out.push({ type: "high_churn", severity: "high", title: "סיכון נטישה גבוה", evidence: [`נטישה ${sig.churnRisk}`] });
  if (sig.trust < 40) out.push({ type: "trust_loss", severity: "high", title: "אובדן אמון", evidence: [`אמון ${sig.trust}`] });
  if ((p.valuationPosition === "above" || (sig.priceGapPct ?? 0) > 10) && flex != null && flex < 35) out.push({ type: "price_resistance", severity: "high", title: "התנגדות מחיר", evidence: [p.valuationPosition === "above" ? "מחיר מעל טווח ההערכה" : `פער ${sig.priceGapPct}%`, `גמישות ${flex}`] });
  if (sig.recencyScore <= 10) out.push({ type: "inactive_seller", severity: "medium", title: "מוכר לא פעיל", evidence: [`טריות ${sig.recencyScore}`] });
  if ((p.competitionPressure ?? 0) >= 60) out.push({ type: "competitor_risk", severity: "medium", title: "לחץ תחרותי", evidence: [`לחץ תחרות ${p.competitionPressure}`] });
  if (sig.hasSignedAgreement && p.hasProperty && !(p.status === "active" || p.status === "published")) out.push({ type: "listing_delay", severity: "medium", title: "עיכוב בהעלאת הנכס לשיווק", evidence: [`נכס בסטטוס ${p.status ?? "לא ידוע"}`] });
  else if (sig.hasSignedAgreement && !p.hasProperty) out.push({ type: "listing_delay", severity: "low", title: "הסכם ללא נכס מקושר", evidence: ["אין נכס מקושר"] });
  if (sig.communicationHealth < 40) out.push({ type: "communication_problems", severity: "medium", title: "בעיות תקשורת", evidence: [`תקשורת ${sig.communicationHealth}`] });
  if (p.valuationPosition === "unknown" || p.valuationConfidence === "none" || p.valuationConfidence === "low") out.push({ type: "weak_valuation", severity: "low", title: "הערכת שווי חלשה/חסרה", evidence: [p.valuationPosition === "unknown" ? "אין הערכה" : `ביטחון ${p.valuationConfidence}`] });
  if (sig.relationshipDegree === 0 && sig.trust < 50) out.push({ type: "relationship_decline", severity: "low", title: "קשר חלש עם המשרד", evidence: [`ללא קשרים · אמון ${sig.trust}`] });
  return out;
}

export function detectSellerOpportunities(sig: SellerSignals): SellerOpportunity[] {
  const out: SellerOpportunity[] = [];
  const p = sig.property;
  if (sig.readinessToSign >= 70 && !sig.hasSignedAgreement) out.push({ type: "ready_to_sign", title: "מוכן לחתימה", evidence: [`מוכנות ${sig.readinessToSign}`], impact: "high" });
  if (p.valuationPosition === "within" || (sig.priceFlexibility != null && sig.priceFlexibility >= 55)) out.push({ type: "price_alignment", title: "מחיר מיושר/גמיש", evidence: [p.valuationPosition === "within" ? "בתוך טווח ההערכה" : "גמישות מחיר גבוהה"], impact: "medium" });
  if ((p.marketScore ?? 0) >= 66) out.push({ type: "strong_market", title: "שוק חזק", evidence: [`ביצוע שוק ${p.marketScore}`], impact: "medium" });
  if (sig.matchingBuyers.length) out.push({ type: "buyer_waiting", title: "קונים ממתינים", evidence: [`${sig.matchingBuyers.length} התאמות קונים`], impact: "high" });
  if ((p.buyerDemandScore ?? 0) >= 65) out.push({ type: "high_demand", title: "ביקוש גבוה לנכס", evidence: [`ביקוש ${p.buyerDemandScore}`], impact: "high" });
  if (sig.classification.includes("יוקרה")) out.push({ type: "luxury_opportunity", title: "הזדמנות יוקרה", evidence: ["מוכר/נכס יוקרה"], impact: "medium" });
  if (sig.investor || sig.classification.includes("משקיע")) out.push({ type: "investment_opportunity", title: "מוכר משקיע", evidence: ["פרופיל משקיע"], impact: "low" });
  if (p.domBand === "fast" && (p.buyerDemandScore ?? 0) >= 60) out.push({ type: "fast_sale", title: "הזדמנות מכירה מהירה", evidence: ["קצב שוק מהיר + ביקוש"], impact: "high" });
  return out;
}
