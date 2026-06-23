// ============================================================================
// ZONO — Lead INTENT engine (pure, client + server safe, deterministic).
// ----------------------------------------------------------------------------
// Classifies a Hebrew comment into a buyer/seller/question/spam intent with a
// 0–100 score and sentiment, and extracts a phone number when present. No model
// and no network — heuristics over keyword signals, so it runs anywhere and is
// unit-testable. The Lead Detection service turns high-intent comments into leads.
// ============================================================================

export type CommentIntent = "buyer" | "seller" | "question" | "spam" | "none";
export type CommentSentiment = "positive" | "neutral" | "negative";

export interface IntentResult {
  intent: CommentIntent;
  intentScore: number;        // 0–100
  sentiment: CommentSentiment;
  isLead: boolean;            // intent is buyer/seller AND score ≥ threshold
  phone: string | null;       // extracted Israeli phone, normalized
}

const BUYER = ["מעוניין", "מעוניינת", "אשמח לפרטים", "פרטים בבקשה", "מחיר", "כמה עולה", "פנוי", "זמין", "לקנות", "לרכוש", "אפשר לראות", "לתאם ביקור", "סיור", "טלפון", "צרו קשר", "מתאים לי", "רלוונטי"];
const SELLER = ["יש לי דירה", "אני מוכר", "אני מוכרת", "למכור", "נכס למכירה", "מעוניין למכור", "שמאות", "להציע נכס"];
const QUESTION = ["?", "האם", "מתי", "איפה", "כמה חדרים", "קומה", "ועד בית", "ארנונה", "חניה"];
const SPAM = ["הלוואה", "קזינו", "הימור", "ויאגרה", "ביטקוין", "crypto", "investment plan", "follow me", "earn money", "🔞"];
const NEG = ["יקר מדי", "לא מעוניין", "נמכר כבר", "גרוע", "רמאות", "לא רציני"];
const POS = ["מעולה", "יפה", "מושלם", "אשמח", "תודה", "נהדר", "מדהים", "מעוניין"];

const has = (text: string, words: string[]) => words.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0);

/** Extract a normalized Israeli phone (05XXXXXXXX) from free text, if present. */
export function extractPhone(text: string): string | null {
  const m = text.replace(/[^\d+]/g, " ").match(/(?:\+?972|0)\s*5\d(?:\s*\d){7}/);
  if (!m) return null;
  let d = m[0].replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d.length === 10 && d.startsWith("05") ? d : null;
}

/** Classify a single comment. Threshold defaults to 55 for lead promotion. */
export function detectIntent(text: string | null | undefined, leadThreshold = 55): IntentResult {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return { intent: "none", intentScore: 0, sentiment: "neutral", isLead: false, phone: null };

  const phone = extractPhone(t);
  const spam = has(t, SPAM);
  if (spam >= 1) return { intent: "spam", intentScore: Math.min(100, 60 + spam * 15), sentiment: "negative", isLead: false, phone: null };

  const buyer = has(t, BUYER), seller = has(t, SELLER), question = has(t, QUESTION);
  const pos = has(t, POS), neg = has(t, NEG);
  const sentiment: CommentSentiment = neg > pos ? "negative" : pos > 0 ? "positive" : "neutral";

  // Score: strongest signal wins, phone presence is a strong buyer indicator.
  let intent: CommentIntent = "none";
  let score = 0;
  if (seller >= buyer && seller > 0) { intent = "seller"; score = 50 + seller * 14; }
  else if (buyer > 0) { intent = "buyer"; score = 45 + buyer * 13; }
  else if (question > 0) { intent = "question"; score = 30 + question * 8; }
  if (phone) { score += 22; if (intent === "none" || intent === "question") intent = "buyer"; }
  if (neg) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const isLead = (intent === "buyer" || intent === "seller") && score >= leadThreshold;
  return { intent, intentScore: score, sentiment, isLead, phone };
}
