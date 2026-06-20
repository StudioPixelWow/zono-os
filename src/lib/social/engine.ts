/**
 * Social Intent Engine — deterministic, client-safe, NO LLM. Classifies the
 * intent of a social interaction from its text + type and produces lead-quality
 * scores. Keyword-driven (Hebrew + English). Used to build social leads.
 */

export type SocialIntent =
  | "asking_price" | "asking_location" | "asking_viewing" | "asking_details"
  | "seller_interest" | "buyer_interest" | "investor_interest" | "commercial_interest"
  | "negative" | "spam" | "unknown";

export const INTENT_LABEL: Record<SocialIntent, string> = {
  asking_price: "שאלת מחיר", asking_location: "שאלת מיקום", asking_viewing: "בקשת ביקור", asking_details: "בקשת פרטים",
  seller_interest: "מעוניין למכור", buyer_interest: "מעוניין לקנות", investor_interest: "מעוניין להשקיע", commercial_interest: "עניין מסחרי",
  negative: "שלילי", spam: "ספאם", unknown: "לא ידוע",
};

const KW: Record<SocialIntent, string[]> = {
  asking_viewing: ["לראות", "ביקור", "סיור", "לתאם", "מתי אפשר", "viewing", "tour", "visit", "לבקר"],
  buyer_interest: ["מחפש", "מעוניין לקנות", "רוצה לקנות", "מתעניין", "לרכוש", "buying", "interested", "פנוי"],
  seller_interest: ["למכור", "אני מוכר", "יש לי דירה", "מעוניין למכור", "selling", "for sale by owner"],
  investor_interest: ["השקעה", "תשואה", "להשקיע", "investment", "yield", "roi", "משקיע"],
  commercial_interest: ["מסחרי", "משרד", "חנות", "commercial", "office", "עסק"],
  asking_price: ["מחיר", "כמה עולה", "כמה", "עלות", "price", "cost", "₪"],
  asking_location: ["איפה", "כתובת", "מיקום", "באיזה", "where", "location", "address"],
  asking_details: ["פרטים", "מידע", "עוד מידע", "details", "info", "חדרים", "מ\"ר", "קומה", "מ״ר"],
  negative: ["יקר מדי", "לא מעוניין", "גרוע", "לא רלוונטי", "not interested", "too expensive", "overpriced"],
  spam: ["follow me", "עקבו", "promo", "מבצע!!!", "sale!!!", "bit.ly", "click here", "win", "free money"],
  unknown: [],
};
// Priority order — first match wins (strongest commercial intent first).
const ORDER: SocialIntent[] = ["spam", "negative", "asking_viewing", "seller_interest", "buyer_interest", "investor_interest", "commercial_interest", "asking_price", "asking_location", "asking_details"];

const has = (text: string, kws: string[]) => kws.some((k) => text.includes(k));

export interface IntentResult {
  intent: SocialIntent;
  intentConfidence: number;   // 0..100
  leadQuality: number;        // 0..100
  urgencyScore: number;       // 0..100
  intentScore: number;        // 0..100
  leadProbability: number;    // 0..100
  engagementLevel: "low" | "medium" | "high";
}

const TYPE_ENGAGEMENT: Record<string, number> = {
  message: 100, dm_future: 100, message_future: 100, manual_interest: 90, phone_call: 95, form_lead: 100,
  comment: 70, share: 50, reaction: 25,
};

export function detectIntent(text: string | null, interactionType: string): IntentResult {
  const t = (text ?? "").toLowerCase();
  let intent: SocialIntent = "unknown";
  for (const i of ORDER) { if (has(t, KW[i])) { intent = i; break; } }
  // Explicit interest types override weak/unknown text.
  if (intent === "unknown" && (interactionType === "manual_interest" || interactionType === "form_lead" || interactionType === "phone_call")) intent = "buyer_interest";

  const baseQuality: Record<SocialIntent, number> = {
    asking_viewing: 88, buyer_interest: 82, seller_interest: 80, investor_interest: 76, commercial_interest: 72,
    asking_price: 64, asking_details: 58, asking_location: 55, unknown: 35, negative: 8, spam: 2,
  };
  const baseUrgency: Record<SocialIntent, number> = {
    asking_viewing: 85, buyer_interest: 70, seller_interest: 68, investor_interest: 55, commercial_interest: 52,
    asking_price: 60, asking_details: 45, asking_location: 50, unknown: 25, negative: 10, spam: 0,
  };
  const engagementPct = TYPE_ENGAGEMENT[interactionType] ?? 40;
  const engagementLevel: "low" | "medium" | "high" = engagementPct >= 90 ? "high" : engagementPct >= 60 ? "medium" : "low";

  const matchedCount = ORDER.filter((i) => has(t, KW[i])).length;
  const intentConfidence = intent === "unknown" ? 30 : Math.min(100, 55 + matchedCount * 12 + (t.length > 20 ? 8 : 0));
  const leadQuality = Math.round(baseQuality[intent] * 0.7 + engagementPct * 0.3);
  const urgency = baseUrgency[intent];
  const intentScore = intent === "spam" || intent === "negative" ? Math.round(baseQuality[intent]) : Math.round(baseQuality[intent] * 0.6 + intentConfidence * 0.4);
  const leadProbability = intent === "spam" || intent === "negative" ? 2 : Math.round(leadQuality * 0.6 + intentConfidence * 0.2 + engagementPct * 0.2);

  return { intent, intentConfidence, leadQuality: Math.max(0, Math.min(100, leadQuality)), urgencyScore: urgency, intentScore, leadProbability, engagementLevel };
}

/** Map a social intent to a CRM lead intent enum. */
export function toLeadIntent(intent: SocialIntent): "buyer" | "seller" | "investor" | "unknown" {
  if (intent === "seller_interest") return "seller";
  if (intent === "investor_interest" || intent === "commercial_interest") return "investor";
  if (intent === "buyer_interest" || intent === "asking_viewing" || intent === "asking_price" || intent === "asking_details" || intent === "asking_location") return "buyer";
  return "unknown";
}

export function recommendedAction(intent: SocialIntent): string {
  switch (intent) {
    case "asking_viewing": return "תאם ביקור מיידי";
    case "buyer_interest": return "צור קשר והצג נכסים מתאימים";
    case "seller_interest": return "צור קשר להערכת שווי וגיוס";
    case "investor_interest": return "שלח ניתוח תשואה ונכסי השקעה";
    case "commercial_interest": return "הצג נכסים מסחריים מתאימים";
    case "asking_price": return "מסור מחיר ושאל על צרכים";
    case "asking_details": case "asking_location": return "מסור פרטים והעבר לשיחה";
    case "negative": return "סמן ולמד מההתנגדות";
    case "spam": return "סמן כספאם והתעלם";
    default: return "סקור ידנית";
  }
}
