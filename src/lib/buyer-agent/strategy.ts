// ============================================================================
// 🛒 Buyer Agent — Strategy + Playbook engine (pure). 29.4. Parts 2 + 6.
// Builds an explainable buying strategy (11 types) with an ordered playbook,
// ROI, approvals, alternatives and strategy-change detection. Multi-signal;
// evidence-only; recommendation-only.
// ============================================================================
import { clamp } from "./health";
import type { BuyerSignals, BuyerHealth, MatchIntel, BuyerStrategy, BuyerStrategyType, PlaybookAction, Impact, StrategyChange } from "./types";

const AGGRESSIVE: BuyerStrategyType[] = ["NEGOTIATE", "CLOSE_DEAL", "LAWYER_STAGE"];
interface Cand { s: BuyerStrategyType; score: number; why: string[] }

const LEAD: Record<BuyerStrategyType, { action: string; missionType: string; durationDays: number }> = {
  CLOSE_DEAL: { action: "קדם סגירת עסקה", missionType: "BUYER_CLOSING", durationDays: 7 },
  LAWYER_STAGE: { action: "העבר לשלב עורך דין / חוזה", missionType: "BUYER_DOCUMENTS", durationDays: 10 },
  NEGOTIATE: { action: "נהל משא ומתן על הצעה", missionType: "BUYER_NEGOTIATION", durationDays: 5 },
  FINANCING: { action: "בדוק/סדר מימון ומשכנתא", missionType: "BUYER_QUALIFICATION", durationDays: 14 },
  BOOK_SECOND_VISIT: { action: "קבע ביקור שני בנכס", missionType: "PROPERTY_FOLLOWUP", durationDays: 3 },
  BOOK_VISIT: { action: "קבע ביקור בנכס", missionType: "PROPERTY_FOLLOWUP", durationDays: 3 },
  SEND_PROPERTIES: { action: "שלח נכסים מותאמים", missionType: "PROPERTY_FOLLOWUP", durationDays: 2 },
  COLLECT_INFORMATION: { action: "אסוף מידע חסר על הקונה", missionType: "BUYER_QUALIFICATION", durationDays: 5 },
  CONTACT: { action: "צור קשר עם הקונה", missionType: "BUYER_FOLLOWUP", durationDays: 2 },
  LONG_TERM_NURTURE: { action: "טפח קשר ארוך-טווח", missionType: "BUYER_FOLLOWUP", durationDays: 30 },
  WAIT: { action: "המתן ונטר פעילות", missionType: "BUYER_FOLLOWUP", durationDays: 21 },
};
const OUTCOME: Record<BuyerStrategyType, string> = {
  CLOSE_DEAL: "סגירת עסקה", LAWYER_STAGE: "התקדמות לחוזה", NEGOTIATE: "הסכמה על מחיר/תנאים", FINANCING: "אישור מימון",
  BOOK_SECOND_VISIT: "החלטת רכישה", BOOK_VISIT: "בחינת נכס", SEND_PROPERTIES: "יצירת עניין ולידים", COLLECT_INFORMATION: "פרופיל מדויק",
  CONTACT: "החייאת קשר", LONG_TERM_NURTURE: "שמירת הקשר לעתיד", WAIT: "בשלות טבעית",
};
const APPROVALS: Partial<Record<BuyerStrategyType, string[]>> = { NEGOTIATE: ["מתווך"], CLOSE_DEAL: ["מתווך"], LAWYER_STAGE: ["מתווך", "עורך דין"], FINANCING: ["יועץ משכנתאות"] };

function inferCurrent(sig: BuyerSignals): BuyerStrategyType {
  const b = sig.behavior;
  if (b.offers > 0) return "NEGOTIATE";
  if (b.visits > 0) return "BOOK_SECOND_VISIT";
  if (b.saves > 0) return "SEND_PROPERTIES";
  if (sig.recencyScore <= 20) return "CONTACT";
  return "WAIT";
}

export function computeBuyerStrategy(sig: BuyerSignals, h: BuyerHealth, mi: MatchIntel): BuyerStrategy {
  const b = sig.behavior;
  const strongMatches = mi.perfect.length + mi.emerging.length;
  const cold = sig.classification.includes("קונה קר") || sig.classification.includes("רדום") || h.buyingReadiness < 40;
  const warm = h.buyingReadiness >= 45 && sig.recencyScore > 15 && !cold; // gate transactional strategies
  const cand: Cand[] = [];
  if (b.offers > 0 && h.buyingReadiness >= 60) cand.push({ s: "CLOSE_DEAL", score: 92, why: ["הצעה קיימת + מוכנות גבוהה"] });
  if (b.offers > 0) { cand.push({ s: "NEGOTIATE", score: 85, why: ["הוגשה הצעה"] }); cand.push({ s: "LAWYER_STAGE", score: 72, why: ["התקדמות לחוזה לאחר הסכמה"] }); }
  if (h.buyingReadiness >= 55 && sig.budgetConfidence < 45) cand.push({ s: "FINANCING", score: 78, why: ["מוכנות גבוהה אך ביטחון תקציב נמוך"] });
  if (warm && b.visits >= 1 && b.saves > 0 && b.offers === 0) cand.push({ s: "BOOK_SECOND_VISIT", score: 70, why: ["ביקור + עניין ללא הצעה"] });
  if (warm && b.saves > 0 && b.visits === 0) cand.push({ s: "BOOK_VISIT", score: 68, why: [`${b.saves} נכסים שמורים`] });
  if (warm && h.buyingReadiness >= 50 && strongMatches > 0) cand.push({ s: "SEND_PROPERTIES", score: 66, why: [`${strongMatches} התאמות חזקות`] });
  if (sig.completeness < 55) cand.push({ s: "COLLECT_INFORMATION", score: 64, why: [`שלמות ${sig.completeness}`] });
  if (h.buyingReadiness >= 45 && sig.recencyScore <= 45) cand.push({ s: "CONTACT", score: 60, why: ["קונה פעיל ללא מגע אחרון"] });
  if (sig.classification.includes("קונה קר") || sig.classification.includes("רדום") || h.buyingReadiness < 40) cand.push({ s: "LONG_TERM_NURTURE", score: 55, why: ["מוכנות/מעורבות נמוכה"] });
  if (h.buyingReadiness < 40 && sig.urgency < 40) cand.push({ s: "WAIT", score: 42, why: ["מוכנות ודחיפות נמוכות"] });
  if (!cand.length) cand.push({ s: strongMatches ? "SEND_PROPERTIES" : "COLLECT_INFORMATION", score: 45, why: ["ברירת מחדל"] });

  cand.sort((a, c) => c.score - a.score);
  const top = cand[0];
  const recommendedStrategy = top.s;
  const alternatives = [...new Set(cand.slice(1).map((c) => c.s))].filter((s) => s !== recommendedStrategy).slice(0, 3);
  const currentStrategy = inferCurrent(sig);

  const lead = LEAD[recommendedStrategy];
  const playbook: PlaybookAction[] = [{ order: 1, action: lead.action, missionType: lead.missionType, durationDays: lead.durationDays, why: top.why[0] ?? "" }];
  if (recommendedStrategy !== "SEND_PROPERTIES" && strongMatches > 0) playbook.push({ order: playbook.length + 1, action: "שלח את ההתאמות המובילות", missionType: "PROPERTY_FOLLOWUP", durationDays: 2, why: `${strongMatches} התאמות` });
  if (recommendedStrategy !== "CONTACT" && sig.recencyScore <= 20) playbook.push({ order: playbook.length + 1, action: "חדש קשר עם הקונה", missionType: "BUYER_FOLLOWUP", durationDays: 3, why: "מעורבות יורדת" });
  const expectedDurationDays = playbook.reduce((m, a) => Math.max(m, a.durationDays ?? 0), 0) || null;

  const confidence = clamp(0.4 * h.buyerHealth + 0.3 * top.score + 0.2 * h.buyingConfidence + 0.1 * (sig.truthScore ?? 50));
  const businessImpact: Impact = AGGRESSIVE.includes(recommendedStrategy) || top.score >= 80 ? "high" : top.score >= 60 ? "medium" : "low";

  let signal: StrategyChange; let reason: string;
  if (recommendedStrategy === "CLOSE_DEAL" && b.offers > 0) { signal = "succeeded"; reason = "עסקה בהישג יד"; }
  else if (recommendedStrategy !== currentStrategy) { signal = "switch"; reason = `עבור מ-${currentStrategy} ל-${recommendedStrategy}`; }
  else if (sig.classification.includes("קונה קר") && sig.totalActivities > 0) { signal = "failed"; reason = "הקונה התקרר תחת האסטרטגיה הנוכחית"; }
  else if (h.buyerHealth < 45) { signal = "review"; reason = "בריאות קונה נמוכה"; }
  else { signal = "working"; reason = "האסטרטגיה עובדת"; }

  return {
    currentStrategy, recommendedStrategy, confidence, businessImpact,
    why: top.why, expectedOutcome: OUTCOME[recommendedStrategy], estimatedRoi: businessImpact === "high" ? "קרוב לעסקה — השפעה גבוהה" : businessImpact === "medium" ? "קידום משמעותי במשפך" : "טיפוח",
    playbook, expectedDurationDays, requiredApprovals: APPROVALS[recommendedStrategy] ?? [], alternatives, change: { signal, reason },
  };
}
