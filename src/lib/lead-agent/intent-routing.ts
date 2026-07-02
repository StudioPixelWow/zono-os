// ============================================================================
// 🎯 Lead Agent — Intent + Routing engines (pure). 29.6. Parts 2 + 7.
// Intent reuses the Lead Twin's inference and strengthens it with links/graph.
// Routing recommends buyer/seller/both/nurture/duplicate/human — NEVER converts
// automatically (conversion is an approval-gated mission proposal). Evidence-only.
// ============================================================================
import { clamp } from "./health";
import type { LeadSignals, IntentResult, Routing, LeadIntent, RoutingTarget } from "./types";

export function computeIntent(sig: LeadSignals): IntentResult {
  let intent: LeadIntent = sig.intent;
  let confidence = clamp(sig.intentConfidence);
  const evidence: string[] = [];

  // Strengthen from existing conversion links / relationship graph.
  if (sig.hasConvertedBuyer && sig.hasConvertedSeller) { intent = "both"; confidence = Math.max(confidence, 95); evidence.push("קיימים קונה ומוכר מקושרים"); }
  else if (sig.hasConvertedBuyer) { intent = "buyer"; confidence = Math.max(confidence, 92); evidence.push("קיים קונה מקושר"); }
  else if (sig.hasConvertedSeller) { intent = "seller"; confidence = Math.max(confidence, 92); evidence.push("קיים מוכר מקושר"); }
  if (sig.source) evidence.push(`מקור: ${sig.source}`);
  if (sig.message) evidence.push(`מסר: ${sig.message.slice(0, 40)}`);
  if (sig.hasProperty) evidence.push("נכס מקושר");
  if (!evidence.length) evidence.push("אין ראיות כוונה חזקות — נדרשת הסמכה");

  const HE: Record<LeadIntent, string> = { buyer: "קונה", seller: "מוכר", both: "קונה+מוכר", investor: "משקיע", renter: "שוכר", unknown: "לא ידוע" };
  return { intent, confidence: clamp(confidence), fit: HE[intent], evidence };
}

export function computeRouting(sig: LeadSignals, it: IntentResult): Routing {
  const cold = sig.classification.includes("ליד קר") || sig.stage === "lost" || sig.stage === "disqualified";
  let target: RoutingTarget; const why: string[] = [];
  if (sig.duplicateRisk >= 60) { target = "duplicate_review"; why.push(`סיכון כפילות ${sig.duplicateRisk}`); }
  else if (cold) { target = "nurture"; why.push("ליד קר/אבוד"); }
  else if (it.intent === "unknown" || it.confidence < 40) { target = "human_review"; why.push(`כוונה לא ברורה (${it.confidence})`); }
  else if (it.intent === "both") { target = "both"; why.push("כוונת קונה+מוכר"); }
  else if (it.intent === "seller") { target = "seller"; why.push("כוונת מכירה"); }
  else { target = "buyer"; why.push(`כוונת ${it.fit}`); }
  return { target, confidence: clamp(it.confidence * 0.7 + (100 - sig.duplicateRisk) * 0.3), why, note: "אין המרה אוטומטית — הצעת ניתוב מחייבת אישור." };
}
