// ============================================================================
// ZONO — Comment classifier / Lead Detection (pure, client + server safe).
// ----------------------------------------------------------------------------
// Deterministic Hebrew classification of a Facebook-group comment into one of 10
// categories + sentiment + a 0–100 lead-intent score + a SAFE suggested reply +
// should_create_lead + a short reason. No model, no network — so it is instant,
// reliable, and (critically for the QA rules) CANNOT invent phone numbers,
// prices, property details, promises or availability. Suggested replies come
// from a fixed, vetted template set of short Hebrew group-appropriate replies.
// ============================================================================

export type CommentCategory =
  | "asks_for_price" | "asks_for_details" | "asks_for_location" | "asks_for_photos"
  | "asks_for_phone" | "asks_for_viewing" | "interested" | "not_relevant" | "spam" | "negative" | "broker_comment";

export type CommentSentiment = "positive" | "neutral" | "negative";

export interface CommentAnalysis {
  category: CommentCategory;
  sentiment: CommentSentiment;
  leadIntentScore: number;     // 0–100
  suggestedReply: string;      // safe, short Hebrew — never fabricates data
  shouldCreateLead: boolean;
  reason: string;              // short Hebrew rationale
}

// ── Safe suggested replies (no invented phone / price / details / promises) ──
const REPLIES: Record<CommentCategory, string> = {
  asks_for_price: "שלחתי לך את הפרטים בפרטי 🙂",
  asks_for_details: "בשמחה — אפשר להשאיר טלפון ואחזור אליך עם כל הפרטים?",
  asks_for_location: "שלחתי לך פרטים בפרטי, אשמח להמשיך שם 🙂",
  asks_for_photos: "אשלח לך את כל התמונות בוואטסאפ — אפשר טלפון?",
  asks_for_phone: "אשמח לחזור אליך — אפשר להשאיר טלפון בפרטי?",
  asks_for_viewing: "בשמחה לתאם צפייה — אפשר להשאיר טלפון ואחזור אליך לתיאום?",
  interested: "מעולה! אפשר להשאיר טלפון ואחזור אליך עם הפרטים?",
  not_relevant: "",
  spam: "",
  negative: "",
  broker_comment: "",
};

const REASONS: Record<CommentCategory, string> = {
  asks_for_price: "שואל/ת על מחיר — כוונת רכישה גבוהה",
  asks_for_details: "מבקש/ת פרטים על הנכס",
  asks_for_location: "שואל/ת על מיקום/כתובת",
  asks_for_photos: "מבקש/ת תמונות נוספות",
  asks_for_phone: "מבקש/ת ליצור קשר טלפוני",
  asks_for_viewing: "מבקש/ת לתאם צפייה/ביקור — כוונת רכישה גבוהה",
  interested: "מביע/ה התעניינות בנכס",
  not_relevant: "תגובה כללית ולא רלוונטית",
  spam: "נראה כספאם/פרסומת",
  negative: "תגובה שלילית",
  broker_comment: "נראה כתגובה של מתווך/ת אחר/ת",
};

const has = (t: string, words: string[]) => words.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);

const PRICE = ["מחיר", "כמה עולה", "כמה זה", "כמה מבקשים", "עלות", "₪", "ש\"ח", "שח"];
const DETAILS = ["פרטים", "מידע", "כמה חדרים", "מטר", "מ\"ר", "קומה", "ועד בית", "ארנונה", "שטח", "מצב הנכס", "שנת בנייה"];
const LOCATION = ["איפה", "כתובת", "מיקום", "באיזה אזור", "באיזו שכונה", "רחוב", "היכן"];
const PHOTOS = ["תמונות", "תמונה", "תמונות נוספות", "אפשר לראות", "סרטון", "וידאו"];
const PHONE = ["טלפון", "נייד", "מספר", "תתקשר", "תקשרי", "צור קשר", "ליצור קשר", "וואטסאפ", "whatsapp"];
const VIEWING = ["לבוא לראות", "להגיע לראות", "לצפות", "צפייה", "צפיה", "ביקור", "לתאם", "תיאום", "לבקר", "מתי אפשר לראות", "אפשר לבוא", "רוצה לראות את הדירה", "רוצה לראות את הנכס"];
const INTEREST = ["מעוניין", "מעוניינת", "מתאים לי", "רלוונטי", "אשמח", "נשמע מעולה", "אשמח לפרטים", "סגור", "בא לי"];
const BROKER = ["מתווך", "מתווכת", "תיווך", "סוכן נדל", "משרד תיווך", "בלעדיות שלי", "יש לי דירה דומה"];
const SPAM = ["הלוואה", "קזינו", "הימור", "ביטקוין", "crypto", "earn money", "follow me", "השקעה בטוחה", "רווח מובטח", "🔞"];
const NEG = ["יקר מדי", "לא מעוניין", "נמכר כבר", "גרוע", "רמאות", "לא רציני", "מופרז", "צחוק"];
const POS = ["מעולה", "יפה", "מושלם", "אשמח", "תודה", "נהדר", "מדהים", "וואו", "חלום"];

const SCORE: Record<CommentCategory, number> = {
  asks_for_phone: 92, asks_for_viewing: 90, asks_for_price: 86, interested: 80, asks_for_photos: 72,
  asks_for_details: 70, asks_for_location: 64, broker_comment: 20, negative: 18,
  not_relevant: 10, spam: 2,
};

/** Classify one comment. `leadThreshold` = min score to suggest creating a lead. */
export function classifyComment(text: string | null | undefined, leadThreshold = 60): CommentAnalysis {
  const raw = (text ?? "").trim();
  const t = raw.toLowerCase();
  const isQuestion = raw.includes("?") || /\b(האם|כמה|איפה|מתי|אפשר)\b/.test(raw);

  let category: CommentCategory;
  if (!raw) category = "not_relevant";
  else if (has(t, SPAM) >= 1) category = "spam";
  else if (has(t, BROKER) >= 1) category = "broker_comment";
  else if (has(t, PHONE) >= 1) category = "asks_for_phone";
  else if (has(t, PRICE) >= 1) category = "asks_for_price";
  else if (has(t, VIEWING) >= 1) category = "asks_for_viewing";
  else if (has(t, PHOTOS) >= 1) category = "asks_for_photos";
  else if (has(t, LOCATION) >= 1) category = "asks_for_location";
  else if (has(t, DETAILS) >= 1 || (isQuestion && raw.length > 4)) category = "asks_for_details";
  else if (has(t, INTEREST) >= 1) category = "interested";
  else if (has(t, NEG) > has(t, POS) && has(t, NEG) >= 1) category = "negative";
  else category = "not_relevant";

  const pos = has(t, POS), neg = has(t, NEG);
  const sentiment: CommentSentiment =
    category === "negative" || neg > pos ? "negative" : pos > 0 || category === "interested" ? "positive" : "neutral";

  let score = SCORE[category];
  if (sentiment === "positive" && category !== "spam") score = Math.min(100, score + 6);
  if (sentiment === "negative") score = Math.max(0, score - 10);

  const isLeadCategory = !["spam", "not_relevant", "negative", "broker_comment"].includes(category);
  const shouldCreateLead = isLeadCategory && score >= leadThreshold;

  return {
    category, sentiment, leadIntentScore: score,
    suggestedReply: REPLIES[category], shouldCreateLead, reason: REASONS[category],
  };
}

/** Hot lead = a high-intent, lead-worthy comment (for the "Hot leads" section). */
export function isHotLead(a: { category?: string | null; leadIntentScore?: number; lead_intent_score?: number }): boolean {
  const score = a.leadIntentScore ?? a.lead_intent_score ?? 0;
  const cat = a.category ?? "";
  return score >= 80 && !["spam", "not_relevant", "negative", "broker_comment"].includes(cat);
}
