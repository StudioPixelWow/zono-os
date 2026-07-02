// ============================================================================
// 🏷️ Seller Agent — Strategy + Playbook engine (pure). 29.5. Parts 2 + 6.
// Explainable selling strategy (12 types) with an ordered playbook, mission
// mapping, ROI, approvals, alternatives and change detection. Multi-signal
// (seller readiness + property/valuation + market + buyer demand); a price cut
// is seller-aligned (flexibility-gated). Recommendation-only; evidence-only.
// ============================================================================
import { clamp } from "./health";
import type { SellerSignals, SellerHealth, BuyerConnection, SellerStrategy, SellerStrategyType, PlaybookAction, Impact, StrategyChange } from "./types";

const AGGRESSIVE: SellerStrategyType[] = ["PRICE_REDUCTION", "NEGOTIATE", "AGREEMENT"];
interface Cand { s: SellerStrategyType; score: number; why: string[] }

const LEAD: Record<SellerStrategyType, { action: string; missionType: string; durationDays: number }> = {
  AGREEMENT: { action: "החתם על הסכם התקשרות", missionType: "LISTING_AGREEMENT", durationDays: 3 },
  NEGOTIATE: { action: "נהל משא ומתן מול קונה", missionType: "SELLER_NEGOTIATION", durationDays: 5 },
  PRICE_REDUCTION: { action: "התכנס עם המוכר להורדת מחיר לכיוון ההערכה", missionType: "PRICE_REVIEW", durationDays: 5 },
  PRICE_ALIGNMENT: { action: "ישר ציפיות מחיר עם CMA", missionType: "PRICE_REVIEW", durationDays: 5 },
  VALUATION_UPDATE: { action: "קבע עדכון הערכת שווי / CMA", missionType: "VALUATION_REVIEW", durationDays: 14 },
  LIST_PROPERTY: { action: "העלה את הנכס לשיווק", missionType: "PROPERTY_PREPARATION", durationDays: 5 },
  MARKETING_PREPARATION: { action: "הכן חומרי שיווק וצילום", missionType: "MARKETING_REFRESH", durationDays: 7 },
  LAUNCH_MARKETING: { action: "השק שיווק ממומן", missionType: "MARKETING_LAUNCH", durationDays: 7 },
  OPEN_HOUSE: { action: "ארגן בית פתוח", missionType: "OPEN_HOUSE", durationDays: 7 },
  SELLER_MEETING: { action: "קבע פגישת יישור ציפיות עם המוכר", missionType: "SELLER_FOLLOWUP", durationDays: 3 },
  LONG_TERM_NURTURE: { action: "טפח קשר ארוך-טווח", missionType: "SELLER_FOLLOWUP", durationDays: 30 },
  WAIT: { action: "המתן ונטר", missionType: "SELLER_FOLLOWUP", durationDays: 21 },
};
const OUTCOME: Record<SellerStrategyType, string> = {
  AGREEMENT: "בלעדיות + התחלת שיווק", NEGOTIATE: "הסכמה על עסקה", PRICE_REDUCTION: "האצת מכירה", PRICE_ALIGNMENT: "ציפיות ריאליות",
  VALUATION_UPDATE: "בסיס תמחור מדויק", LIST_PROPERTY: "נכס פעיל בשוק", MARKETING_PREPARATION: "מוכנות שיווקית", LAUNCH_MARKETING: "חשיפה ולידים",
  OPEN_HOUSE: "ריכוז מתעניינים", SELLER_MEETING: "יישור ציפיות והסרת חסמים", LONG_TERM_NURTURE: "שמירת הקשר", WAIT: "בשלות טבעית",
};
const APPROVALS: Partial<Record<SellerStrategyType, string[]>> = {
  PRICE_REDUCTION: ["מוכר"], PRICE_ALIGNMENT: ["מוכר"], AGREEMENT: ["מוכר"], SELLER_MEETING: ["מוכר"], NEGOTIATE: ["מוכר"],
  MARKETING_PREPARATION: ["תקציב שיווק"], LAUNCH_MARKETING: ["תקציב שיווק"],
};

function inferCurrent(sig: SellerSignals): SellerStrategyType {
  const p = sig.property;
  const listed = p.hasProperty && (p.status === "active" || p.status === "published");
  if (sig.behavior.agreements > 0 && !listed) return "LIST_PROPERTY";
  if (listed) return "LAUNCH_MARKETING";
  if (sig.hasSignedAgreement) return "LIST_PROPERTY";
  if (sig.motivation >= 55) return "SELLER_MEETING";
  return "WAIT";
}

export function computeSellerStrategy(sig: SellerSignals, h: SellerHealth, bc: BuyerConnection): SellerStrategy {
  const p = sig.property;
  const listed = p.hasProperty && (p.status === "active" || p.status === "published");
  const flex = sig.priceFlexibility;
  const cold = sig.classification.includes("בסיכון נטישה") || sig.classification.includes("רדום") || sig.motivation < 40;
  const marketWeak = p.domBand === "slow" || p.domBand === "very_slow" || (p.buyerDemandScore ?? 100) < 40;
  const valAbove = p.valuationPosition === "above" && (p.valuationConfidence === "high" || p.valuationConfidence === "medium");
  const weakValuation = p.valuationPosition === "unknown" || p.valuationConfidence === "none" || p.valuationConfidence === "low";

  const cand: Cand[] = [];
  if (sig.readinessToSign >= 65 && !sig.hasSignedAgreement) cand.push({ s: "AGREEMENT", score: 90, why: ["מוכנות גבוהה לחתימה"] });
  if (sig.hasSignedAgreement && !listed) cand.push({ s: "LIST_PROPERTY", score: 84, why: ["חתום אך הנכס לא בשיווק"] });
  if (bc.priorityBuyers.length > 0 && listed && sig.readinessToSign >= 50) cand.push({ s: "NEGOTIATE", score: 82, why: [`${bc.priorityBuyers.length} קונים בעדיפות`] });
  if (valAbove && marketWeak) {
    if (flex == null || flex >= 35) cand.push({ s: "PRICE_REDUCTION", score: 86, why: ["מחיר מעל ההערכה + ביצוע שוק חלש", "המוכר גמיש"] });
    else cand.push({ s: "PRICE_ALIGNMENT", score: 84, why: ["מחיר מעל ההערכה אך המוכר מתנגד — יישור ציפיות"] });
  } else if (valAbove) cand.push({ s: "PRICE_ALIGNMENT", score: 66, why: ["מחיר מעל ההערכה אך השוק סביר"] });
  if (sig.churnRisk >= 55 || sig.trust < 40) cand.push({ s: "SELLER_MEETING", score: 80, why: ["סיכון נטישה/אמון נמוך"] });
  if (weakValuation) cand.push({ s: "VALUATION_UPDATE", score: 62, why: ["הערכת שווי חלשה/חסרה"] });
  if (listed && p.campaignActive !== true && !cold) cand.push({ s: "LAUNCH_MARKETING", score: 70, why: ["נכס פעיל ללא קמפיין"] });
  if (listed && p.campaignActive === false) cand.push({ s: "MARKETING_PREPARATION", score: 64, why: ["נדרשת הכנת שיווק"] });
  if (listed && (p.buyerDemandScore ?? 0) >= 65) cand.push({ s: "OPEN_HOUSE", score: 66, why: ["ביקוש גבוה לנכס"] });
  if (cold) cand.push({ s: "LONG_TERM_NURTURE", score: 55, why: ["מוטיבציה/מעורבות נמוכה"] });
  if (sig.motivation < 40 && sig.urgency < 40) cand.push({ s: "WAIT", score: 42, why: ["מוטיבציה ודחיפות נמוכות"] });
  if (!cand.length) cand.push({ s: sig.hasSignedAgreement ? "LAUNCH_MARKETING" : "SELLER_MEETING", score: 48, why: ["ברירת מחדל"] });

  cand.sort((a, c) => c.score - a.score);
  const top = cand[0];
  const recommendedStrategy = top.s;
  const alternatives = [...new Set(cand.slice(1).map((c) => c.s))].filter((s) => s !== recommendedStrategy).slice(0, 3);
  const currentStrategy = inferCurrent(sig);

  const lead = LEAD[recommendedStrategy];
  const playbook: PlaybookAction[] = [{ order: 1, action: lead.action, missionType: lead.missionType, durationDays: lead.durationDays, why: top.why[0] ?? "" }];
  if (recommendedStrategy !== "VALUATION_UPDATE" && weakValuation) playbook.push({ order: playbook.length + 1, action: "עדכן הערכת שווי לבסיס תמחור", missionType: "VALUATION_REVIEW", durationDays: 14, why: "הערכה חלשה/חסרה" });
  if (recommendedStrategy !== "NEGOTIATE" && bc.priorityBuyers.length > 0) playbook.push({ order: playbook.length + 1, action: "חבר לקונים בעדיפות", missionType: "SELLER_NEGOTIATION", durationDays: 5, why: `${bc.priorityBuyers.length} קונים` });
  const expectedDurationDays = playbook.reduce((m, a) => Math.max(m, a.durationDays ?? 0), 0) || null;

  const confidence = clamp(0.4 * h.sellerHealth + 0.3 * top.score + 0.2 * h.readinessToSign + 0.1 * (sig.truthScore ?? 50));
  const businessImpact: Impact = AGGRESSIVE.includes(recommendedStrategy) || top.score >= 80 ? "high" : top.score >= 60 ? "medium" : "low";

  let signal: StrategyChange; let reason: string;
  if (recommendedStrategy === "AGREEMENT" && sig.readinessToSign >= 65) { signal = "succeeded"; reason = "בלעדיות בהישג יד"; }
  else if (recommendedStrategy !== currentStrategy) { signal = "switch"; reason = `עבור מ-${currentStrategy} ל-${recommendedStrategy}`; }
  else if (sig.churnRisk >= 60) { signal = "failed"; reason = "המוכר בסיכון נטישה תחת האסטרטגיה הנוכחית"; }
  else if (h.sellerHealth < 45) { signal = "review"; reason = "בריאות מוכר נמוכה"; }
  else { signal = "working"; reason = "האסטרטגיה עובדת"; }

  return {
    currentStrategy, recommendedStrategy, confidence, businessImpact,
    why: top.why, expectedOutcome: OUTCOME[recommendedStrategy], estimatedRoi: businessImpact === "high" ? "קרוב לבלעדיות/עסקה — השפעה גבוהה" : businessImpact === "medium" ? "קידום משמעותי בתהליך" : "טיפוח",
    playbook, expectedDurationDays, requiredApprovals: APPROVALS[recommendedStrategy] ?? [], alternatives, change: { signal, reason },
  };
}
