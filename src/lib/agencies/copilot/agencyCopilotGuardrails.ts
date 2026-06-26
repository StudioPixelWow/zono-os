// ============================================================================
// ZONO — PHASE 26.10: AI Copilot guardrails (PURE, client-safe).
// Reject or redirect questions that ask for private/sensitive data, illegal
// scraping/hacking/spying, or certainty where only probability exists. The
// Copilot only reasons over public/imported/stored ZONO data.
// ============================================================================
import type { GuardrailResult, AgencyCopilotAnswer, AgencyCopilotIntent } from "./agencyCopilotTypes";

export const GUARDRAIL_MESSAGE =
  "אני יכול לנתח רק מידע ציבורי/מיובא/שמור במערכת, ולא מידע פרטי או לא מורשה.";

// Disallowed-intent signals (Hebrew + English). Matched case-insensitively.
const PRIVATE_DATA = [
  "מספר טלפון פרטי", "טלפון אישי", "טלפון האישי", "הטלפון האישי", "טלפון נייד", "כתובת מגורים", "כתובת הבית", "תעודת זהות", "תעודת־זהות",
  "מספר זהות", "מספר ת.ז", "ת\"ז", "חשבון בנק", "מספר חשבון", "משכורת של", "כמה מרוויח",
  "הכנסה אישית", "מידע אישי", "פרטים אישיים", "מידע פרטי", "home address", "phone number", "id number", "bank account", "salary of",
];
const ILLEGAL = [
  "לפרוץ", "פריצה", "להאק", "האקינג", "לרגל", "ריגול", "להאזין", "האזנה", "לעקוב אחרי",
  "לגנוב", "סיסמה", "סיסמא", "קוד גישה", "לסרוק את האתר", "סקרייפינג", "גרידה לא חוקית",
  "hack", "hacking", "exploit", "scrape", "scraping", "spy on", "wiretap", "steal", "password",
];
const FALSE_CERTAINTY = [
  "בוודאות מוחלטת", "ב-100%", "ב100%", "תבטיח לי", "מובטח לחלוטין", "בלי שום ספק",
  "guarantee", "100% certain", "with absolute certainty",
];

function hit(text: string, list: string[]): string | null {
  const t = text.toLowerCase();
  for (const k of list) if (t.includes(k.toLowerCase())) return k;
  return null;
}

/** Decide whether a question is answerable. */
export function checkAgencyCopilotGuardrails(question: string): GuardrailResult {
  const q = (question ?? "").trim();
  if (!q) return { allowed: false, reason: "empty", message: "לא זוהתה שאלה. נסה לנסח שאלה על מתחרים, אזורים או אותות שוק." };
  if (hit(q, PRIVATE_DATA)) return { allowed: false, reason: "private_data", message: GUARDRAIL_MESSAGE };
  if (hit(q, ILLEGAL)) return { allowed: false, reason: "illegal", message: GUARDRAIL_MESSAGE };
  if (hit(q, FALSE_CERTAINTY))
    return {
      allowed: false, reason: "false_certainty",
      message: "אני מנתח מגמות והסתברויות על בסיס הנתונים הקיימים במערכת — לא ודאות מוחלטת. אפשר לשאול אותי איזה מתחרה הכי חזק/מסוכן או היכן יש הזדמנות.",
    };
  return { allowed: true };
}

/** Build a structured, guardrail-compliant rejection answer. */
export function buildGuardrailAnswer(intent: AgencyCopilotIntent, message: string): AgencyCopilotAnswer {
  return {
    answer: message,
    confidence: 0,
    intent,
    entities: [],
    highlights: [],
    recommendations: [],
    missing_data: [],
    source_summary: [],
  };
}
