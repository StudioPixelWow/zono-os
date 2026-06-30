// ============================================================================
// 🧩 Reasoning Modes (pure). Phase 27.3 · Part 5.
// ----------------------------------------------------------------------------
// All 11 modes consume the SAME ContextPackage. Each maps to one of the AI
// Reasoning Gateway's primitive AIModes and carries a short instruction the
// gateway appends. No mode is allowed to invent — the gateway's hallucination
// guard still applies. Deterministic. No AI, no DB.
// ============================================================================
import type { AIMode } from "@/lib/ai-reasoning/types";
import type { ReasoningMode } from "./types";

export const REASONING_MODES: ReasoningMode[] = [
  "explain", "compare", "recommend", "summarize", "analyze",
  "prioritize", "forecast", "risk", "contradiction", "decision", "scenario",
];

// Each reasoning mode → a gateway primitive (explain | summarize | compare | answer).
const MODE_TO_AI: Record<ReasoningMode, AIMode> = {
  explain: "explain", summarize: "summarize", compare: "compare",
  recommend: "answer", analyze: "answer", prioritize: "answer",
  forecast: "answer", risk: "answer", contradiction: "answer",
  decision: "answer", scenario: "answer",
};
export function modeToAIMode(mode: ReasoningMode): AIMode { return MODE_TO_AI[mode]; }

// Short Hebrew instruction surfaced into the user prompt for each mode.
const MODE_INSTRUCTION: Record<ReasoningMode, string> = {
  explain: "הסבר את התשובה בהתבסס אך ורק על הראיות שסופקו.",
  summarize: "סכם בקצרה את הראיות שסופקו, ללא הוספת מידע חדש.",
  compare: "השווה בין הישויות בראיות בלבד; ציין הבדלים מבוססי-ראיה.",
  recommend: "המלץ על צעד מבוסס-ראיות; אם הראיות חסרות — אמור זאת.",
  analyze: "נתח את הראיות שסופקו וזהה דפוסים מבוססי-ראיה בלבד.",
  prioritize: "דרג לפי דחיפות/חשיבות מבוססת-ראיות שסופקו בלבד.",
  forecast: "הערך מגמה רק אם הראיות תומכות; אחרת ציין חוסר ודאות.",
  risk: "זהה סיכונים הנתמכים בראיות; אל תמציא סיכונים ללא ביסוס.",
  contradiction: "אתר סתירות בין פריטי הראיות; אם אין — אמור שאין.",
  decision: "ספק תמיכה בהחלטה: בעד/נגד מבוסס-ראיות בלבד.",
  scenario: "תאר תרחיש רק אם הראיות תומכות בהנחותיו.",
};
export function modeInstruction(mode: ReasoningMode): string { return MODE_INSTRUCTION[mode]; }

// Infer a default mode from the question wording (bilingual).
const MODE_HINTS: { mode: ReasoningMode; re: RegExp }[] = [
  { mode: "compare", re: /compare|versus|\bvs\b|better|השוו|מול|עדיף|לעומת/i },
  { mode: "recommend", re: /recommend|should\s+i|advise|suggest|המלץ|כדאי|להמליץ|מה\s+לעשות/i },
  { mode: "summarize", re: /summari|tl;?dr|overview|סכם|סיכום|תקציר/i },
  { mode: "prioritize", re: /priorit|most\s+important|first|דרג|עדיפות|הכי\s+חשוב|קודם/i },
  { mode: "forecast", re: /forecast|predict|will|future|trend|תחזית|צפי|עתיד|מגמה/i },
  { mode: "risk", re: /risk|danger|threat|exposure|סיכון|סכנה|איום|חשיפה/i },
  { mode: "contradiction", re: /contradict|inconsist|conflict|סתיר|אי[\s-]?עקבי|התנגש/i },
  { mode: "decision", re: /decide|decision|choose|go\s*\/\s*no|החלט|להחליט|לבחור/i },
  { mode: "scenario", re: /scenario|what\s+if|simulate|תרחיש|מה\s+אם|סימול/i },
  { mode: "analyze", re: /analyz|analyse|breakdown|נתח|ניתוח|פירוק/i },
];
export function inferMode(question: string): ReasoningMode {
  const q = question ?? "";
  for (const h of MODE_HINTS) if (h.re.test(q)) return h.mode;
  return "explain";
}
