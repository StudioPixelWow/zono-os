// ============================================================================
// 🎯 Lead Agent — Risk + Opportunity engines (pure). 29.6. Parts 4 + 5.
// Evidence-only: only real lead signals produce a risk/opportunity.
// ============================================================================
import type { LeadSignals, IntentResult, LeadRisk, LeadOpportunity } from "./types";

const BAD_SOURCES = ["cold_outreach", "facebook", "instagram"];

export function detectLeadRisks(sig: LeadSignals, it: IntentResult): LeadRisk[] {
  const out: LeadRisk[] = [];
  if (sig.duplicateRisk >= 60) out.push({ type: "duplicate_lead", severity: "high", title: "ליד כפול", evidence: [`סיכון כפילות ${sig.duplicateRisk}`] });
  if (sig.contactRisk >= 70) out.push({ type: "low_contactability", severity: "high", title: "נגישות נמוכה", evidence: ["חסרים פרטי קשר"] });
  if (sig.conversionProbability < 30 || sig.classification.includes("ליד קר")) out.push({ type: "cold_lead", severity: "medium", title: "ליד קר", evidence: [`המרה ${sig.conversionProbability}`] });
  if (it.intent === "unknown" || it.confidence < 40) out.push({ type: "unclear_intent", severity: "medium", title: "כוונה לא ברורה", evidence: [`ביטחון כוונה ${it.confidence}`] });
  if (sig.completeness < 50) out.push({ type: "missing_data", severity: "medium", title: "נתונים חסרים", evidence: [`שלמות ${sig.completeness}`] });
  if (sig.source && BAD_SOURCES.includes(sig.source.toLowerCase()) && sig.sourceQuality < 50) out.push({ type: "bad_source", severity: "low", title: "מקור באיכות נמוכה", evidence: [`מקור ${sig.source}`] });
  if (sig.recencyScore <= 10 && (sig.behavior.calls + sig.behavior.messages) > 0) out.push({ type: "no_response", severity: "medium", title: "אין מענה", evidence: ["פנייה ללא מענה"] });
  if (it.intent === "seller" && sig.classification.includes("ליד קונה")) out.push({ type: "wrong_routing", severity: "low", title: "ניתוב שגוי אפשרי", evidence: ["אי-התאמה בין כוונה לסיווג"] });
  if (sig.recencyScore <= 10 && (sig.totalActivities > 0 || sig.lastActivityAt)) out.push({ type: "stale_lead", severity: "medium", title: "ליד מתיישן", evidence: [`טריות ${sig.recencyScore}`] });
  return out;
}

export function detectLeadOpportunities(sig: LeadSignals, it: IntentResult): LeadOpportunity[] {
  const out: LeadOpportunity[] = [];
  if (sig.conversionProbability >= 65 || sig.classification.includes("ליד חם")) out.push({ type: "hot_lead", title: "ליד חם", evidence: [`המרה ${sig.conversionProbability}`], impact: "high" });
  if (sig.leadQuality >= 75 || sig.existingCustomer) out.push({ type: "high_value_lead", title: "ליד בעל ערך גבוה", evidence: [sig.existingCustomer ? "לקוח קיים" : `איכות ${sig.leadQuality}`], impact: "high" });
  if (it.intent === "buyer" || it.intent === "renter") out.push({ type: "buyer_opportunity", title: "הזדמנות קונה", evidence: [`כוונת ${it.fit}`], impact: "medium" });
  if (it.intent === "seller") out.push({ type: "seller_opportunity", title: "הזדמנות מוכר", evidence: ["כוונת מכירה"], impact: "medium" });
  if (it.intent === "both") out.push({ type: "both_sides_opportunity", title: "הזדמנות דו-צדדית", evidence: ["קונה+מוכר"], impact: "high" });
  if (it.intent === "investor" || sig.investor) out.push({ type: "investor_opportunity", title: "הזדמנות משקיע", evidence: ["פרופיל משקיע"], impact: "medium" });
  if (sig.hasProperty) out.push({ type: "property_specific", title: "עניין בנכס ספציפי", evidence: sig.relationshipPath.slice(0, 2), impact: "medium" });
  if (sig.conversionProbability >= 65 && (sig.contactRisk < 30)) out.push({ type: "fast_conversion", title: "המרה מהירה", evidence: ["המרה גבוהה + נגישות"], impact: "high" });
  return out;
}
