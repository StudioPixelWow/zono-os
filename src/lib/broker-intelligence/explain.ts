// ============================================================================
// 💬 ZONO — BROKER INTELLIGENCE · Recommendation explanation (PURE).
// Phase 5 of the Broker Operating System. Every recommendation must be able to
// answer, in the broker's language: Why now? Why this customer? Why before the
// others? What happens if I ignore it? — plus its expected business value,
// evidence and confidence. Composed DETERMINISTICALLY from the recommendation's
// own real fields (urgency, area, evidence, priority, corroboration, learned
// behavior). No LLM, no fabrication — if a fact isn't there, it isn't claimed.
// ============================================================================
import type { Evidence, IntelligenceArea } from "./types";
import type { PrioritizedRecommendation } from "./priority";

export interface RecommendationExplanation {
  /** Why it's time-critical right now. */
  whyNow: string;
  /** Why this specific entity / recommendation. */
  whyThis: string;
  /** Why it outranks the rest of the queue. */
  whyBeforeOthers: string;
  /** The concrete downside of doing nothing. */
  ifIgnored: string;
  /** Expected business value (straight from the recommendation). */
  expectedValue: string;
  /** The real evidence lines, passed through for display. */
  evidence: Evidence[];
  confidence: number;
}

/** Where this recommendation sits in the live queue (for "why before others"). */
export interface ExplainContext {
  /** 1-based rank in the queue. */
  rank?: number;
  /** Total actionable items in the queue. */
  total?: number;
}

const URGENCY_NOW: Record<PrioritizedRecommendation["urgency"], string> = {
  critical: "דורש טיפול מיידי — חלון ההזדמנות נסגר",
  high: "דחוף להיום — עדיף לפעול לפני שהמצב משתנה",
  medium: "כדאי לטפל היום, לפני שזה הופך דחוף",
  low: "לא בוער, אך שווה טיפול כשמתפנה זמן",
};

// The cost of inaction, honest per intelligence area.
const IGNORE_BY_AREA: Record<IntelligenceArea, string> = {
  acquisition: "מתחרה עלול לחטוף את הנכס — הזדמנות הגיוס תיסגר",
  buyer: "הקונה עלול להתקדם עם סוכן אחר או נכס אחר",
  seller: "סיכון לאובדן הבלעדיות / המוכר — הנכס עלול לעבור למתחרה",
  deal: "העסקה עלולה להיתקע או להתפרק לפני הסגירה",
  daily: "המשימה תישאר פתוחה ותצטבר עם השאר",
  office: "ההשפעה ברמת המשרד תלך ותגדל אם לא יטופל",
};

/** Build the full explanation for one queued recommendation. Pure. */
export function explainRecommendation(
  rec: PrioritizedRecommendation,
  ctx: ExplainContext = {},
): RecommendationExplanation {
  // Timing evidence (from time-sensitive sources) strengthens "why now".
  const timing = rec.evidence.filter((e) => e.source === "timeline" || e.source === "activity");
  const whyNow = timing.length
    ? `${URGENCY_NOW[rec.urgency]}. ${timing.map((e) => e.label).join(" · ")}`
    : URGENCY_NOW[rec.urgency];

  const topEvidence = [...rec.evidence].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
  const whyThis = topEvidence
    ? `${rec.why} העדות החזקה ביותר: ${topEvidence.label}.`
    : rec.why;

  // Why before others: rank + corroboration + learned behavior — all real.
  const parts: string[] = [];
  if (ctx.rank && ctx.total) parts.push(`מדורג #${ctx.rank} מתוך ${ctx.total} לפי השפעה עסקית (עדיפות ${rec.priority}/100)`);
  else parts.push(`עדיפות ${rec.priority}/100 לפי השפעה עסקית`);
  if (rec.mergedCount > 1) parts.push(`${rec.mergedCount} מנועי מודיעין הצביעו על אותה פעולה — ראיות מתכנסות`);
  if ((rec.learningAdjustment ?? 0) > 0) parts.push("היסטוריית הפעולות שלך מראה שאתה נוטה לפעול על המלצות מסוג זה");
  else if ((rec.learningAdjustment ?? 0) < 0) parts.push("היסטוריית הפעולות שלך מורידה מעט את הדחיפות היחסית");
  const whyBeforeOthers = parts.join(" · ") + ".";

  return {
    whyNow,
    whyThis,
    whyBeforeOthers,
    ifIgnored: IGNORE_BY_AREA[rec.area],
    expectedValue: rec.expectedImpact,
    evidence: rec.evidence,
    confidence: rec.confidence,
  };
}
