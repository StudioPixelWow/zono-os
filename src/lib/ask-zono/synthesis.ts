// ============================================================================
// 💬 Ask ZONO — Answer Synthesis + Explainability + Follow-ups + Actions (pure).
// 30.1. Parts 4 + 5 + 6 + 7. Turns normalized engine results into one executive
// answer with reasoning, evidence, recommendations, approval-gated action
// proposals, risks, opportunities, confidence, explainability and follow-ups.
// Evidence-only; every action is a proposal (never executed).
// ============================================================================
import type { QueryUnderstanding, ContextPlan, EngineResult, AskAnswer, ProposedAction, IntentType, EngineId } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const FOLLOWUPS: Record<IntentType, string[]> = {
  DAILY_PRIORITIES: ["אילו מוכרים בסיכון נטישה?", "אילו הזדמנויות עסקה פתוחות?", "מה מצב המשימות החסומות?"],
  SELLERS_AT_RISK: ["מה תוכנית השימור לכל מוכר?", "אילו מהם כוללים קונים ממתינים?", "אילו נכסים דורשים הורדת מחיר?"],
  BUYERS_CLOSING: ["אילו נכסים מתאימים לקונים החמים?", "אילו מוכרים מוכנים תואמים?", "מה השלב הבא לכל קונה?"],
  LISTINGS_PRICE_REDUCTION: ["מה פער המחיר מול הערכת השווי?", "אילו נכסים מתיישנים?", "אילו קונים חמים מתאימים לנכסים אלו?"],
  RECRUIT_LOCATION: ["באילו אזורים יש קיבולת פנויה?", "מי המתווכים בעומס יתר?", "מה אסטרטגיית הצמיחה המומלצת?"],
  COMPETITION: ["אילו מתחרים בצמיחה?", "היכן איבדנו נתח שוק?", "אילו הזדמנויות הרחבה קיימות?"],
  VALUATION: ["אילו נכסים מתומחרים יתר?", "מה מצב השוק בעיר?", "אילו נכסים בריאים למכירה מהירה?"],
  MISSIONS: ["אילו משימות ממתינות לאישור?", "מה תור העדיפויות היום?", "אילו משימות חסומות?"],
  LEADS: ["אילו לידים חמים להמרה?", "אילו לידים כפולים לטיפול?", "לאן לנתב כל ליד?"],
  OPPORTUNITIES: ["אילו עסקאות פוטנציאליות בעדיפות גבוהה?", "אילו קונפליקטים דורשים הכרעה?", "מה תוכנית הביצוע המאוחדת?"],
  OFFICE_STATUS: ["מה בריאות המלאי?", "היכן לגייס מתווכים?", "אילו סיכונים עסקיים קיימים?"],
  GENERAL_STATUS: ["מה עליי לעשות היום?", "אילו סיכונים קריטיים?", "אילו הזדמנויות פתוחות?"],
  UNKNOWN: ["מה עליי לעשות היום?", "אילו מוכרים בסיכון?", "אילו קונים קרובים לסגירה?"],
};

// Approval-gated action proposals per intent (Part 7) — never executed.
function proposeActions(intent: IntentType, results: EngineResult[]): ProposedAction[] {
  const top = results.flatMap((r) => r.items).slice(0, 3);
  const mk = (kind: ProposedAction["kind"], title: string, reason: string, missionType: string | null, entityType: string | null): ProposedAction => ({ kind, title, reason, entityType, entityId: null, missionType, requiresApproval: true });
  switch (intent) {
    case "SELLERS_AT_RISK": return top.map((i) => mk("mission", `הצעת משימת שימור: ${i.title}`, "מוכר בסיכון נטישה", "SELLER_RETENTION", "seller"));
    case "BUYERS_CLOSING": return top.map((i) => mk("mission", `הצעת משימת האצה לסגירה: ${i.title}`, "קונה קרוב לסגירה", "BUYER_CLOSE", "buyer"));
    case "LISTINGS_PRICE_REDUCTION": return top.map((i) => mk("mission", `הצעת המלצת תמחור: ${i.title}`, "נדרשת בחינת מחיר", "LISTING_PRICE_REVIEW", "property"));
    case "LEADS": return top.map((i) => mk("task", `הצעת מעקב ליד: ${i.title}`, "טיפול/ניתוב ליד", "LEAD_FOLLOWUP", "lead"));
    case "RECRUIT_LOCATION": case "OFFICE_STATUS": return top.map((i) => mk("mission", `הצעת החלטת משרד: ${i.title}`, "החלטת צמיחה", "OFFICE_DECISION", "office"));
    case "OPPORTUNITIES": case "DAILY_PRIORITIES": return top.map((i) => mk("mission", `הצעת פעולה: ${i.title}`, "פריט בעדיפות גבוהה", "ORCHESTRATED_PLAN", "office"));
    default: return [];
  }
}

export function synthesizeAnswer(u: QueryUnderstanding, plan: ContextPlan, results: EngineResult[]): AskAnswer {
  const sourceEngines: EngineId[] = results.map((r) => r.engine);
  const allItems = results.flatMap((r) => r.items);
  const evidence = results.flatMap((r) => r.evidence).slice(0, 12);
  const confidence = results.length ? clamp((results.reduce((n, r) => n + r.confidence, 0) / results.length) * 0.7 + u.confidence * 0.3) : clamp(u.confidence * 0.5);

  const limitations: string[] = [];
  if (u.intent === "UNKNOWN") limitations.push("לא זוהתה כוונה ברורה — נסח מחדש או בחר שאלה מוצעת.");
  if (!results.length && u.intent !== "UNKNOWN") limitations.push("המנועים לא החזירו נתונים — ייתכן שאין נתונים רלוונטיים עדיין.");
  for (const r of results) if (!r.items.length) limitations.push(`${r.engine}: אין פריטים תואמים.`);
  limitations.push("התשובה מבוססת אך ורק על פלטי המנועים הקיימים — ללא המצאות.");

  let executiveAnswer: string;
  if (u.intent === "UNKNOWN") executiveAnswer = "לא הצלחתי לזהות את הכוונה בשאלה. אפשר לנסח מחדש, או לבחור אחת מהשאלות המוצעות למטה.";
  else if (!results.length) executiveAnswer = "אין כרגע נתונים רלוונטיים מהמנועים לשאלה זו.";
  else {
    const head = results.map((r) => r.headline).filter(Boolean).join(" · ");
    const topLine = allItems.slice(0, 3).map((i) => i.title).join(" · ");
    executiveAnswer = `${head}${topLine ? ` — ${topLine}` : ""}`.trim();
  }

  const recommendations = allItems.slice(0, 5).map((i) => `${i.title}${i.detail ? ` — ${i.detail}` : ""}`);
  const risks = allItems.filter((i) => /סיכון|בסיכון|קריטי|נטישה|חסום|מתיישן|פער/.test(`${i.title} ${i.detail}`)).slice(0, 4).map((i) => i.title);
  const opportunities = allItems.filter((i) => /הזדמנות|עסקה|חם|מוכן|מנוף|צמיחה|הרחבה/.test(`${i.title} ${i.detail}`)).slice(0, 4).map((i) => i.title);
  const actions = proposeActions(u.intent, results);

  const reasoning = `${plan.reason} זוהתה כוונה "${u.intent}" (ביטחון ${u.confidence}%). נטענו רק המנועים הנדרשים: ${sourceEngines.join(", ") || "—"}.`;
  const why = `השאלה סווגה כ-"${u.questionType}" עם כוונה "${u.intent}"; הופעלו ${sourceEngines.length} מנועים רלוונטיים בלבד.`;

  return {
    executiveAnswer, reasoning, evidence, recommendations, actions, risks, opportunities, confidence,
    explain: { why, sourceEngines, evidence, confidence, limitations },
    followUps: FOLLOWUPS[u.intent] ?? FOLLOWUPS.UNKNOWN,
  };
}
