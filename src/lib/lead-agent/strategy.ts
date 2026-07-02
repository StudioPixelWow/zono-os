// ============================================================================
// 🎯 Lead Agent — Strategy + Playbook engine (pure). 29.6. Parts 3 + 6 + 8.
// Explainable lead strategy (12 types) with an ordered playbook, mission mapping,
// ROI, approvals, alternatives and change detection. Multi-signal; routing/
// conversion strategies produce approval-gated proposals. Evidence-only.
// ============================================================================
import { clamp } from "./health";
import type { LeadSignals, LeadHealth, IntentResult, LeadStrategy, LeadStrategyType, PlaybookAction, Impact, StrategyChange } from "./types";

const CONVERT: LeadStrategyType[] = ["CONVERT_TO_BUYER", "CONVERT_TO_SELLER", "CONVERT_TO_BOTH"];
interface Cand { s: LeadStrategyType; score: number; why: string[] }

// Ordered playbooks (mission mapping) per recommended strategy (Part 6 examples).
const STEPS: Record<LeadStrategyType, { action: string; missionType: string; durationDays: number }[]> = {
  DEDUPLICATE: [{ action: "סקור כפילויות", missionType: "LEAD_DEDUPLICATION", durationDays: 1 }, { action: "מזג/קשר ידנית", missionType: "LEAD_DEDUPLICATION", durationDays: 2 }, { action: "המשך מהרשומה החזקה", missionType: "LEAD_FOLLOWUP", durationDays: 2 }],
  CONVERT_TO_BUYER: [{ action: "צור קשר עכשיו", missionType: "LEAD_CONVERT_BUYER", durationDays: 1 }, { action: "הסמך תקציב", missionType: "LEAD_QUALIFICATION", durationDays: 2 }, { action: "שלח נכסים מתאימים", missionType: "SEND_PROPERTIES", durationDays: 2 }, { action: "קבע ביקור", missionType: "SCHEDULE_CALL", durationDays: 3 }],
  CONVERT_TO_SELLER: [{ action: "התקשר לליד", missionType: "LEAD_CONVERT_SELLER", durationDays: 1 }, { action: "אסוף פרטי נכס", missionType: "LEAD_QUALIFICATION", durationDays: 2 }, { action: "הכן הערכת שווי", missionType: "SEND_VALUATION", durationDays: 5 }, { action: "קבע פגישת בלעדיות", missionType: "SCHEDULE_CALL", durationDays: 3 }],
  CONVERT_TO_BOTH: [{ action: "צור קשר ומפה צרכים", missionType: "LEAD_CONVERT_BOTH", durationDays: 1 }, { action: "הסמך קנייה ומכירה", missionType: "LEAD_QUALIFICATION", durationDays: 3 }, { action: "שלח נכסים + הערכת שווי", missionType: "SEND_PROPERTIES", durationDays: 3 }],
  QUALIFY: [{ action: "הסמך את הליד — ברר כוונה ותקציב", missionType: "LEAD_QUALIFICATION", durationDays: 2 }, { action: "קבע שיחת המשך", missionType: "SCHEDULE_CALL", durationDays: 3 }],
  CONTACT_NOW: [{ action: "צור קשר ראשוני מיידי", missionType: "LEAD_FOLLOWUP", durationDays: 1 }, { action: "הסמך כוונה", missionType: "LEAD_QUALIFICATION", durationDays: 2 }],
  COLLECT_INFORMATION: [{ action: "אסוף פרטי קשר/מידע חסר", missionType: "LEAD_QUALIFICATION", durationDays: 3 }],
  SEND_PROPERTIES: [{ action: "שלח נכסים מתאימים", missionType: "SEND_PROPERTIES", durationDays: 2 }, { action: "קבע ביקור", missionType: "SCHEDULE_CALL", durationDays: 3 }],
  SEND_VALUATION: [{ action: "הכן ושלח הערכת שווי", missionType: "SEND_VALUATION", durationDays: 5 }, { action: "קבע פגישת מוכר", missionType: "SCHEDULE_CALL", durationDays: 3 }],
  SCHEDULE_CALL: [{ action: "קבע שיחה עם הליד", missionType: "SCHEDULE_CALL", durationDays: 2 }],
  LONG_TERM_NURTURE: [{ action: "הכנס לטיפוח ארוך-טווח", missionType: "LEAD_NURTURE", durationDays: 30 }],
  WAIT: [{ action: "המתן ונטר", missionType: "LEAD_FOLLOWUP", durationDays: 21 }],
};
const OUTCOME: Record<LeadStrategyType, string> = {
  DEDUPLICATE: "רשומה נקייה ומאוחדת", CONVERT_TO_BUYER: "פתיחת תיק קונה", CONVERT_TO_SELLER: "פתיחת תיק מוכר", CONVERT_TO_BOTH: "פתיחת תיק דו-צדדי",
  QUALIFY: "כוונה ואיכות ברורות", CONTACT_NOW: "יצירת קשר ראשוני", COLLECT_INFORMATION: "פרופיל מלא", SEND_PROPERTIES: "עניין ולידים",
  SEND_VALUATION: "בסיס למכירה", SCHEDULE_CALL: "שיחת המשך", LONG_TERM_NURTURE: "שמירת הקשר", WAIT: "בשלות טבעית",
};
const APPROVALS: Partial<Record<LeadStrategyType, string[]>> = { CONVERT_TO_BUYER: ["מתווך"], CONVERT_TO_SELLER: ["מתווך"], CONVERT_TO_BOTH: ["מתווך"] };

function inferCurrent(sig: LeadSignals): LeadStrategyType {
  switch (sig.stage) {
    case "new": return "CONTACT_NOW";
    case "contacted": return "QUALIFY";
    case "qualified": return "CONVERT_TO_BUYER";
    case "nurturing": return "LONG_TERM_NURTURE";
    case "converted": return "CONVERT_TO_BUYER";
    default: return "WAIT";
  }
}

export function computeLeadStrategy(sig: LeadSignals, h: LeadHealth, it: IntentResult): LeadStrategy {
  const cold = sig.classification.includes("ליד קר") || sig.stage === "lost" || sig.stage === "disqualified";
  const qualified = sig.stage === "qualified" || sig.stage === "nurturing";
  const contacted = sig.stage === "contacted" || qualified;
  const cand: Cand[] = [];
  if (sig.duplicateRisk >= 60) cand.push({ s: "DEDUPLICATE", score: 92, why: [`סיכון כפילות ${sig.duplicateRisk}`] });
  if (sig.contactRisk >= 70) cand.push({ s: "COLLECT_INFORMATION", score: 80, why: ["חסרים פרטי קשר"] });
  else if (sig.completeness < 50) cand.push({ s: "COLLECT_INFORMATION", score: 66, why: [`שלמות ${sig.completeness}`] });
  if (!cold && qualified && it.confidence >= 55 && sig.contactRisk < 70) {
    if (it.intent === "both") cand.push({ s: "CONVERT_TO_BOTH", score: 88, why: ["כוונת קונה+מוכר + מוסמך"] });
    else if (it.intent === "seller") cand.push({ s: "CONVERT_TO_SELLER", score: 85, why: ["כוונת מכירה + מוסמך"] });
    else if (["buyer", "investor", "renter"].includes(it.intent)) cand.push({ s: "CONVERT_TO_BUYER", score: 85, why: ["כוונת קנייה + מוסמך"] });
  }
  if (!cold && contacted && ["buyer", "investor", "renter"].includes(it.intent)) cand.push({ s: "SEND_PROPERTIES", score: 70, why: ["כוונת קנייה — שלח נכסים"] });
  if (!cold && contacted && it.intent === "seller") cand.push({ s: "SEND_VALUATION", score: 70, why: ["כוונת מכירה — שלח הערכה"] });
  if (sig.conversionProbability >= 65 && (sig.stage === "new" || sig.stage === "contacted")) cand.push({ s: "SCHEDULE_CALL", score: 74, why: ["ליד חם — קבע שיחה"] });
  if (sig.stage === "new" && sig.contactRisk < 70) cand.push({ s: "CONTACT_NOW", score: 72, why: ["ליד חדש עם פרטי קשר"] });
  if (it.intent === "unknown" || sig.stage === "new" || sig.stage === "contacted") cand.push({ s: "QUALIFY", score: 64, why: ["נדרשת הסמכה"] });
  if (cold || sig.conversionProbability < 30) cand.push({ s: "LONG_TERM_NURTURE", score: 55, why: ["ליד קר"] });
  if (sig.urgency < 30 && sig.conversionProbability < 40) cand.push({ s: "WAIT", score: 40, why: ["דחיפות/המרה נמוכות"] });
  if (!cand.length) cand.push({ s: "QUALIFY", score: 50, why: ["ברירת מחדל — הסמכה"] });

  cand.sort((a, c) => c.score - a.score);
  const top = cand[0];
  const recommendedStrategy = top.s;
  const alternatives = [...new Set(cand.slice(1).map((c) => c.s))].filter((s) => s !== recommendedStrategy).slice(0, 3);
  const currentStrategy = inferCurrent(sig);

  const steps = STEPS[recommendedStrategy];
  const playbook: PlaybookAction[] = steps.map((st, i) => ({ order: i + 1, action: st.action, missionType: st.missionType, durationDays: st.durationDays, why: i === 0 ? (top.why[0] ?? "") : "" }));
  const expectedDurationDays = playbook.reduce((m, a) => Math.max(m, a.durationDays ?? 0), 0) || null;

  const confidence = clamp(0.4 * h.leadHealth + 0.3 * top.score + 0.2 * it.confidence + 0.1 * (sig.truthScore ?? 50));
  const businessImpact: Impact = CONVERT.includes(recommendedStrategy) || top.score >= 82 ? "high" : top.score >= 60 ? "medium" : "low";

  let signal: StrategyChange; let reason: string;
  if (sig.stage === "converted") { signal = "succeeded"; reason = "הליד הומר"; }
  else if (recommendedStrategy !== currentStrategy) { signal = "switch"; reason = `עבור מ-${currentStrategy} ל-${recommendedStrategy}`; }
  else if (cold && sig.totalActivities > 0) { signal = "failed"; reason = "הליד התקרר תחת האסטרטגיה הנוכחית"; }
  else if (h.leadHealth < 45) { signal = "review"; reason = "בריאות ליד נמוכה"; }
  else { signal = "working"; reason = "האסטרטגיה עובדת"; }

  return {
    currentStrategy, recommendedStrategy, confidence, businessImpact,
    why: top.why, expectedOutcome: OUTCOME[recommendedStrategy], estimatedRoi: businessImpact === "high" ? "המרה/ניקוי בעל ערך גבוה" : businessImpact === "medium" ? "קידום במשפך" : "טיפוח",
    playbook, expectedDurationDays, requiredApprovals: APPROVALS[recommendedStrategy] ?? [], alternatives, change: { signal, reason },
  };
}
